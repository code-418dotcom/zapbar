#!/usr/bin/env bash
# Zapbar iOS build. Runs ON THE MAC (user@your-mac, tailnet), never on the dev machine.
#   ios-build.sh <sim|device|testflight> [branch] [--clean]
#   Each testflight upload needs `node scripts/version.mjs` or a buildNumber bump first
#   (manageAppVersionAndBuildNumber=false), or App Store Connect rejects the duplicate build.
#   testflight: run apps/remote/scripts/ios-testflight.sh from the dev machine instead; it supplies the profiles
#   (~/zapbar-dd/zapbar.mobileprovision, ~/zapbar-dd/zapbar-widgets.mobileprovision), the build keychain
#   password on stdin and the API key IDs.
#   sim: Debug on $SIM_NAME by default; SIM_CONFIG=Release bundles the JS (no Metro), e.g. for screenshots.
#   Release archive signed manually with Apple Distribution, then upload to App Store Connect.
#   Signing auth: an App Store Connect API key when ASC_KEY_ID and ASC_ISSUER_ID are set
#   (environment, or ~/.appstoreconnect/zapbar.env; key at ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8),
#   otherwise the Xcode account signed in on this Mac.
# The Mac only pulls from Gitea; edit on the dev machine, push, then run this.
set -uo pipefail
. ~/tools/env.sh

AUTH=()
[ -z "${ASC_KEY_ID:-}" ] && [ -f ~/.appstoreconnect/zapbar.env ] && . ~/.appstoreconnect/zapbar.env
if [ -n "${ASC_KEY_ID:-}${ASC_ISSUER_ID:-}" ]; then
  KEY=~/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID:-}.p8
  [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ] && [ -f "$KEY" ] \
    || { echo "ASC_KEY_ID/ASC_ISSUER_ID incomplete or $KEY missing" >&2; exit 2; }
  AUTH=(-authenticationKeyPath "$KEY" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
fi

TARGET="${1:-}"; BRANCH="main"; CLEAN=0
shift || true
for a in "$@"; do
  case "$a" in
    --clean) CLEAN=1 ;;
    *) BRANCH="$a" ;;
  esac
done
case "$TARGET" in sim|device|testflight) ;; *) echo "usage: ios-build.sh <sim|device|testflight> [branch] [--clean]" >&2; exit 2 ;; esac

# Read before pnpm/expo get a chance at stdin.
KCP=""
if [ "$TARGET" = testflight ]; then
  IFS= read -r KCP || true
  [ -n "$KCP" ] && [ -n "${ASC_KEY_ID:-}" ] && [ -f ~/zapbar-dd/zapbar.mobileprovision ] && [ -f ~/zapbar-dd/zapbar-widgets.mobileprovision ] \
    || { echo "testflight needs the keychain password on stdin, the API key IDs and both profiles: run ios-testflight.sh from the dev machine" >&2; exit 2; }
fi

REPO=~/projects/zapbar
APP="$REPO/apps/remote"
DD=~/zapbar-dd                      # outside ios/, survives prebuild --clean
STAMP="$DD/prebuild.stamp"
LOG=~/zapbar-ios-$TARGET.log
BUNDLE_ID=app.zapbar.remote
SIM_NAME="${SIM_NAME:-iPhone 17e}"   # SIM_NAME="iPhone 18 Pro Max" SIM_CONFIG=Release for store screenshots
mkdir -p "$DD"

# Fail fast for device: no point building for 20 min with no phone.
DEVICE_ID=""
if [ "$TARGET" = device ]; then
  JSON="$(mktemp)"
  xcrun devicectl list devices --json-output "$JSON" >/dev/null 2>&1
  DEVICE_ID="$(python3 - "$JSON" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))["result"]["devices"]
except Exception:
    d = []
for x in d:
    hw = x.get("hardwareProperties", {})
    cp = x.get("connectionProperties", {})
    if hw.get("reality") == "physical" and hw.get("platform") == "iOS" and cp.get("tunnelState") in ("connected", "available"):
        print(x["identifier"]); break
