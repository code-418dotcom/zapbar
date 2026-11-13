import { createContext, useContext } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

export type Scheme = 'light' | 'dark';

export interface Palette {
  bg: string;
  surface: string;
  surfaceHi: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  danger: string;
  warn: string;
  border: string;
  scrim: string;
}

/** Widest a screen's content grows (dp); wider screens centre a column this size. */
export const MAX_CONTENT_WIDTH = 560;
export const LIME = '#C8F552';
export const FOREST = '#17301B';

export type AccentId = 'lime' | 'coral' | 'sky' | 'amber' | 'lilac';
export type FontId = 'jakarta' | 'comic';
export interface Appearance {
  accent: AccentId;
  font: FontId;
  eleven: boolean;
  pirate: boolean;
  confetti: boolean;
  dad: boolean;
}
export type PerkId = 'eleven' | 'pirate' | 'confetti' | 'dad';
export const PERK_IDS: readonly PerkId[] = ['eleven', 'pirate', 'confetti', 'dad'];
export const DEFAULT_APPEARANCE: Appearance = { accent: 'lime', font: 'jakarta', eleven: false, pirate: false, confetti: false, dad: false };
export const ACCENT_IDS: readonly AccentId[] = ['lime', 'coral', 'sky', 'amber', 'lilac'];
export const FONT_IDS: readonly FontId[] = ['jakarta', 'comic'];

// Brand palette (spec §2). In light mode lime only ever sits on forest (onAccent on accent).
export const palettes: Record<Scheme, Palette> = {
  dark: {
    bg: FOREST,
    surface: '#21402A',
    surfaceHi: '#2C4F33',
    text: '#F4F6EE',
    muted: '#A9B8A0',
    accent: LIME,
    onAccent: FOREST,
    danger: '#FF8A7A',
    warn: '#F5C451',
    border: '#2C4F33',
    scrim: 'rgba(0,0,0,0.55)',
  },
  light: {
    bg: '#F3F6EC',
    surface: '#FFFFFF',
    surfaceHi: '#E3EAD7',
    text: FOREST,
    muted: '#5E7360',
    accent: FOREST,
    onAccent: LIME,
    danger: '#C0392B',
    warn: '#8A5F00',
    border: '#D5DDC8',
    scrim: 'rgba(23,48,27,0.35)',
  },
};

export const FONTS: Record<FontId, { label: string; medium: string; bold: string; extraBold: string }> = {
  jakarta: { label: 'Plus Jakarta Sans', medium: 'PlusJakartaSans_500Medium', bold: 'PlusJakartaSans_700Bold', extraBold: 'PlusJakartaSans_800ExtraBold' },
  // Comic Neue (SIL OFL) is the bundleable stand-in for Comic Sans MS, which is Microsoft-licensed.
  comic: { label: 'Comic Neue — for the lulz', medium: 'ComicNeue_400Regular', bold: 'ComicNeue_700Bold', extraBold: 'ComicNeue_700Bold' },
};
export const font = FONTS.jakarta;

export const typeFor = (f: { medium: string; bold: string; extraBold: string }) =>
  ({
    display: { fontFamily: f.extraBold, fontSize: 28 },
    room: { fontFamily: f.extraBold, fontSize: 22 },
    cardTitle: { fontFamily: f.extraBold, fontSize: 18 },
    tile: { fontFamily: f.bold, fontSize: 13 },
    body: { fontFamily: f.medium, fontSize: 15 },
    secondary: { fontFamily: f.medium, fontSize: 13 },
    chip: { fontFamily: f.bold, fontSize: 14 },
  }) as const;
export type TextStyles = ReturnType<typeof typeFor>;
export const textStyle = typeFor(FONTS.jakarta);

export const ACCENTS: Record<AccentId, { label: string; dark: { accent: string; onAccent: string }; light: { accent: string; onAccent: string } }> = {
  lime: { label: 'Lime', dark: { accent: LIME, onAccent: FOREST }, light: { accent: FOREST, onAccent: LIME } },
  coral: { label: 'Coral', dark: { accent: '#FF9B85', onAccent: FOREST }, light: { accent: FOREST, onAccent: '#FF9B85' } },
  sky: { label: 'Sky', dark: { accent: '#7FD3FF', onAccent: FOREST }, light: { accent: FOREST, onAccent: '#7FD3FF' } },
  amber: { label: 'Amber', dark: { accent: '#FFC857', onAccent: FOREST }, light: { accent: FOREST, onAccent: '#FFC857' } },
  lilac: { label: 'Lilac', dark: { accent: '#C9A7FF', onAccent: FOREST }, light: { accent: FOREST, onAccent: '#C9A7FF' } },
};

export const AppearanceContext = createContext<Appearance>(DEFAULT_APPEARANCE);

export const space = (n: number) => n * 4;
export const radii = { tile: 18, card: 24, pill: 999 } as const;

/** Text in fixed-size boxes (top card, tiles, pills) may scale this far with the system font size. */
export const FIXED_TEXT_SCALE = 1.3;

export interface Theme {
  scheme: Scheme;
  c: Palette;
  type: TextStyles;
  appearance: Appearance;
}

/** Forces a scheme for tests and screenshots. */
export const ThemeOverride = createContext<Scheme | null>(null);

export function schemeFrom(system: string | null | undefined, forced: Scheme | null): Scheme {
  if (forced) return forced;
  return system === 'light' ? 'light' : 'dark';
}

const themes = new Map<string, Theme>();
const themeKey = (scheme: Scheme, a: Appearance) => `${scheme}|${a.accent}|${a.font}|${PERK_IDS.map((id) => (a[id] ? 1 : 0)).join('')}`;

export function themeFor(scheme: Scheme, a: Appearance): Theme {
  const key = themeKey(scheme, a);
  let t = themes.get(key);
  if (!t) {
    t = { scheme, c: { ...palettes[scheme], ...ACCENTS[a.accent][scheme] }, type: typeFor(FONTS[a.font]), appearance: a };
    themes.set(key, t);
  }
  return t;
}

export function useTheme(): Theme {
  const scheme = schemeFrom(useColorScheme(), useContext(ThemeOverride));
  return themeFor(scheme, useContext(AppearanceContext));
}

/** Builds a stylesheet per scheme + accent + font once and returns a hook that picks the current one. */
type StyleInput = Parameters<typeof StyleSheet.create>[0];

export function makeStyles<T extends StyleInput>(fn: (t: Theme) => T): () => Readonly<T> {
  const cache = new Map<string, Readonly<T>>();
  return function useStyles(): Readonly<T> {
    const t = useTheme();
    const key = themeKey(t.scheme, t.appearance);
    let styles = cache.get(key);
    if (!styles) {
      styles = StyleSheet.create(fn(t));
      cache.set(key, styles);
    }
    return styles;
  };
}

const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

/** WCAG contrast ratio of two #RRGGBB colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
