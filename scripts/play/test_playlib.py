import unittest
from playlib import tip_products, max_version_code


class _Exec:
    def __init__(self, v):
        self.v = v

    def execute(self):
        return self.v


class _Tracks:
    def __init__(self, tracks):
        self._t = tracks

    def list(self, packageName, editId):
        return _Exec({"tracks": self._t})


class FakeEdits:
    def __init__(self, tracks):
        self._tracks = tracks
        self.deleted = False

    def insert(self, packageName, body):
        return _Exec({"id": "e1"})

    def tracks(self):
        return _Tracks(self._tracks)

    def delete(self, packageName, editId):
        self.deleted = True
        return _Exec({})


class FakeService:
    def __init__(self, tracks):
        self.e = FakeEdits(tracks)

    def edits(self):
        return self.e


class PlayLibTest(unittest.TestCase):
    def test_tip_products_are_three_one_time_products_with_round_euro_prices(self):
        def conv(usd):
            return {"convertedRegionPrices": {
                        "NL": {"regionCode": "NL", "price": {"currencyCode": "EUR", "units": "2", "nanos": 390000000}},
                        "US": {"regionCode": "US", "price": {"currencyCode": "USD", "units": usd}}},
                    "convertedOtherRegionsPrice": {"eurPrice": {"currencyCode": "EUR", "units": "2"},
                                                   "usdPrice": {"currencyCode": "USD", "units": usd}}}
        p = {x["productId"]: x for x in tip_products(
            {"supporter_2": conv("2"), "supporter_5": conv("5"), "supporter_10": conv("11")}, {"version": "2026/01"})}
        self.assertEqual(sorted(p), ["supporter_10", "supporter_2", "supporter_5"])
        opt = p["supporter_5"]["purchaseOptions"][0]
        prices = {r["regionCode"]: r["price"] for r in opt["regionalPricingAndAvailabilityConfigs"]}
        self.assertEqual(prices["NL"], {"currencyCode": "EUR", "units": "5"})  # eurozone: exact amount, VAT included
        self.assertEqual(prices["US"], {"currencyCode": "USD", "units": "5"})  # elsewhere: Play's conversion
        self.assertTrue(opt["buyOption"]["legacyCompatible"])
        self.assertEqual(p["supporter_10"]["regionsVersion"], {"version": "2026/01"})
        self.assertEqual([l["languageCode"] for l in p["supporter_10"]["listings"]], ["en-GB", "en-US"])

    def test_max_version_code_reads_all_tracks_and_discards_the_edit(self):
        svc = FakeService([
            {"track": "internal", "releases": [{"versionCodes": ["10001"]}]},
            {"track": "production", "releases": [{"versionCodes": ["10000"]}]},
        ])
        self.assertEqual(max_version_code(svc, "app.zapbar.remote"), 10001)
        self.assertTrue(svc.e.deleted)

    def test_max_version_code_is_zero_without_releases(self):
        self.assertEqual(max_version_code(FakeService([]), "app.zapbar.remote"), 0)


if __name__ == "__main__":
    unittest.main()