PY
)"
  rm -f "$JSON"
  if [ -z "$DEVICE_ID" ]; then
    echo "No iPhone connected: plug it in, unlock, tap Trust" >&2
    exit 3
  fi
fi

# prebuild rewrites tracked app.json; discard that before touching the branch.
git -C "$REPO" checkout -- apps/remote/app.json || exit 1
git -C "$REPO" fetch origin || exit 1
git -C "$REPO" checkout "$BRANCH" || exit 1
git -C "$REPO" pull --ff-only || exit 1

cd "$APP" || exit 1
pnpm install --frozen-lockfile || exit 1

# Re-prebuild only when inputs changed (or ios/ is gone, or --clean).
HASH="$( { shasum app.json package.json "$REPO/pnpm-lock.yaml"
           find modules plugins assets targets -type f -not -path '*/node_modules/*' -not -path '*/build/*' | LC_ALL=C sort | xargs shasum
         } | shasum | cut -d' ' -f1)"
if [ "$CLEAN" = 1 ] || [ ! -d ios ] || [ ! -d ios/Pods ] || [ ! -f ios/Podfile.lock ] \
   || [ "$(cat "$STAMP" 2>/dev/null)" != "$HASH" ]; then
  echo "== prebuild (clean)"
  rm -f "$STAMP"
  npx expo prebuild --platform ios --clean || exit 1
  # prebuild can exit 0 after a failed pod install; stamp only when Pods exist.
  if [ -d ios/Pods ] && [ -f ios/Podfile.lock ]; then
    echo "$HASH" > "$STAMP"
  else
    echo "prebuild finished without ios/Pods or ios/Podfile.lock (pod install failed?)" >&2
    exit 1
  fi
else
  echo "== prebuild skipped (inputs unchanged)"
fi
# prebuild edits app.json; restore so the checkout stays clean for the next pull.
git -C "$REPO" checkout -- apps/remote/app.json

if [ "$TARGET" = testflight ]; then
  ARCHIVE="$DD/Zapbar.xcarchive"; EXPORT="$DD/export"; PLIST="$DD/ExportOptions.plist"
  KC=~/Library/Keychains/build.keychain-db
  PROFILE_NAME="Zapbar App Store"; WIDGET_PROFILE="Zapbar Widgets App Store"
  # A keychain unlock only holds inside the SSH session that ran it.
  security unlock-keychain -p "$KCP" "$KC" || { echo "cannot unlock $KC" >&2; exit 1; }
  for f in zapbar zapbar-widgets; do
    UUID="$(security cms -D -i "$DD/$f.mobileprovision" | plutil -extract UUID raw -)" || exit 1
    for d in ~/Library/MobileDevice/Provisioning\ Profiles ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles; do
      mkdir -p "$d"; cp "$DD/$f.mobileprovision" "$d/$UUID.mobileprovision"
    done
  done
  # Manual signing on the app's and the widget extension's Release configs only; command-line settings
  # would also hit the Pods targets, which reject a provisioning profile. Restored after the archive.
  PBX=ios/Zapbar.xcodeproj/project.pbxproj
  cp "$PBX" "$DD/project.pbxproj.orig"
  trap 'cp "$DD/project.pbxproj.orig" "$APP/$PBX"' EXIT
  python3 - "$PBX" "$BUNDLE_ID=$PROFILE_NAME" "$BUNDLE_ID.widgets=$WIDGET_PROFILE" <<'PY2' || exit 1
import re, sys
path, pairs = sys.argv[1], dict(a.split("=", 1) for a in sys.argv[2:])
s = open(path).read()
def extra(profile):
    return ('CODE_SIGN_STYLE = Manual;\n\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";\n'
            '\t\t\t\t"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";\n'
            f'\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "{profile}";\n\t\t\t\t')
def patch(m):
    block = m.group(0)
    if "name = Release;" not in block:
        return block
    for bundle, profile in pairs.items():
        if re.search(rf'PRODUCT_BUNDLE_IDENTIFIER = "?{re.escape(bundle)}"?;', block):
            # apple-targets may set CODE_SIGN_STYLE itself; drop it so ours is the only one.
            block = re.sub(r"\n\t*CODE_SIGN_STYLE = \w+;", "", block)
            block = re.sub(r"(\n\t*)(PRODUCT_BUNDLE_IDENTIFIER = )", lambda m: m.group(1) + extra(profile) + m.group(2), block, count=1)
    return block
