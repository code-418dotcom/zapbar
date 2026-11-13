#!/usr/bin/env python3
"""App Store provisioning profile for Zapbar, created through the App Store Connect API. Runs on the dev machine.

Xcode's automatic signing needs a signed-in Xcode account and an unlocked login keychain; neither exists
in an SSH session on the Mac. The team's API key and Apple Distribution certificate are team-level and
live in vault scope youcantcatchme (made by that project's scripts/ios_signing.py; the certificate's
private key is already in the Mac's build keychain). This script reuses that certificate, keeps one
App Store profile per bundle ID (the app and its widget extension) and writes them into <out_dir>.
Nothing secret is printed.

Usage: python3 apps/remote/scripts/ios_profile.py <out_dir>
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt

SCOPE = "youcantcatchme"
BUNDLE_ID = "app.zapbar.remote"
PROFILE_NAME = "Zapbar App Store"
# (bundle ID, profile name, file written into out_dir). ios-build.sh uses the same names.
PROFILES = [
    (BUNDLE_ID, PROFILE_NAME, "zapbar.mobileprovision"),
    (f"{BUNDLE_ID}.widgets", "Zapbar Widgets App Store", "zapbar-widgets.mobileprovision"),
]


def secret(name: str) -> str:
    return subprocess.run(["claudify-secret", "get", name, SCOPE], check=True,
                          capture_output=True, text=True).stdout.strip()


def token() -> str:
    now = int(time.time())
    return jwt.encode({"iss": secret("ASC_API_ISSUER_ID"), "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"},
                      base64.b64decode(secret("ASC_API_KEY_P8_B64")), algorithm="ES256",
                      headers={"kid": secret("ASC_API_KEY_ID"), "typ": "JWT"})


def call(method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read()
        errors = json.loads(raw).get("errors", []) if raw else []
        sys.exit(f"ios_profile: {method} {path} failed ({e.code}): {[x.get('detail') for x in errors]}")


def ensure_bundle(identifier: str) -> str:
    """The bundle ID's resource id; registers it (with App Groups) when missing. Associating the group is a portal step."""
    bundles = call("GET", f"/v1/bundleIds?filter[identifier]={identifier}")["data"]
    match = [b["id"] for b in bundles if b["attributes"]["identifier"] == identifier]
    if match:
        return match[0]
    if identifier == BUNDLE_ID:
        sys.exit(f"ios_profile: bundle id {identifier} is not registered")
    created = call("POST", "/v1/bundleIds", {"data": {"type": "bundleIds", "attributes": {
        "identifier": identifier, "name": "Zapbar Widgets", "platform": "IOS"}}})["data"]["id"]
    call("POST", "/v1/bundleIdCapabilities", {"data": {"type": "bundleIdCapabilities", "attributes": {"capabilityType": "APP_GROUPS"},
        "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": created}}}}})
    print(f"bundle id: registered {identifier} (enable the App Group on it in the developer portal)")
    return created


def ensure_profile(cert_id: str, identifier: str, name: str) -> bytes:
    data = call("GET", f"/v1/profiles?filter[name]={urllib.parse.quote(name)}&include=certificates")
    for p in data["data"]:
        certs = [c["id"] for c in p["relationships"]["certificates"]["data"]]
        if p["attributes"]["profileState"] == "ACTIVE" and cert_id in certs:
            print(f"profile: reusing {name}")
            return base64.b64decode(p["attributes"]["profileContent"])
        call("DELETE", f"/v1/profiles/{p['id']}")
    bundle = ensure_bundle(identifier)
    data = call("POST", "/v1/profiles", {"data": {"type": "profiles",
        "attributes": {"name": name, "profileType": "IOS_APP_STORE"},
        "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bundle}},
                          "certificates": {"data": [{"type": "certificates", "id": cert_id}]}}}})
    print(f"profile: created {name}")
    return base64.b64decode(data["data"]["attributes"]["profileContent"])


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    cert = secret("IOS_DIST_CERT_ID")
    old = os.umask(0o077)
    try:
        for identifier, name, file in PROFILES:
            profile = ensure_profile(cert, identifier, name)
            with open(os.path.join(sys.argv[1], file), "wb") as f:
                f.write(profile)
    finally:
        os.umask(old)


if __name__ == "__main__":
    main()
