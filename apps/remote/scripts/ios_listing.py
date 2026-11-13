#!/usr/bin/env python3
"""Writes Zapbar's App Store listing to App Store Connect. Runs on the dev machine; idempotent.

Text comes from docs/release/listing-ios.md, version and build number from app.json. It sets the version
string and copyright, the app name, attaches the matching processed build, and writes the description, keywords, URLs,
category, content rights, age rating (none of the content questions apply), a free price, availability in
every territory and the App Review contact (copied from the team's other app, email support@zapbar.app).
It does not submit for review, and it cannot set App Privacy: Apple has no API for that.

Screenshots (6.9", 1320x2868) are uploaded from docs/release/graphics/ios/ in file-name order, replacing the set.

--build pins the version and build to submit (e.g. --build 1.1.2:10102) instead of app.json, which follows the
checked-out branch and may already be ahead of what is going to review.

Usage: python3 apps/remote/scripts/ios_listing.py [--build VERSION:BUILD] [--video URL] [--screenshots]
"""
import argparse
import hashlib
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from ios_profile import call  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
APP_ID = "6824589391"
OTHER_APP_ID = "6824479371"  # You Can't Catch Me: same owner, its review contact is reused
LOCALE = "en-US"
SITE = "https://zapbar.app"
EMAIL = "support@zapbar.app"
COPYRIGHT = "2026 Code 418"
LIMITS = {"Name": 30, "Subtitle": 30, "Keywords": 100, "Promotional text": 170, "Description": 4000}
ENUM_NONE = ["alcoholTobaccoOrDrugUseOrReferences", "contests", "gamblingSimulated", "horrorOrFearThemes",
             "matureOrSuggestiveThemes", "medicalOrTreatmentInformation", "profanityOrCrudeHumor",
             "sexualContentGraphicAndNudity", "sexualContentOrNudity", "violenceCartoonOrFantasy",
             "violenceRealistic", "violenceRealisticProlongedGraphicOrSadistic", "gunsOrOtherWeapons"]
BOOL_FALSE = ["healthOrWellnessTopics", "advertising", "gambling", "lootBox", "messagingAndChat", "parentalControls", "ageAssurance",
              "socialMedia", "unrestrictedWebAccess", "userGeneratedContent"]


def sections() -> dict[str, str]:
    text = (ROOT / "docs/release/listing-ios.md").read_text()
    parts = re.split(r"^## (.+)$", text, flags=re.M)
    out = {parts[i].strip(): parts[i + 1].strip() for i in range(1, len(parts), 2)}
    for name, limit in LIMITS.items():
        if len(out[name]) > limit:
            sys.exit(f"ios_listing: {name} is {len(out[name])} chars, limit {limit}")
    return out


def body(kind: str, id_: str | None = None, attrs: dict | None = None, rels: dict | None = None) -> dict:
    data: dict = {"type": kind}
    if id_:
        data["id"] = id_
    if attrs:
        data["attributes"] = attrs
    if rels:
        data["relationships"] = {k: {"data": v} for k, v in rels.items()}
    return {"data": data}


