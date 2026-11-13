"""Shared Play Developer API helpers for Zapbar. Every read happens in a throwaway edit that is deleted."""
import json
import os
import subprocess

PACKAGE = "app.zapbar.remote"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"
TIPS = [("supporter_2", 2, "Small tip"), ("supporter_5", 5, "Medium tip"), ("supporter_10", 10, "Big tip")]


def credentials_json():
    env = os.environ.get("ANDROID_PUBLISHER_CREDENTIALS")
    if env:
        return env
    out = subprocess.run(["claudify-secret", "get", "PLAY_SERVICE_ACCOUNT_JSON", "sonora"], capture_output=True, text=True, timeout=30)
    if out.returncode != 0 or not out.stdout.strip():
        raise SystemExit("no Play credentials available")
    return out.stdout


def service():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    creds = service_account.Credentials.from_service_account_info(json.loads(credentials_json()), scopes=[SCOPE])
    return build("androidpublisher", "v3", credentials=creds, cache_discovery=False)


def _with_edit(svc, package, fn):
    edit = svc.edits().insert(packageName=package, body={}).execute()
    try:
        return fn(edit["id"])
    finally:
        svc.edits().delete(packageName=package, editId=edit["id"]).execute()


def track_release(svc, package, track):
    """What Play says is on a track: version codes and release statuses."""
    def read(edit_id):
        t = svc.edits().tracks().get(packageName=package, editId=edit_id, track=track).execute()
        return {"versionCodes": [c for r in t.get("releases", []) for c in r.get("versionCodes", [])],
                "status": [r.get("status") for r in t.get("releases", [])]}
    return _with_edit(svc, package, read)


def max_version_code(svc, package):
    """Highest versionCode on any track, 0 when nothing has been released."""
    def read(edit_id):
        tracks = svc.edits().tracks().list(packageName=package, editId=edit_id).execute().get("tracks", [])
        codes = [int(c) for t in tracks for r in t.get("releases", []) for c in r.get("versionCodes", [])]
        return max(codes, default=0)
    return _with_edit(svc, package, read)


LISTING_LANGUAGES = ("en-GB", "en-US")  # en-GB is the app's default language in Play Console
TIP_DESCRIPTION = "Thanks for supporting Zapbar. Unlocks the supporter badge, accent colours and Comic Neue."


def tip_products(conversions, regions_version):
    """The three one-time, non-consumable tips (monetization.onetimeproducts). Any tier unlocks every perk.

    conversions maps sku -> monetization.convertRegionPrices response for that tip's EUR amount. Eurozone
    regions get the exact round euro amount (Play prices there include VAT); every other region gets
    Play's own conversion.
    """
    products = []
    for sku, eur, title in TIPS:
        conv = conversions[sku]
        regional = []
        for region, c in sorted(conv["convertedRegionPrices"].items()):
            price = c["price"]
            if price["currencyCode"] == "EUR":
                price = {"currencyCode": "EUR", "units": str(eur)}
            regional.append({"regionCode": region, "price": price, "availability": "AVAILABLE"})
        other = conv["convertedOtherRegionsPrice"]
        products.append({
            "packageName": PACKAGE,
            "productId": sku,
            "listings": [{"languageCode": lang, "title": f"{title} (€{eur})", "description": TIP_DESCRIPTION}
                         for lang in LISTING_LANGUAGES],
            "regionsVersion": regions_version,
            "purchaseOptions": [{
                "purchaseOptionId": "buy",
                "buyOption": {"legacyCompatible": True, "multiQuantityEnabled": False},
                "regionalPricingAndAvailabilityConfigs": regional,
                "newRegionsConfig": {"availability": "AVAILABLE",
                                     "eurPrice": other["eurPrice"], "usdPrice": other["usdPrice"]},
            }],
        })
    return products
