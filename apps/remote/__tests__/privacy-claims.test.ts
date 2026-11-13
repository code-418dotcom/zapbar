/** @jest-environment node */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOWED_PERMISSIONS } from '../scripts/release-lib.cjs';

const ROOT = join(__dirname, '../../..');
const policy = () => readFileSync(join(ROOT, 'apps/site/privacy.html'), 'utf8').replace(/\s+/g, ' ');

const walk = (dir: string, exts: string[]): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' || n === 'build' || n === 'test' ? [] : walk(p, exts);
    return exts.some((e) => n.endsWith(e)) ? [p] : [];
  });

const SOURCES = [
  ...walk(join(ROOT, 'apps/remote/src'), ['.ts', '.tsx']),
  ...walk(join(ROOT, 'apps/remote/app'), ['.ts', '.tsx']),
  ...walk(join(ROOT, 'packages/heos-core/src'), ['.ts']),
  ...walk(join(ROOT, 'apps/remote/modules'), ['.kt', '.ts', '.swift']),
];

const LOCAL = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.|localhost$|239\.255\.255\.250$)/;
// Literals that are not network calls from the app: XML namespaces, UPnP/HEOS schema URNs, store and Spotify links opened by the system (Linking.openURL), never fetched.
const NOT_FETCHED = /^(schemas\.xmlsoap\.org|schemas\.android\.com|schemas\.upnp\.org|www\.w3\.org|play\.google\.com|zapbar\.app|open\.spotify\.com)$/;

const CLAIMS = {
  local: 'Zapbar only talks to devices on your own network.',
  noAnalytics: 'Zapbar has no analytics, no crash reporting and no ads.',
  noAccount: 'There is no account and nothing to sign in to.',
  onPhone: 'Your settings stay on your phone.',
  purchases: 'Tips are processed by Google Play or the App Store; Zapbar never sees your payment details.',
};

it('the policy states every claim', () => {
  for (const c of Object.values(CLAIMS)) expect(policy()).toContain(c);
});

it('every host literal is local (claim: local)', () => {
  const offenders: string[] = [];
  for (const f of SOURCES) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(?:https?|wss?):\/\/([^/:'"`\s)]+)/g)) {
      const host = m[1]!;
      if (host.includes('${') || host.startsWith('$') || LOCAL.test(host) || NOT_FETCHED.test(host)) continue;
      offenders.push(`${f.replace(ROOT, '')}: ${host}`);
    }
  }
  expect(offenders).toEqual([]);
});

it('no analytics or crash SDKs (claim: noAnalytics)', () => {
  const deny = /firebase|sentry|bugsnag|amplitude|segment|mixpanel|posthog|datadog|appcenter|crashlytics|instabug|newrelic/i;
  const deps = (p: string) => {
    const j = JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
    return Object.keys({ ...j.dependencies, ...j.devDependencies });
  };
  const all = [...deps('apps/remote/package.json'), ...deps('packages/heos-core/package.json')];
  expect(all.filter((d) => deny.test(d))).toEqual([]);
  const gradle = readFileSync(join(ROOT, 'apps/remote/modules/zapbar-quick/android/build.gradle'), 'utf8');
  expect(deny.test(gradle)).toBe(false);
});

it('no account or sign-in code (claim: noAccount)', () => {
  const offenders = SOURCES.filter((f) => /\b(signIn|login|oauth|password)\b/i.test(readFileSync(f, 'utf8')));
  expect(offenders.map((f) => f.replace(ROOT, ''))).toEqual([]);
});

it('permissions stay the audited set (claims: local, onPhone)', () => {
  expect(ALLOWED_PERMISSIONS.filter((p: string) => /LOCATION|CONTACTS|STORAGE|MEDIA|CAMERA|RECORD_AUDIO|ACCOUNTS|ACCESSIBILITY/.test(p))).toEqual([]);
});

it('Android backup is off, so settings never leave the phone (claim: onPhone)', () => {
  const app = JSON.parse(readFileSync(join(ROOT, 'apps/remote/app.json'), 'utf8'));
  expect(app.expo.android.allowBackup).toBe(false);
});
