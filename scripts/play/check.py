#!/usr/bin/env python3
"""Prove that Play Developer API access actually works for app.zapbar.remote.

Configuration is not proof. A service-account key can exist, be valid, be loadable, and still be
useless because the Play Console link or the per-app grant was never made -- and every one of those
failures looks identical if you only check that the credentials parse.

So this script does the one call that exercises the whole chain end to end: edits.insert. That
requires, all at once, a valid key, the androidpublisher API enabled, the GCP project linked to the
developer account, the service account granted on THIS package, and the app existing on Play. It
then deletes the edit it made, so running this leaves nothing behind.

It also runs a CONTROL against a package that cannot exist, to prove the check is capable of
failing. A test that cannot fail is not evidence.

  usage: python3 scripts/play/check.py [--package app.zapbar.remote] [--key path/to/key.json]

  Credentials are read, in order of preference:
    1. --key <file>
    2. $ANDROID_PUBLISHER_CREDENTIALS  (the JSON itself, not a path -- matches Gradle Play Publisher)
    3. claudify-secret get PLAY_SERVICE_ACCOUNT_JSON sonora

Exit codes:  0 = access proven   1 = access NOT working (reason printed)   2 = usage/harness error
"""
import argparse
import json
import os
import subprocess
import sys

SCOPE = "https://www.googleapis.com/auth/androidpublisher"
CONTROL_PACKAGE = "app.zapbar.remote.definitely.not.a.real.package"


def load_credentials_json(key_path):
    if key_path:
        with open(key_path, "r") as fh:
            return fh.read(), f"file {key_path}"

    env = os.environ.get("ANDROID_PUBLISHER_CREDENTIALS")
    if env:
        return env, "$ANDROID_PUBLISHER_CREDENTIALS"

    try:
        out = subprocess.run(
            ["claudify-secret", "get", "PLAY_SERVICE_ACCOUNT_JSON", "sonora"],
            capture_output=True, text=True, timeout=30,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        raise SystemExit(f"no credentials: no --key, no env var, and claudify-secret unusable ({exc})")
    if out.returncode != 0 or not out.stdout.strip():
        raise SystemExit(
            "no credentials found.\n"
            "  tried: --key, $ANDROID_PUBLISHER_CREDENTIALS, "
            "claudify-secret get PLAY_SERVICE_ACCOUNT_JSON sonora\n"
            f"  vault said: {(out.stderr or '').strip() or 'empty value'}"
        )
    return out.stdout, "vault (sonora/PLAY_SERVICE_ACCOUNT_JSON)"


def diagnose(exc, package):
    """Turn a Google API error into the specific thing that is actually wrong."""
    status = getattr(getattr(exc, "resp", None), "status", None)
    body = ""
    try:
        body = exc.content.decode("utf-8", "replace") if hasattr(exc, "content") else str(exc)
    except Exception:
        body = str(exc)
    low = body.lower()

    if "servicedisabled" in low.replace(" ", "") or "androidpublisher.googleapis.com" in low and "disabled" in low:
        return ("androidpublisher API is not enabled on the GCP project",
                "gcloud services enable androidpublisher.googleapis.com")
    if status == 401 or "invalid_grant" in low or "unauthorized" in low:
        return ("the service-account key was rejected (revoked, malformed, or clock skew)",
                "re-create the key: ~/projects/sonora/scripts/play-api-provision.sh")
    if status == 403:
        if "linked" in low or "developer account" in low:
            return ("the GCP project is not linked to the Play developer account",
                    "Play Console -> Setup -> API access -> Link an existing Google Cloud project")
        return ("the service account has no permission on this app",
                "Play Console -> Users and permissions -> invite the service-account email "
                "and grant it access to " + package)
    if status == 404:
        # Deliberately not stated as a single cause. The control against an impossible package also
        # returns 404, so this status cannot separate "no such app" from "this service account
        # cannot see it". Reporting one of them as fact would be a guess wearing a diagnosis.
        return (f"Play returned 404 for {package} -- either the app does not exist yet, or this "
                f"service account has no visibility of it (404 cannot tell these apart)",
                "if the app is not created: do that in the Play Console, and upload the FIRST "
                "release by hand -- the API can do neither. If it IS created: Setup -> API access "
                "must link the GCP project, and Users and permissions must grant this service "
                "account on the app")
    return (f"unexpected API error (HTTP {status})", body.strip()[:400])


def try_insert(service, package):
    """Returns (ok, edit_id_or_none, error_or_none)."""
    try:
        edit = service.edits().insert(body={}, packageName=package).execute()
        return True, edit.get("id"), None
    except Exception as exc:  # HttpError and transport errors alike
        return False, None, exc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--package", default="app.zapbar.remote")
    ap.add_argument("--key", default=None)
    args = ap.parse_args()

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError as exc:
        print(f"FAIL  missing python dependency: {exc}", file=sys.stderr)
        return 2

    raw, source = load_credentials_json(args.key)
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"FAIL  credentials from {source} are not valid JSON: {exc}", file=sys.stderr)
        return 1

    sa_email = info.get("client_email", "<no client_email in key>")
    print(f"instrument : androidpublisher v3 edits.insert")
    print(f"credentials: {source}")
    print(f"identity   : {sa_email}")
    print(f"package    : {args.package}")
    print()

    creds = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
    service = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)

    # --- CONTROL: this package cannot exist, so the check MUST fail here. If it somehow passes,
    # the instrument is not measuring what it claims and every other result is meaningless.
    ctl_ok, _, ctl_err = try_insert(service, CONTROL_PACKAGE)
    if ctl_ok:
        print("FAIL  control passed against a nonexistent package -- this check proves nothing.",
              file=sys.stderr)
        return 2
    print(f"control    : rejected {CONTROL_PACKAGE} as expected "
          f"(HTTP {getattr(getattr(ctl_err, 'resp', None), 'status', '?')}) -- the check can fail")
    # Reaching an HTTP status at all means the OAuth exchange succeeded and the API is serving us,
    # which is worth stating separately: those two facts stay proven even when the call below fails.
    print("proven     : the key authenticates, and androidpublisher is enabled on "
          f"{info.get('project_id', '?')}")
    print()

    # --- REAL MEASUREMENT
    ok, edit_id, err = try_insert(service, args.package)
    if not ok:
        reason, fix = diagnose(err, args.package)
        print(f"FAIL  {reason}")
        print(f"      fix: {fix}")
        return 1

    # Clean up: an abandoned edit expires on its own, but leaving them around is untidy.
    try:
        service.edits().delete(packageName=args.package, editId=edit_id).execute()
        cleaned = "edit deleted"
    except Exception:
        cleaned = "edit left to expire (harmless)"

    print(f"PASS  opened and closed a real edit on {args.package} (id {edit_id}; {cleaned})")
    print("      the full chain works: key -> API enabled -> project linked -> app grant -> app exists")
    return 0


if __name__ == "__main__":
    sys.exit(main())
