// Renders the Play store graphics from raw emulator screenshots: captioned 1080×2400 phone shots,
// the 1024×500 feature graphic and the 512 px icon. Run: node scripts/store-graphics.mjs
// Raw screenshots: docs/release/graphics/raw/<name>.png (adb exec-out screencap -p).
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = `${ROOT}docs/release/graphics/`;
const FONT = (w) => `data:font/woff2;base64,${readFileSync(`${ROOT}apps/site/fonts/plus-jakarta-sans-${w}.woff2`).toString('base64')}`;
const CHROME = process.env.CHROME_PATH ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const FOREST = '#17301B';
const LIME = '#C8F552';
const Z = 'M27 30H73L27 70H73';

const SHOTS = [
  ['1-remote', 'Every input, one tap'],
  ['2-eq', 'EQ that remembers'],
  ['3-inputs', 'Name your inputs'],
  ['4-widgets', 'Widgets that work'],
  ['5-notification', 'Volume from the notification'],
  ['6-slider', 'A slider anywhere'],
];

const css = `
@font-face { font-family: J; font-weight: 800; src: url(${FONT(800)}) format('woff2'); }
@font-face { font-family: J; font-weight: 500; src: url(${FONT(500)}) format('woff2'); }
* { margin: 0; box-sizing: border-box; }
body { background: ${FOREST}; font-family: J; }`;

const shotHtml = (img, caption) => `<!doctype html><style>${css}
.page { width: 1080px; height: 2400px; display: flex; flex-direction: column; align-items: center; }
.cap { height: 340px; display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 72px;
  color: ${LIME}; font-weight: 800; font-size: 76px; line-height: 1.1; }
.phone { width: 900px; height: 2000px; border-radius: 56px; overflow: hidden; box-shadow: 0 0 0 10px #21402A; }
.phone img { width: 100%; height: 100%; display: block; }
</style><div class="page"><div class="cap">${caption}</div><div class="phone"><img src="${img}"></div></div>`;

const featureHtml = `<!doctype html><style>${css}
.f { width: 1024px; height: 500px; display: flex; align-items: center; gap: 48px; padding: 0 80px; }
.t { color: #F4F6EE; }
.t h1 { font-weight: 800; font-size: 96px; line-height: 1; }
.t p { font-weight: 500; font-size: 34px; color: #A9B8A0; margin-top: 18px; }
</style><div class="f"><svg width="220" height="220" viewBox="0 0 100 100"><path d="${Z}" fill="none" stroke="${LIME}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/></svg>
<div class="t"><h1>Zapbar</h1><p>The remote HEOS forgot to build.</p></div></div>`;

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1080, height: 2400 } });
for (const [name, caption] of SHOTS) {
  const raw = `data:image/png;base64,${readFileSync(`${OUT}raw/${name}.png`).toString('base64')}`;
  await page.setContent(shotHtml(raw, caption), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}${name}.png`, clip: { x: 0, y: 0, width: 1080, height: 2400 } });
}
await page.setViewportSize({ width: 1024, height: 500 });
await page.setContent(featureHtml, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `${OUT}feature-graphic.png`, clip: { x: 0, y: 0, width: 1024, height: 500 } });
await browser.close();
await sharp(`${ROOT}apps/remote/assets/icon.png`).resize(512, 512).png().toFile(`${OUT}icon-512.png`);
console.log('store graphics written');
