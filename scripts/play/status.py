"""Ask PLAY what is on a track, rather than believing the build log.

  usage: python3 scripts/play/status.py [--track internal]
"""
import argparse
import json
from playlib import PACKAGE, service, track_release

ap = argparse.ArgumentParser()
ap.add_argument("--package", default=PACKAGE)
ap.add_argument("--track", default="internal")
a = ap.parse_args()
print(json.dumps({"track": a.track, **track_release(service(), a.package, a.track)}))
