import { readFileSync, writeFileSync } from 'node:fs';
import { setVersion } from './release-lib.cjs';

const [semver] = process.argv.slice(2);
if (!semver) throw new Error('usage: node scripts/version.mjs <x.y.z>');
const path = new URL('../app.json', import.meta.url);
const next = setVersion(JSON.parse(readFileSync(path, 'utf8')), semver);
writeFileSync(path, JSON.stringify(next, null, 2) + '\n');
console.log(`version ${next.expo.version}, versionCode ${next.expo.android.versionCode}, buildNumber ${next.expo.ios.buildNumber}`);
