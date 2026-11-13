#!/usr/bin/env bash
# Build a signed release AAB with the upload key and run the release check.
# The password comes from the vault into this process only; nothing is printed or written.
set -euo pipefail
cd "$(dirname "$0")/.."
export JAVA_HOME="${JAVA_HOME:-$HOME/tools/jdk-17.0.13+11}" ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export PATH="$JAVA_HOME/bin:$PATH"
export ZAPBAR_UPLOAD_STORE_FILE="$PWD/zapbar-upload.jks"
[ -f "$ZAPBAR_UPLOAD_STORE_FILE" ] || { echo "upload key missing at $ZAPBAR_UPLOAD_STORE_FILE" >&2; exit 1; }
pw="$(claudify-secret get ZAPBAR_UPLOAD_PASSWORD zapbar)"
[ -n "$pw" ] || { echo "vault returned an empty ZAPBAR_UPLOAD_PASSWORD" >&2; exit 1; }
export ZAPBAR_UPLOAD_STORE_PASSWORD="$pw" ZAPBAR_UPLOAD_KEY_PASSWORD="$pw"
unset pw
LOG="${LOG:-$(cd ../.. && pwd)/.superpowers/aab.log}"
if [ -z "${CHECK_ONLY:-}" ]; then
  npx expo prebuild --platform android --clean > "$LOG.prebuild" 2>&1
  (cd android && ./gradlew :app:bundleRelease > "$LOG" 2>&1) || { echo "bundleRelease failed, see $LOG" >&2; exit 1; }
fi
node scripts/release-check.mjs android/app/build/outputs/bundle/release/app-release.aab "$@"
