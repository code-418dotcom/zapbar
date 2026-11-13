"""Create the three tip products (monetization.onetimeproducts) and activate them.
Dry run by default; --apply talks to Play. Idempotent: existing products are updated in place.

  usage: python3 scripts/play/products.py [--apply]
"""
import argparse
import json
from playlib import PACKAGE, TIPS, service, tip_products

ap = argparse.ArgumentParser()
ap.add_argument("--apply", action="store_true")
a = ap.parse_args()

svc = service()
otp = svc.monetization().onetimeproducts()
conversions, version = {}, None
for sku, eur, _ in TIPS:
    conversions[sku] = svc.monetization().convertRegionPrices(
        packageName=PACKAGE, body={"price": {"currencyCode": "EUR", "units": str(eur)}}).execute()
    version = conversions[sku]["regionVersion"]
bodies = tip_products(conversions, version)

if not a.apply:
    for b in bodies:
        regional = b["purchaseOptions"][0]["regionalPricingAndAvailabilityConfigs"]
        sample = {r["regionCode"]: r["price"] for r in regional if r["regionCode"] in ("NL", "DE", "US", "GB")}
        print(f"{b['productId']}: {b['listings'][0]['title']}, {len(regional)} regions, regionsVersion {version['version']}")
        print(f"  {json.dumps(sample)}")
    print("dry run: nothing sent (use --apply)")
    raise SystemExit(0)

for b in bodies:
    otp.patch(packageName=PACKAGE, productId=b["productId"], body=b, allowMissing=True,
              regionsVersion_version=version["version"], updateMask="listings,purchaseOptions").execute()
    print(f"upserted {b['productId']}")

otp.purchaseOptions().batchUpdateStates(packageName=PACKAGE, productId="-", body={"requests": [
    {"activatePurchaseOptionRequest": {"packageName": PACKAGE, "productId": sku, "purchaseOptionId": "buy"}}
    for sku, _, _ in TIPS]}).execute()

after = {p["productId"]: [o.get("state") for o in p.get("purchaseOptions", [])]
         for p in otp.list(packageName=PACKAGE).execute().get("oneTimeProducts", [])}
print(json.dumps(after))
missing = [sku for sku, _, _ in TIPS if after.get(sku) != ["ACTIVE"]]
raise SystemExit(1 if missing else 0)
