#!/usr/bin/env python3
"""Read-only App Store Connect state: versions, IAPs, a build's beta review (argv[1], default 10201). Run from apps/remote/scripts."""
import sys
sys.path.insert(0, ".")
from ios_profile import call
from ios_listing import APP_ID
BUILD = sys.argv[1] if len(sys.argv) > 1 else "10201"
v = call("GET", f"/v1/apps/{APP_ID}/appStoreVersions?limit=5")["data"]
for x in v: print("version", x["attributes"]["versionString"], x["attributes"]["appStoreState"], x["attributes"].get("releaseType"))
for x in call("GET", f"/v1/apps/{APP_ID}/inAppPurchasesV2")["data"]: print("iap", x["attributes"]["productId"], x["attributes"]["state"])
b = call("GET", f"/v1/builds?filter[app]={APP_ID}&filter[version]={BUILD}&include=betaAppReviewSubmission")
for x in b["data"]: print(f"build {BUILD}", x["attributes"]["processingState"])
for x in b.get("included", []): print("beta review", x["attributes"].get("betaReviewState"))
