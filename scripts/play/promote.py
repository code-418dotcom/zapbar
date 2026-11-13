"""Promote a version code that is already on one track to another, then read it back.

  usage: python3 scripts/play/promote.py --from internal --to production --version-code N
"""
import argparse
from playlib import PACKAGE, service, track_release

ap = argparse.ArgumentParser()
ap.add_argument("--from", dest="src", default="internal")
ap.add_argument("--to", dest="dst", default="production")
ap.add_argument("--version-code", required=True)
ap.add_argument("--notes", default="Bug fixes and improvements.")
# A never-published app only accepts draft releases; the owner then sends it for review in the Console.
ap.add_argument("--status", default="completed", choices=["completed", "draft"])
a = ap.parse_args()

svc = service()
if a.version_code not in track_release(svc, PACKAGE, a.src)["versionCodes"]:
    raise SystemExit(f"{a.version_code} is not on {a.src}; refusing to promote something nobody tested")
edit = svc.edits().insert(packageName=PACKAGE, body={}).execute()["id"]
svc.edits().tracks().update(packageName=PACKAGE, editId=edit, track=a.dst, body={
    "releases": [{"versionCodes": [a.version_code], "status": a.status,
                  "releaseNotes": [{"language": "en-GB", "text": a.notes}]}]}).execute()
svc.edits().commit(packageName=PACKAGE, editId=edit).execute()
after = track_release(svc, PACKAGE, a.dst)
print(f"{a.dst}: {after}")
raise SystemExit(0 if a.version_code in after["versionCodes"] else 1)