out = re.sub(r"isa = XCBuildConfiguration;.*?name = \w+;", patch, s, flags=re.S)
if out.count("PROVISIONING_PROFILE_SPECIFIER") != len(pairs):
    sys.exit(f"pbxproj: expected {len(pairs)} patched Release configs, found {out.count('PROVISIONING_PROFILE_SPECIFIER')}")
open(path, "w").write(out)
PY2
  cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>AQBG4QHRNN</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key><dict>
    <key>$BUNDLE_ID</key><string>$PROFILE_NAME</string>
    <key>$BUNDLE_ID.widgets</key><string>$WIDGET_PROFILE</string>
  </dict>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PL
  rm -rf "$ARCHIVE" "$EXPORT"
  echo "== xcodebuild archive (Release), log: $LOG"
  xcodebuild archive -workspace ios/Zapbar.xcworkspace -scheme Zapbar -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
    -derivedDataPath "$DD" OTHER_CODE_SIGN_FLAGS="--keychain $KC" >"$LOG" 2>&1
  RC=$?
  grep 'error:' "$LOG" | tail -n 15
  grep -E '^\*\* ARCHIVE (SUCCEEDED|FAILED)' "$LOG" | tail -n 1
  [ "$RC" -eq 0 ] || { echo "ARCHIVE FAILED (see $LOG)"; exit 1; }
  echo "== exportArchive + upload"
  xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$PLIST" \
    -exportPath "$EXPORT" -allowProvisioningUpdates ${AUTH[@]+"${AUTH[@]}"} >>"$LOG" 2>&1
  RC=$?
  grep -E 'error:|Upload|EXPORT' "$LOG" | tail -n 15
  [ "$RC" -eq 0 ] || { echo "EXPORT/UPLOAD FAILED (see $LOG)"; exit 1; }
  echo "DONE testflight (uploaded; processing in App Store Connect takes a few minutes)"
  exit 0
fi

if [ "$TARGET" = sim ]; then
  CONFIG="${SIM_CONFIG:-Debug}"; PLAT=iphonesimulator
  ARGS=(-sdk iphonesimulator -destination "platform=iOS Simulator,name=$SIM_NAME")
else
  CONFIG=Release; PLAT=iphoneos
  ARGS=(-destination 'generic/platform=iOS' -allowProvisioningUpdates ${AUTH[@]+"${AUTH[@]}"})
fi

echo "== xcodebuild $CONFIG ($TARGET), log: $LOG"
xcodebuild -workspace ios/Zapbar.xcworkspace -scheme Zapbar -configuration "$CONFIG" \
  "${ARGS[@]}" -derivedDataPath "$DD" build >"$LOG" 2>&1
RC=$?
grep 'error:' "$LOG" | tail -n 15
grep -E '^\*\* BUILD (SUCCEEDED|FAILED)' "$LOG" | tail -n 1
[ "$RC" -eq 0 ] || { echo "BUILD FAILED (see $LOG)"; exit 1; }

APP_PATH="$DD/Build/Products/$CONFIG-$PLAT/Zapbar.app"
[ -d "$APP_PATH" ] || { echo "app not found: $APP_PATH" >&2; exit 1; }

if [ "$TARGET" = sim ]; then
  SIM_ID="$(xcrun simctl list devices available | grep "$SIM_NAME (" | head -n1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')"
  [ -n "$SIM_ID" ] || { echo "simulator $SIM_NAME not found" >&2; exit 1; }
  xcrun simctl boot "$SIM_ID" 2>/dev/null || true   # already booted is fine
  xcrun simctl install "$SIM_ID" "$APP_PATH" || exit 1
  xcrun simctl launch "$SIM_ID" "$BUNDLE_ID" || exit 1
else
  xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH" || exit 1
  xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID" || exit 1
fi
echo "DONE $TARGET"
