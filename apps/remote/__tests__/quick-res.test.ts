/** @jest-environment node */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ICONS } from '../src/runtime/inputs';
import { palettes } from '../src/theme';

const RES = join(__dirname, '../modules/zapbar-quick/android/src/main/res');
const colors = (dir: string) => Object.fromEntries([...readFileSync(join(RES, dir, 'zq_colors.xml'), 'utf8').matchAll(/<color name="(\w+)">(#[0-9A-Fa-f]{6,8})<\/color>/g)].map((m) => [m[1], m[2]!.toUpperCase()]));

it('widget colours match the app palettes in both schemes', () => {
  for (const [dir, p] of [['values', palettes.light], ['values-night', palettes.dark]] as const) {
    const c = colors(dir);
    expect(c.zq_bg).toBe(p.bg.toUpperCase());
    expect(c.zq_surface).toBe(p.surface.toUpperCase());
    expect(c.zq_surface_hi).toBe(p.surfaceHi.toUpperCase());
    expect(c.zq_text).toBe(p.text.toUpperCase());
    expect(c.zq_muted).toBe(p.muted.toUpperCase());
    expect(c.zq_accent).toBe(p.accent.toUpperCase());
    expect(c.zq_on_accent).toBe(p.onAccent.toUpperCase());
    expect(c.zq_warn).toBe(p.warn.toUpperCase());
  }
});

it('has a drawable for every input icon, the controls and the Z', () => {
  const glyphs = [...Object.values(ICONS), 'volume-high', 'volume-off', 'tune-vertical'];
  for (const g of glyphs) expect(existsSync(join(RES, 'drawable', `zq_ic_${g.replace(/-/g, '_')}.xml`))).toBe(true);
  expect(existsSync(join(RES, 'drawable', 'zq_ic_z.xml'))).toBe(true);
});

it('the widget maps every input icon to its own drawable', () => {
  const kt = readFileSync(join(__dirname, '../modules/zapbar-quick/android/src/main/java/expo/modules/zapbarquick/widget/WidgetRenderer.kt'), 'utf8');
  for (const [id, g] of Object.entries(ICONS)) {
    if (id === 'hdmi') continue; // the else branch
    expect(kt).toContain(`"${id}" -> R.drawable.zq_ic_${g.replace(/-/g, '_')}`);
  }
});

it('the pill layout has exactly 20 segments', () => {
  const xml = readFileSync(join(RES, 'layout', 'zq_pill.xml'), 'utf8');
  for (let i = 0; i < 20; i++) expect(xml).toContain(`@+id/zq_seg_${i}"`);
  expect(xml).not.toContain('@+id/zq_seg_20"');
});