def editable_version() -> dict:
    versions = call("GET", f"/v1/apps/{APP_ID}/appStoreVersions?filter[platform]=IOS")["data"]
    live = [v for v in versions if v["attributes"]["appStoreState"] in ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED")]
    if not live:
        sys.exit("ios_listing: no editable App Store version")
    return live[0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", help="screen recording URL for App Review")
    ap.add_argument("--build", help="VERSION:BUILD to attach instead of app.json's, e.g. 1.1.2:10102")
    ap.add_argument("--screenshots", action="store_true", help="replace the 6.9-inch screenshots from docs/release/graphics/ios")
    args = ap.parse_args()
    s = sections()
    expo = json.loads((ROOT / "apps/remote/app.json").read_text())["expo"]
    if args.build and not re.fullmatch(r"\d+\.\d+\.\d+:\d+", args.build):
        sys.exit("ios_listing: --build takes VERSION:BUILD, e.g. 1.1.2:10102")
    version, build_no = args.build.split(":") if args.build else (expo["version"], expo["ios"]["buildNumber"])

    v = editable_version()
    vid = v["id"]
    call("PATCH", f"/v1/appStoreVersions/{vid}",
         body("appStoreVersions", vid, {"versionString": version, "copyright": COPYRIGHT}))
    builds = call("GET", f"/v1/builds?filter[app]={APP_ID}&filter[version]={build_no}&filter[processingState]=VALID")["data"]
    if not builds:
        sys.exit(f"ios_listing: build {build_no} is not processed yet")
    call("PATCH", f"/v1/appStoreVersions/{vid}/relationships/build", {"data": {"type": "builds", "id": builds[0]["id"]}})

    loc = next(x for x in call("GET", f"/v1/appStoreVersions/{vid}/appStoreVersionLocalizations")["data"]
               if x["attributes"]["locale"] == LOCALE)
    call("PATCH", f"/v1/appStoreVersionLocalizations/{loc['id']}", body("appStoreVersionLocalizations", loc["id"], {
        "description": s["Description"], "keywords": s["Keywords"], "promotionalText": s["Promotional text"],
        "supportUrl": f"{SITE}/support", "marketingUrl": SITE}))

    info = next(x for x in call("GET", f"/v1/apps/{APP_ID}/appInfos")["data"]
                if x["attributes"]["appStoreState"] != "READY_FOR_SALE")
    iloc = next(x for x in call("GET", f"/v1/appInfos/{info['id']}/appInfoLocalizations")["data"]
                if x["attributes"]["locale"] == LOCALE)
    call("PATCH", f"/v1/appInfoLocalizations/{iloc['id']}", body("appInfoLocalizations", iloc["id"], {
        "name": s["Name"], "subtitle": s["Subtitle"], "privacyPolicyUrl": f"{SITE}/privacy"}))
    call("PATCH", f"/v1/appInfos/{info['id']}", body("appInfos", info["id"], rels={
        "primaryCategory": {"type": "appCategories", "id": "MUSIC"}}))
    call("PATCH", f"/v1/apps/{APP_ID}", body("apps", APP_ID, {"contentRightsDeclaration": "DOES_NOT_USE_THIRD_PARTY_CONTENT"}))

    age = call("GET", f"/v1/appInfos/{info['id']}/ageRatingDeclaration")["data"]
    call("PATCH", f"/v1/ageRatingDeclarations/{age['id']}", body("ageRatingDeclarations", age["id"],
         {**{k: "NONE" for k in ENUM_NONE}, **{k: False for k in BOOL_FALSE}}))

    ensure_free()
    ensure_available()
    review_contact(vid, s["Review notes"], args.video)
    if args.screenshots:
        upload_screenshots(loc["id"])

    got = call("GET", f"/v1/appStoreVersions/{vid}")["data"]["attributes"]["versionString"]
    got_build = call("GET", f"/v1/appStoreVersions/{vid}/build")["data"]["attributes"]["version"]
    if (got, got_build) != (version, build_no):
        sys.exit(f"ios_listing: read back {got} ({got_build}), expected {version} ({build_no})")
    print(f"listing: {version} ({build_no}) attached (read back); text, category, age rating, price, availability and review contact set")
    print("left: App Privacy ('Data Not Collected') in the web UI if not published, then submit")


def ensure_free() -> None:
    try:
        call_quiet("GET", f"/v1/appPriceSchedules/{APP_ID}/manualPrices")
        return
    except LookupError:
        pass
    free = next(p for p in call("GET", f"/v1/apps/{APP_ID}/appPricePoints?filter[territory]=USA&limit=5")["data"]
                if p["attributes"]["customerPrice"] in ("0.0", "0"))
    call("POST", "/v1/appPriceSchedules", {
        "data": {"type": "appPriceSchedules", "relationships": {
            "app": {"data": {"type": "apps", "id": APP_ID}},
            "baseTerritory": {"data": {"type": "territories", "id": "USA"}},
            "manualPrices": {"data": [{"type": "appPrices", "id": "${free}"}]}}},
        "included": [{"type": "appPrices", "id": "${free}", "attributes": {"startDate": None},
                      "relationships": {"appPricePoint": {"data": {"type": "appPricePoints", "id": free["id"]}}}}]})


def ensure_available() -> None:
    try:
        call_quiet("GET", f"/v1/apps/{APP_ID}/appAvailabilityV2")
        return
    except LookupError:
        pass
    territories = [t["id"] for t in call("GET", "/v1/territories?limit=200")["data"]]
    call("POST", "/v2/appAvailabilities", {
        "data": {"type": "appAvailabilities", "attributes": {"availableInNewTerritories": True}, "relationships": {
            "app": {"data": {"type": "apps", "id": APP_ID}},
            "territoryAvailabilities": {"data": [{"type": "territoryAvailabilities", "id": f"${{{t}}}"} for t in territories]}}},
        "included": [{"type": "territoryAvailabilities", "id": f"${{{t}}}", "attributes": {"available": True},
                      "relationships": {"territory": {"data": {"type": "territories", "id": t}}}} for t in territories]})


def call_quiet(method: str, path: str) -> dict:
    import urllib.error
    import urllib.request
    from ios_profile import token
    req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, method=method,
                                 headers={"Authorization": "Bearer " + token()})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise LookupError(path) from e
        raise


def review_contact(vid: str, notes: str, video: str | None) -> None:
    notes = notes.replace("{video}", video) if video else "\n".join(l for l in notes.splitlines() if "{video}" not in l)
    other = call("GET", f"/v1/apps/{OTHER_APP_ID}/appStoreVersions?limit=1")["data"][0]
    src = call("GET", f"/v1/appStoreVersions/{other['id']}/appStoreReviewDetail")["data"]["attributes"]
    attrs = {"contactFirstName": src["contactFirstName"], "contactLastName": src["contactLastName"],
             "contactPhone": src["contactPhone"], "contactEmail": EMAIL, "demoAccountRequired": False,
             "notes": re.sub(r"\n{3,}", "\n\n", notes)}
    current = call("GET", f"/v1/appStoreVersions/{vid}/appStoreReviewDetail").get("data")
    if current:
        call("PATCH", f"/v1/appStoreReviewDetails/{current['id']}", body("appStoreReviewDetails", current["id"], attrs))
    else:
        call("POST", "/v1/appStoreReviewDetails", body("appStoreReviewDetails", attrs=attrs, rels={
            "appStoreVersion": {"type": "appStoreVersions", "id": vid}}))


SCREENSHOT_TYPE = "APP_IPHONE_67"  # the 6.9-inch slot; takes 1320x2868


def upload_screenshots(loc_id: str) -> None:
    import urllib.request
    files = sorted((ROOT / "docs/release/graphics/ios").glob("*.png"))
    sets = call("GET", f"/v1/appStoreVersionLocalizations/{loc_id}/appScreenshotSets")["data"]
    existing = next((x for x in sets if x["attributes"]["screenshotDisplayType"] == SCREENSHOT_TYPE), None)
    if existing:
        for shot in call("GET", f"/v1/appScreenshotSets/{existing['id']}/appScreenshots")["data"]:
            call("DELETE", f"/v1/appScreenshots/{shot['id']}")
        set_id = existing["id"]
    else:
        set_id = call("POST", "/v1/appScreenshotSets", body("appScreenshotSets", attrs={"screenshotDisplayType": SCREENSHOT_TYPE},
                      rels={"appStoreVersionLocalization": {"type": "appStoreVersionLocalizations", "id": loc_id}}))["data"]["id"]
    for f in files:
        data = f.read_bytes()
        shot = call("POST", "/v1/appScreenshots", body("appScreenshots", attrs={"fileName": f.name, "fileSize": len(data)},
                    rels={"appScreenshotSet": {"type": "appScreenshotSets", "id": set_id}}))["data"]
        for op in shot["attributes"]["uploadOperations"]:
            part = data[op["offset"]:op["offset"] + op["length"]]
            req = urllib.request.Request(op["url"], data=part, method=op["method"],
                                         headers={h["name"]: h["value"] for h in op["requestHeaders"]})
            urllib.request.urlopen(req, timeout=120).read()
        call("PATCH", f"/v1/appScreenshots/{shot['id']}", body("appScreenshots", shot["id"],
             {"uploaded": True, "sourceFileChecksum": hashlib.md5(data).hexdigest()}))
        print(f"screenshot: {f.name} uploaded")


if __name__ == "__main__":
    main()
