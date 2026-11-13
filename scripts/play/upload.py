"""Upload an AAB to a track, then read the track back. The log is intent; the read-back is the outcome.

  usage: python3 scripts/play/upload.py <aab> [--track internal] [--notes TEXT]
"""
import argparse
from playlib import PACKAGE, max_version_code, service, track_release

ap = argparse.ArgumentParser()
ap.add_argument("aab")
ap.add_argument("--track", default="internal")
ap.add_argument("--notes", default="Bug fixes and improvements.")
a = ap.parse_args()

from googleapiclient.http import MediaFileUpload  # noqa: E402
import socket  # noqa: E402

# Play answers the final chunk only after processing the bundle, which outlasts the default 60 s read timeout.
socket.setdefaulttimeout(600)

svc = service()
before = max_version_code(svc, PACKAGE)
edit = svc.edits().insert(packageName=PACKAGE, body={}).execute()["id"]
# Resumable and chunked: a 76 MB bundle in one request outlives the HTTP read timeout.
req = svc.edits().bundles().upload(packageName=PACKAGE, editId=edit, media_body=MediaFileUpload(
    a.aab, mimetype="application/octet-stream", resumable=True, chunksize=8 * 1024 * 1024))
bundle = None
while bundle is None:
    status, bundle = req.next_chunk(num_retries=3)
    if status:
        print(f"uploaded {int(status.progress() * 100)}%", flush=True)
code = str(bundle["versionCode"])
if int(code) <= before:
    svc.edits().delete(packageName=PACKAGE, editId=edit).execute()
    raise SystemExit(f"versionCode {code} is not above the highest on Play ({before}); bump with scripts/version.mjs")
svc.edits().tracks().update(packageName=PACKAGE, editId=edit, track=a.track, body={
    "releases": [{"versionCodes": [code], "status": "completed",
                  "releaseNotes": [{"language": "en-GB", "text": a.notes}]}]}).execute()
svc.edits().commit(packageName=PACKAGE, editId=edit).execute()
after = track_release(svc, PACKAGE, a.track)
print(f"{a.track}: {after}")
raise SystemExit(0 if code in after["versionCodes"] else 1)
