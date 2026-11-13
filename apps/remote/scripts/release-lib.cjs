// Release helpers shared by version.mjs, release-check.mjs and the Jest release tests.

/** The audited permission set of a release build. Anything else fails the release check. */
const ALLOWED_PERMISSIONS = [
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.CHANGE_NETWORK_STATE',
  'android.permission.CHANGE_WIFI_MULTICAST_STATE',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
  'android.permission.INTERNET',
  'android.permission.POST_NOTIFICATIONS',
  'app.zapbar.remote.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
  'com.android.vending.BILLING',
].sort();

/** major·10000 + minor·100 + patch: always increases, no counter to keep. */
function versionCodeFor(semver) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver);
  if (!m) throw new Error(`not x.y.z: ${semver}`);
  const [maj, min, pat] = m.slice(1).map(Number);
  if (min > 99 || pat > 99) throw new Error(`minor and patch must be 0-99: ${semver}`);
  return maj * 10000 + min * 100 + pat;
}

function setVersion(appJson, semver) {
  const expo = appJson.expo;
  const code = versionCodeFor(semver);
  return {
    ...appJson,
    expo: {
      ...expo,
      version: semver,
      android: { ...expo.android, versionCode: code },
      ios: { ...expo.ios, buildNumber: String(code) },
    },
  };
}

function permissionsIn(xml) {
  return [...new Set([...xml.matchAll(/<uses-permission(?:-sdk-23)?\b[^>]*android:name="([^"]+)"/g)].map((m) => m[1]))].sort();
}

function checkPermissions(found) {
  return {
    extra: found.filter((p) => !ALLOWED_PERMISSIONS.includes(p)),
    missing: ALLOWED_PERMISSIONS.filter((p) => !found.includes(p)),
  };
}

module.exports = { ALLOWED_PERMISSIONS, versionCodeFor, setVersion, permissionsIn, checkPermissions };
