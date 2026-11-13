#!/usr/bin/env bash
# Zapbar TestFlight upload, run from the dev machine:  apps/remote/scripts/ios-testflight.sh [branch]
# Bump the build number first (node scripts/version.mjs); App Store Connect rejects a duplicate build.
#
# Signing is manual and headless (see ios_profile.py): the profile is made here from the vault and
# copied to the Mac; the Mac's build keychain password goes over stdin, never in argv (visible in `ps`).
set -euo pipefail
cd "$(dirname "$0")"

MAC=${MAC:-user@your-mac}  # tailnet; the Mac's LAN IP is DHCP and drifts
SCOPE=youcantcatchme                 # team-level Apple key, certificate and Mac keychain password
BRANCH="${1:-main}"
vault() { claudify-secret get "$1" "$SCOPE"; }

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
python3 ios_profile.py "$WORK"
ssh -o BatchMode=yes "$MAC" 'mkdir -p ~/zapbar-dd'
scp -q "$WORK/zapbar.mobileprovision" "$WORK/zapbar-widgets.mobileprovision" "$MAC:zapbar-dd/"

# Update the checkout before running the script from it: bash reads a script as it runs, so the
# script's own pull must not change the file underneath it.
ssh -o BatchMode=yes "$MAC" "cd ~/projects/zapbar && git checkout -q -- apps/remote/app.json \
  && git fetch -q origin && git checkout -q '$BRANCH' && git pull -q --ff-only"

vault IOS_MAC_KEYCHAIN_PASS | ssh -o BatchMode=yes "$MAC" \
  "ASC_KEY_ID=$(vault ASC_API_KEY_ID) ASC_ISSUER_ID=$(vault ASC_API_ISSUER_ID) \
   bash ~/projects/zapbar/apps/remote/scripts/ios-build.sh testflight '$BRANCH'"
