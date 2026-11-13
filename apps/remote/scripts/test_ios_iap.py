import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from ios_iap import DESCRIPTION, TIPS, nearest_point  # noqa: E402


class NearestPoint(unittest.TestCase):
    def test_picks_the_closest_price(self):
        self.assertEqual(nearest_point([("a", 1.99), ("b", 2.29), ("c", 0.99)], 2), "a")

    def test_takes_the_lower_point_on_a_tie(self):
        self.assertEqual(nearest_point([("hi", 5.01), ("lo", 4.99)], 5), "lo")


class Copy(unittest.TestCase):
    def test_fits_app_store_limits(self):
        self.assertLessEqual(len(DESCRIPTION), 45)
        for _, _, title in TIPS:
            self.assertLessEqual(len(title), 30)

    def test_same_product_ids_as_play(self):
        self.assertEqual([t[0] for t in TIPS], ["supporter_2", "supporter_5", "supporter_10"])


if __name__ == "__main__":
    unittest.main()
