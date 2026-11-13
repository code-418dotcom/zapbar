/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOWED_PERMISSIONS, checkPermissions, permissionsIn, setVersion, versionCodeFor } from '../scripts/release-lib.cjs';

it('maps semver to an always-increasing versionCode', () => {
  expect(versionCodeFor('1.0.0')).toBe(10000);
  expect(versionCodeFor('1.0.1')).toBe(10001);
  expect(versionCodeFor('1.2.3')).toBe(10203);
  expect(versionCodeFor('2.0.0')).toBeGreaterThan(versionCodeFor('1.99.99'));
  expect(() => versionCodeFor('1.0')).toThrow();
  expect(() => versionCodeFor('1.100.0')).toThrow();
});

it('sets version and versionCode together', () => {
  const next = setVersion({ expo: { version: '0.3.5', android: { package: 'app.zapbar.remote' } } }, '1.0.0') as { expo: { version: string; android: { versionCode: number; package: string } } };
  expect(next.expo.version).toBe('1.0.0');
  expect(next.expo.android).toEqual({ package: 'app.zapbar.remote', versionCode: 10000 });
});

it('setVersion sets the iOS build number', () => {
  const next = setVersion({ expo: { version: '1.0.0', android: { versionCode: 1 }, ios: { buildNumber: '1' } } }, '1.1.0') as {
    expo: { android: { versionCode: number }; ios: { buildNumber: string } };
  };
  expect(next.expo.ios.buildNumber).toBe('10100');
  expect(next.expo.android.versionCode).toBe(10100);
});

it('reads permissions from a merged manifest and flags extras and missing ones', () => {
  const xml = readFileSync(join(__dirname, 'fixtures/merged-manifest.xml'), 'utf8');
  const found = permissionsIn(xml);
  expect(found).toContain('android.permission.SYSTEM_ALERT_WINDOW');
  const r = checkPermissions(found);
  expect(r.extra).toEqual(['android.permission.SYSTEM_ALERT_WINDOW']);
  expect(r.missing).toEqual(['com.android.vending.BILLING']);
  expect(checkPermissions(ALLOWED_PERMISSIONS)).toEqual({ extra: [], missing: [] });
});

it('app.json blocks the permissions Expo adds that Zapbar does not use', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '../app.json'), 'utf8'));
  expect(app.expo.android.blockedPermissions).toEqual(
    expect.arrayContaining(['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.VIBRATE']),
  );
  expect(app.expo.plugins).toContain('./plugins/with-release-signing');
});

it('the signing plugin refuses a release build without the upload key', () => {
  const plugin = readFileSync(join(__dirname, '../plugins/with-release-signing.js'), 'utf8');
  expect(plugin).toContain('ZAPBAR_UPLOAD_STORE_FILE');
  expect(plugin).toContain('zapbarDebugSigned');
  expect(plugin).toMatch(/throw new GradleException/);
});

it('the listing text fits Play limits and carries the agreed lines', () => {
  const md = readFileSync(join(__dirname, '../../../docs/release/listing.md'), 'utf8');
  const field = (name: string) => new RegExp(`## ${name}\\n\\n([\\s\\S]*?)\\n\\n## `).exec(md + '\n\n## ')![1]!.trim();
  expect(field('Title')).toBe('Zapbar: Remote for HEOS');
  expect(field('Title').length).toBeLessThanOrEqual(30);
  expect(field('Short description')).toBe('The remote HEOS forgot to build. Designed for function, no bloat.');
  expect(field('Short description').length).toBeLessThanOrEqual(80);
  expect(field('Full description').length).toBeLessThanOrEqual(4000);
  expect(field('Full description')).toContain('Not affiliated with Denon or HEOS; trademarks belong to their owners.');
});

it('store graphics exist at Play sizes', async () => {
  const sharp = require('sharp') as typeof import('sharp').default;
  const dir = join(__dirname, '../../../docs/release/graphics');
  expect(await sharp(join(dir, 'feature-graphic.png')).metadata()).toMatchObject({ width: 1024, height: 500 });
  expect(await sharp(join(dir, 'icon-512.png')).metadata()).toMatchObject({ width: 512, height: 512 });
  for (const n of ['1-remote', '2-eq', '3-inputs', '4-widgets', '5-notification', '6-slider']) {
    const m = await sharp(join(dir, `${n}.png`)).metadata();
    expect(m.height! / m.width!).toBeCloseTo(2400 / 1080, 1);
  }
});

it('the launch kit is complete and honest', () => {
  const dir = join(__dirname, '../../../docs/launch');
  const readme = readFileSync(join(dir, 'README.md'), 'utf8');
  for (const h of ['## Value proposition', '## Features', '## Target persona', '## Privacy', '## Links']) expect(readme).toContain(h);
  const posts = readFileSync(join(dir, 'posts.md'), 'utf8');
  for (const h of ['## r/denon', '## r/hometheater', '## r/homeassistant', '## Tweakers']) expect(posts).toContain(h);
  expect(posts.match(/DHT-S716H/g)!.length).toBeGreaterThanOrEqual(4);
  expect(posts.match(/I'm the developer|ik ben de ontwikkelaar/gi)!.length).toBeGreaterThanOrEqual(4);
  const reply = readFileSync(join(dir, 'review-reply.md'), 'utf8');
  expect(reply).toMatch(/I made/);
  expect(reply).toMatch(/ik heb .* gemaakt/i);
});

it('no orientation lock', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '../app.json'), 'utf8'));
  expect(app.expo.orientation).toBe('default');
});

it('release builds are shrunk', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '../app.json'), 'utf8'));
  const entry = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-build-properties');
  expect(entry).toBeDefined();
  expect(entry[1].android.enableMinifyInReleaseBuilds).toBe(true);
  expect(entry[1].android.enableShrinkResourcesInReleaseBuilds).toBe(true);
});

it('ships the same version and build number on Play and the App Store', () => {
  const { expo } = JSON.parse(readFileSync(join(__dirname, '../app.json'), 'utf8')) as {
    expo: { version: string; android: { versionCode: number }; ios: { buildNumber: string } };
  };
  expect(expo.android.versionCode).toBe(versionCodeFor(expo.version));
  expect(expo.ios.buildNumber).toBe(String(expo.android.versionCode));
});
