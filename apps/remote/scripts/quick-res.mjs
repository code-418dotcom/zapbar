// Generates RemoteViews resources for zapbar-quick from the app's brand tokens. Run: pnpm quick-res
import * as mdi from '@mdi/js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const RES = new URL('../modules/zapbar-quick/android/src/main/res/', import.meta.url).pathname;
const theme = readFileSync(new URL('../src/theme.ts', import.meta.url), 'utf8');
const inputs = readFileSync(new URL('../src/runtime/inputs.ts', import.meta.url), 'utf8');
const zmark = readFileSync(new URL('../src/ui/ZMark.tsx', import.meta.url), 'utf8');

const LIME = theme.match(/LIME = '(#\w+)'/)[1];
const FOREST = theme.match(/FOREST = '(#\w+)'/)[1];
const block = (name) => theme.match(new RegExp(`${name}: \\{([\\s\\S]*?)\\n  \\}`))[1];
const tok = (b, key) => {
  const v = b.match(new RegExp(`\\b${key}: ([^,\\n]+)`))[1].trim();
  return v === 'LIME' ? LIME : v === 'FOREST' ? FOREST : v.replace(/'/g, '');
};
const write = (path, body) => { mkdirSync(RES + path.split('/').slice(0, -1).join('/'), { recursive: true }); writeFileSync(RES + path, body); };

for (const [dir, name] of [['values', 'light'], ['values-night', 'dark']]) {
  const b = block(name);
  const map = { zq_bg: 'bg', zq_surface: 'surface', zq_surface_hi: 'surfaceHi', zq_text: 'text', zq_muted: 'muted', zq_accent: 'accent', zq_on_accent: 'onAccent', zq_warn: 'warn' };
  write(`${dir}/zq_colors.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${Object.entries(map).map(([k, t]) => `  <color name="${k}">${tok(b, t)}</color>`).join('\n')}\n</resources>\n`);
}

const glyphs = [...new Set([...[...inputs.matchAll(/: '([a-z-]+)',/g)].map((m) => m[1]).filter((g) => mdi['mdi' + g.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('')]), 'volume-high', 'volume-off', 'tune-vertical', 'minus', 'plus'])];
for (const g of glyphs) {
  const path = mdi['mdi' + g.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('')];
  write(`drawable/zq_ic_${g.replace(/-/g, '_')}.xml`, `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">\n  <path android:fillColor="#FFFFFFFF" android:pathData="${path}"/>\n</vector>\n`);
}
const z = zmark.match(/Z_PATH = '([^']+)'/)[1];
write('drawable/zq_ic_z.xml', `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="100" android:viewportHeight="100">\n  <path android:strokeColor="#FFFFFFFF" android:strokeWidth="15" android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000" android:pathData="${z}"/>\n</vector>\n`);

// Pill segments: start/end segments carry the rounded ends; the knob segment draws the round knob at its right edge.
const R = 24;
const corners = { start: `android:topLeftRadius="${R}dp" android:bottomLeftRadius="${R}dp"`, mid: '', end: `android:topRightRadius="${R}dp" android:bottomRightRadius="${R}dp"` };
for (const [pos, c] of Object.entries(corners)) {
  const rect = (color) => `<shape android:shape="rectangle"><solid android:color="@color/${color}"/>${c ? `<corners ${c}/>` : ''}</shape>`;
  write(`drawable/zq_seg_track_${pos}.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item>${rect('zq_surface_hi')}</item></layer-list>\n`);
  write(`drawable/zq_seg_fill_${pos}.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item>${rect('zq_accent')}</item></layer-list>\n`);
  const knobCorners = `android:topRightRadius="${R}dp" android:bottomRightRadius="${R}dp"${pos === 'start' ? ` android:topLeftRadius="${R}dp" android:bottomLeftRadius="${R}dp"` : ''}`;
  write(`drawable/zq_seg_knob_${pos}.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n  <item><shape android:shape="rectangle"><solid android:color="@color/zq_accent"/><corners ${knobCorners}/></shape></item>\n  <item android:gravity="end|center_vertical" android:end="5dp" android:width="5dp" android:height="26dp"><shape android:shape="rectangle"><solid android:color="@color/zq_on_accent"/><corners android:radius="3dp"/></shape></item>\n</layer-list>\n`);
}
const round = (name, color, r, stroke) => write(`drawable/${name}.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="@color/${color}"/><corners android:radius="${r}dp"/>${stroke ? `<stroke android:width="1dp" android:color="@color/${stroke}"/>` : ''}</shape>\n`);
round('zq_bg_widget', 'zq_bg', 26);
round('zq_bg_tile', 'zq_surface', 16);
round('zq_bg_tile_on', 'zq_accent', 16);
round('zq_bg_round', 'zq_surface', 999);

const pill = (height) => `<?xml version="1.0" encoding="utf-8"?>\n<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="0dp" android:layout_weight="1" android:layout_height="${height}dp" android:orientation="horizontal">\n${Array.from({ length: 20 }, (_, i) => `  <FrameLayout android:id="@+id/zq_seg_${i}" android:layout_width="0dp" android:layout_height="match_parent" android:layout_weight="1" android:background="@drawable/zq_seg_track_${i === 0 ? 'start' : i === 19 ? 'end' : 'mid'}" />`).join('\n')}\n</LinearLayout>\n`;
write('layout/zq_pill.xml', pill(44));
write('layout/zq_pill_tall.xml', pill(48));
console.log('quick resources written');
