#!/usr/bin/env python3
"""Creates Zapbar's three App Store tips through the App Store Connect API. Runs on the dev machine; idempotent.

The same product IDs as Play (scripts/play/products.py): non-consumable, any tier unlocks every perk. Prices are
the Netherlands price points nearest to €2, €5 and €10 (the lower one on a tie), available everywhere.
--screenshot PNG uploads that image as the App Review screenshot of every tip, replacing any existing one (the
tip jar in Settings, from the simulator). Left for the owner: selecting the tips on the version page for their
first review. Nothing secret is printed.

Usage: python3 apps/remote/scripts/ios_iap.py [--screenshot PNG]
"""
import argparse
import hashlib
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from ios_listing import APP_ID, call_quiet  # noqa: E402
from ios_profile import call  # noqa: E402

TIPS = [("supporter_2", 2, "Small tip"), ("supporter_5", 5, "Medium tip"), ("supporter_10", 10, "Big tip")]
DESCRIPTION = "Unlocks the badge, colours and silly perks"
REVIEW_NOTE = "Optional tip. Unlocks cosmetic perks only (badge, accent colours, fonts, silly toggles)."
LOCALE = "en-US"
BASE_TERRITORY = "NLD"
API = "https://api.appstoreconnect.apple.com"


def nearest_point(points: list[tuple[str, float]], target: float) -> str:
    """The id of the price nearest to target; on a tie, the lower price."""
    return min(points, key=lambda p: (abs(p[1] - target), p[1]))[0]


def exists(path: str) -> dict | None:
    try:
        return call_quiet("GET", path)
    except LookupError:
        return None


def all_pages(path: str) -> list[dict]:
    out: list[dict] = []
    while path:
        r = call("GET", path)
        out += r["data"]
        nxt = r.get("links", {}).get("next")
        path = nxt[len(API):] if nxt else ""
    return out


def ensure_iap(product_id: str, title: str) -> str:
    found = call("GET", f"/v1/apps/{APP_ID}/inAppPurchasesV2?filter[productId]={product_id}")["data"]
    if found:
        return found[0]["id"]
    r = call("POST", "/v2/inAppPurchases", {"data": {"type": "inAppPurchases", "attributes": {
        "name": title, "productId": product_id, "inAppPurchaseType": "NON_CONSUMABLE", "reviewNote": REVIEW_NOTE},
        "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}}}})
    return r["data"]["id"]


def ensure_localization(iap: str, title: str) -> None:
    locs = call("GET", f"/v2/inAppPurchases/{iap}/inAppPurchaseLocalizations")["data"]
    if any(x["attributes"]["locale"] == LOCALE for x in locs):
        return
    call("POST", "/v1/inAppPurchaseLocalizations", {"data": {"type": "inAppPurchaseLocalizations",
        "attributes": {"locale": LOCALE, "name": title, "description": DESCRIPTION},
        "relationships": {"inAppPurchaseV2": {"data": {"type": "inAppPurchases", "id": iap}}}}})


def ensure_price(iap: str, eur: float) -> str:
    sched = exists(f"/v2/inAppPurchases/{iap}/iapPriceSchedule")
    if sched and sched.get("data"):
        return "kept"
    points = all_pages(f"/v2/inAppPurchases/{iap}/pricePoints?filter[territory]={BASE_TERRITORY}&limit=200")
    point = nearest_point([(p["id"], float(p["attributes"]["customerPrice"])) for p in points], eur)
    price = next(p["attributes"]["customerPrice"] for p in points if p["id"] == point)
    call("POST", "/v1/inAppPurchasePriceSchedules", {
        "data": {"type": "inAppPurchasePriceSchedules", "relationships": {
            "inAppPurchase": {"data": {"type": "inAppPurchases", "id": iap}},
            "baseTerritory": {"data": {"type": "territories", "id": BASE_TERRITORY}},
            "manualPrices": {"data": [{"type": "inAppPurchasePrices", "id": "${p}"}]}}},
        "included": [{"type": "inAppPurchasePrices", "id": "${p}", "attributes": {"startDate": None},
                      "relationships": {"inAppPurchasePricePoint": {"data": {"type": "inAppPurchasePricePoints", "id": point}}}}]})
    return f"€{price}"


def ensure_available(iap: str, territories: list[str]) -> None:
    av = exists(f"/v2/inAppPurchases/{iap}/inAppPurchaseAvailability")
    if av and av.get("data"):
        return
    call("POST", "/v1/inAppPurchaseAvailabilities", {"data": {"type": "inAppPurchaseAvailabilities",
        "attributes": {"availableInNewTerritories": True}, "relationships": {
            "inAppPurchase": {"data": {"type": "inAppPurchases", "id": iap}},
            "availableTerritories": {"data": [{"type": "territories", "id": t} for t in territories]}}}})


def ensure_review_screenshot(iap: str, png: pathlib.Path) -> None:
    import urllib.request
    old = exists(f"/v2/inAppPurchases/{iap}/appStoreReviewScreenshot")
    if old and old.get("data"):
        call("DELETE", f"/v1/inAppPurchaseAppStoreReviewScreenshots/{old['data']['id']}")
    data = png.read_bytes()
    shot = call("POST", "/v1/inAppPurchaseAppStoreReviewScreenshots", {"data": {
        "type": "inAppPurchaseAppStoreReviewScreenshots", "attributes": {"fileName": png.name, "fileSize": len(data)},
        "relationships": {"inAppPurchaseV2": {"data": {"type": "inAppPurchases", "id": iap}}}}})["data"]
    for op in shot["attributes"]["uploadOperations"]:
        req = urllib.request.Request(op["url"], data=data[op["offset"]:op["offset"] + op["length"]], method=op["method"],
                                     headers={h["name"]: h["value"] for h in op["requestHeaders"]})
        urllib.request.urlopen(req, timeout=120).read()
    call("PATCH", f"/v1/inAppPurchaseAppStoreReviewScreenshots/{shot['id']}", {"data": {
        "type": "inAppPurchaseAppStoreReviewScreenshots", "id": shot["id"],
        "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(data).hexdigest()}}})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--screenshot", type=pathlib.Path, help="App Review screenshot for every tip")
    args = ap.parse_args()
    territories = [t["id"] for t in all_pages("/v1/territories?limit=200")]
    for product_id, eur, title in TIPS:
        iap = ensure_iap(product_id, title)
        ensure_localization(iap, title)
        price = ensure_price(iap, eur)
        ensure_available(iap, territories)
        if args.screenshot:
            ensure_review_screenshot(iap, args.screenshot)
        state = call("GET", f"/v2/inAppPurchases/{iap}")["data"]["attributes"]["state"]
        print(f"{product_id}: {title}, price {price}, {state}")


if __name__ == "__main__":
    main()
