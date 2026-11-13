// Checks a release AAB before it goes anywhere near Play. A green Gradle build is not evidence.
// usage: node scripts/release-check.mjs <aab> [--min-version-code N]
import { execFileSync } from 'node:child_process';
import { checkPermissions, permissionsIn } from './release-lib.cjs';

const [aab, ...rest] = process.argv.slice(2);
if (!aab) throw new Error('usage: node scripts/release-check.mjs <aab> [--min-version-code N]');
const i = rest.indexOf('--min-version-code');
const minCode = i >= 0 ? Number(rest[i + 1]) : 0;
const BUNDLETOOL = process.env.BUNDLETOOL_JAR ?? `${process.env.HOME}/tools/bundletool.jar`;
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let failed = false;
const report = (ok, line) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${line}`);
  if (!ok) failed = true;
};

const manifest = run('java', ['-jar', BUNDLETOOL, 'dump', 'manifest', `--bundle=${aab}`]);
const target = Number(/android:targetSdkVersion="(\d+)"/.exec(manifest)?.[1]);
report(target === 36, `targetSdk ${target}`);
const code = Number(/android:versionCode="(\d+)"/.exec(manifest)?.[1]);
report(code > minCode, `versionCode ${code} > ${minCode}`);
const perms = checkPermissions(permissionsIn(manifest));
report(perms.extra.length === 0 && perms.missing.length === 0, `permissions extra=[${perms.extra}] missing=[${perms.missing}]`);

// keytool -printcert -jarfile is right for an AAB (jar-signed); never use it on a v2/v3-only APK.
const fp = (out) => /SHA256: ([0-9A-F:]+)/i.exec(out)?.[1]?.toUpperCase() ?? '';
const aabFp = fp(run('keytool', ['-printcert', '-jarfile', aab]));
let keyFp = '';
try {
  keyFp = fp(run('keytool', ['-list', '-v', '-keystore', process.env.ZAPBAR_UPLOAD_STORE_FILE ?? '', '-alias', 'zapbar', '-storepass:env', 'ZAPBAR_UPLOAD_STORE_PASSWORD']));
} catch {
  keyFp = '';
}
report(aabFp !== '' && aabFp === keyFp, `signed with the upload key (${aabFp ? aabFp.slice(0, 11) + '…' : 'no fingerprint'})`);
process.exit(failed ? 1 : 0);
