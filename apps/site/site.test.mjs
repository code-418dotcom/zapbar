import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('.', import.meta.url).pathname;
const pages = ['index.html', 'privacy.html', 'terms.html', 'support.html'];
const read = (f) => readFileSync(join(DIR, f), 'utf8');

test('every page has a title, a description and the stylesheet', () => {
  for (const p of pages) {
    const h = read(p);
    assert.match(h, /<title>[^<]+· Zapbar<\/title>|<title>Zapbar[^<]*<\/title>/, p);
    assert.match(h, /<meta name="description" content="[^"]{20,}">/, p);
    assert.match(h, /<link rel="stylesheet" href="\/site.css(\?v=\d+)?">/, p);
  }
});

const MAGPIE = '<script defer src="https://t.magpiemetrics.com/script.js" data-website-id="bf7042a2-f78a-438e-8b5d-e94e777cea2f" data-host-url="https://t.magpiemetrics.com" data-domains="zapbar.app"></script>';

test('the only script is the Magpie Metrics counter, on every page; no session recorder', () => {
  for (const p of pages) {
    const h = read(p);
    assert.equal(h.match(/<script/gi)?.length, 1, p);
    assert.ok(h.includes(MAGPIE), p);
    assert.doesNotMatch(h, /recorder\.js/, p);
  }
});

test('the privacy page discloses the website analytics', () => {
  const h = read('privacy.html');
  assert.match(h, /Magpie Metrics/);
  assert.match(h, /no cookies/);
});

test('CSP allows the Magpie tracker and nothing else', () => {
  const n = read('nginx.conf');
  assert.match(n, /script-src https:\/\/t\.magpiemetrics\.com; connect-src https:\/\/t\.magpiemetrics\.com;/);
});

test('no third-party requests besides the store links and the Magpie counter', () => {
  for (const f of [...pages, 'site.css']) {
    const h = read(f).replace(MAGPIE, '');
    for (const m of h.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"|url\((https?:\/\/[^)]+)\)/g)) {
      const url = m[1] ?? m[2];
      assert.match(url, /^https:\/\/(play\.google\.com\/store\/apps\/details\?id=app\.zapbar\.remote|apps\.apple\.com\/app\/id6824589391)$/, `${f}: ${url}`);
    }
  }
});

test('internal links and assets resolve', () => {
  const routes = { '/': 'index.html', '/privacy': 'privacy.html', '/terms': 'terms.html', '/support': 'support.html' };
  for (const p of pages) {
    for (const m of read(p).matchAll(/(?:src|href)="(\/[^"#?]*)[^"]*"/g)) {
      const target = routes[m[1]] ?? m[1].slice(1);
      assert.ok(existsSync(join(DIR, target)), `${p} -> ${m[1]}`);
    }
  }
});

test('fonts are self-hosted', () => {
  assert.ok(readdirSync(join(DIR, 'fonts')).some((f) => f.endsWith('.woff2')));
  assert.match(read('site.css'), /@font-face[^}]*url\(\/fonts\//);
});

test('support page names the contact and the requirement', () => {
  const h = read('support.html');
  assert.match(h, /support@zapbar\.app/);
  assert.match(h, /same Wi-Fi/);
});

test('e-mail addresses are excluded from Cloudflare e-mail obfuscation (it injects a script the CSP blocks)', () => {
  for (const p of pages) {
    const h = read(p);
    const outside = h.replace(/<!--email_off-->[\s\S]*?<!--\/email_off-->/g, '');
    assert.doesNotMatch(outside, /@zapbar\.app/, p);
  }
});

test('home page links both stores', () => {
  const h = read('index.html');
  assert.match(h, /href="https:\/\/play\.google\.com\/store\/apps\/details\?id=app\.zapbar\.remote"/);
  assert.match(h, /href="https:\/\/apps\.apple\.com\/app\/id6824589391"/);
});

test('store badges are self-hosted images with alt text', () => {
  const h = read('index.html');
  assert.match(h, /<img src="\/img\/google-play-badge\.png" alt="Get it on Google Play"/);
  assert.match(h, /<img src="\/img\/app-store-badge\.svg" alt="Download on the App Store"/);
});

test('terms page names the trader and every page links it', () => {
  const h = read('terms.html');
  assert.match(h, /Aardvark Hosting, trading as Code 418/);
  assert.match(h, /KvK\) under number 68957157/);
  assert.match(h, /Digital Services Act/);
  for (const p of pages) assert.match(read(p), /<a href="\/terms">Terms<\/a>/, p);
  assert.match(readFileSync(join(DIR, 'Dockerfile'), 'utf8'), /COPY [^\n]*terms\.html/);
});
