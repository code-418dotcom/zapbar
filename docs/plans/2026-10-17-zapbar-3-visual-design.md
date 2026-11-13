# Zapbar Visual Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the working Zapbar Android app in the owner's brand:
- light and dark mode;
- a fixed-height top card for streaming, the active input or offline;
- pill controls;
- inline rename with explicit save;
- the Z as launcher icon and splash.

The app's behaviour does not change.

**Architecture:**
- **Theme:** `src/theme.ts` becomes the single source of brand tokens: two palettes, type scale, radii, `useTheme()` and `makeStyles()`. Every component reads colours through it, and a test forbids hex colours anywhere else.
- **New building blocks:** `Pill`, `PillSlider` (a pill track drawn over a transparent native slider, so the gesture and accessibility stay native), `TopCard` and `ZMark`.
- **Fonts:** Plus Jakarta Sans ships inside the app. A `FontGate` holds the splash until the fonts load.

**Tech Stack:**
- Expo SDK 58 (React Native 0.88), Expo Router, TypeScript.
- New dependencies: `@expo-google-fonts/plus-jakarta-sans`, `expo-font`, `expo-splash-screen`, `expo-system-ui` and `react-native-svg`. `sharp` is dev-only, for icon generation.
- Tests: Jest (jest-expo) and RNTL 14. RNTL 14 is async: `await render`, `await fireEvent`.

**Spec:** `docs/specs/2026-10-17-zapbar-visual-design.md` (parent: `docs/specs/2026-10-16-zapbar-design.md`). Mockups: `.superpowers/brainstorm/2656378-1792222952/content/visual-direction-v3.html` and `idle-top.html`.

## Global Constraints

- **No behaviour change.** Every existing test stays green unless a task explicitly replaces it, which happens only where the spec changes the UI: the Night switch, renaming, and the strip and banner becoming the top card. The owner-requirement tests "one tap on an input switches away from a stream" and "keeps every visible input tile rendered while a stream plays" are never edited.
- **Colours** come only from `src/theme.ts`. In light mode, lime appears only on forest (`onAccent` on `accent`). Text tokens meet WCAG AA 4.5:1 on `bg` and `surface`.
- **Fonts are bundled.** The app makes no new network calls; it still talks only to LAN devices.
- **Brand wording.** "HEOS" and "Denon" appear only in the About disclaimer: "Zapbar is not affiliated with Denon or HEOS."
- **Tap targets** are at least 48 dp.
- **Android package id** stays `app.zapbar.remote`.
- **Commits.** Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F
  ```
- **Branch.** Work on `feat/design`, created from `main`. Merging is the owner's call.
- **Native modules have no JS implementation under Jest.** Mock them once in `apps/remote/jest.setup.ts` (pattern already used for `react-native-tcp-socket` and `@expo/vector-icons`).
- **Library versions are newer than the plan author's training data.**
  - If an installed API differs from this plan, adapt with the smallest change and ledger a ruling. Examples: `expo-splash-screen` config keys, `react-native-svg` under Jest, or expo-router's `useNavigation().addListener('beforeRemove')` typing.
  - Never weaken an assertion.
- **Builds on the dev machine** can hit corrupt Gradle cache files (RAM issue). After a failed build, run `~/projects/zapbar/.superpowers/bin/fix-gradle-cache`, run `./gradlew --stop` and retry, up to 3 times.
- **Test APKs:**
  - Phone: `-PreactNativeArchitectures=arm64-v8a -Pexpo.useLegacyPackaging=true`, copied to `E:\projects\zapbar\APK\`.
  - Emulator: `x86_64` builds. The emulator is `Zapbar_Phone` on Windows, driven from WSL through `/mnt/c/Users/<you>/AppData/Local/Android/Sdk/platform-tools/adb.exe`.

## Review Focus

1. **The phone switches light/dark while the app is open.** The whole UI re-themes at once, with no stale colours from a cached stylesheet. Task 1 test: "makeStyles returns the other scheme's styles after the scheme changes".
2. **Fonts fail to load.** The app still opens on the system font, and the splash never stays stuck. Task 3 test: "a font load error still renders the app and hides the splash".
3. **Very long titles or input names, or a stream with no artwork.** Text stays on one line with an ellipsis, a Z placeholder replaces the art, and the card height never changes. Task 5 test: "long text and missing art keep the card height".
4. **Large accessibility font size.** Text in fixed-size places (top card, tiles, pills) is capped with `maxFontSizeMultiplier` and never overflows its box. Tests: Task 5 "caps font scaling in the fixed-height card" and Task 6 "tile labels cap font scaling".
5. **Leaving the inputs editor with an unsaved name**, by back gesture or hardware back. A "Save changes?" prompt appears, and nothing is saved or lost silently. Task 9 tests: "pendingRenames lists only changed names" and "reports unsaved drafts to the screen". The prompt itself is checked on the device in Task 11.

---

### Task 1: Theme foundation

**Files:**
- Modify: `apps/remote/src/theme.ts`
- Test: `apps/remote/__tests__/theme.test.tsx`

**Interfaces:**
- Produces:
  - `type Scheme = 'light' | 'dark'`
  - `interface Palette { bg; surface; surfaceHi; text; muted; accent; onAccent; danger; warn; border; scrim }` (all `string`)
  - `palettes: Record<Scheme, Palette>`, `LIME`, `FOREST`
  - `font`, `textStyle`, `space(n)`, `radii`
  - `schemeFrom(system, forced): Scheme`
  - `ThemeOverride` (React context of `Scheme | null`)
  - `useTheme(): { scheme: Scheme; c: Palette }`
  - `makeStyles(fn: (t: Theme) => T): () => T`
  - `contrast(a, b): number`
  - The legacy `colors` and `radius` exports stay until Task 10, so unmigrated components keep compiling.

- [ ] **Step 1: Create the branch**

```bash
cd ~/projects/zapbar && git checkout main && git pull -q && git checkout -b feat/design
```

- [ ] **Step 2: Write the failing tests**

`apps/remote/__tests__/theme.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { contrast, LIME, makeStyles, palettes, schemeFrom, ThemeOverride, useTheme } from '../src/theme';

it('follows the system scheme, defaults to dark, and honours an override', () => {
  expect(schemeFrom('light', null)).toBe('light');
  expect(schemeFrom('dark', null)).toBe('dark');
  expect(schemeFrom(null, null)).toBe('dark');
  expect(schemeFrom('dark', 'light')).toBe('light');
});

it('useTheme returns the palette for the overridden scheme', async () => {
  const Probe = () => <Text>{useTheme().c.bg}</Text>;
  await render(<ThemeOverride.Provider value="light"><Probe /></ThemeOverride.Provider>);
  expect(screen.getByText(palettes.light.bg)).toBeTruthy();
});

it('makeStyles returns the other scheme\'s styles after the scheme changes', async () => {
  const useStyles = makeStyles(({ c }) => ({ box: { backgroundColor: c.bg } }));
  const Probe = () => <Text testID="probe" style={useStyles().box}>x</Text>;
  const { rerender } = await render(<ThemeOverride.Provider value="dark"><Probe /></ThemeOverride.Provider>);
  expect(screen.getByTestId('probe').props.style.backgroundColor).toBe(palettes.dark.bg);
  await rerender(<ThemeOverride.Provider value="light"><Probe /></ThemeOverride.Provider>);
  expect(screen.getByTestId('probe').props.style.backgroundColor).toBe(palettes.light.bg);
});

describe.each(['dark', 'light'] as const)('%s palette', (scheme) => {
  const p = palettes[scheme];
  it('keeps text tokens at WCAG AA on bg and surface', () => {
    for (const fg of [p.text, p.muted, p.warn, p.danger]) {
      expect(contrast(fg, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg, p.surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
  });
});

it('never puts lime on a light background in light mode', () => {
  const l = palettes.light;
  for (const token of [l.bg, l.surface, l.surfaceHi, l.text, l.muted, l.warn, l.danger, l.border, l.accent]) {
    expect(token.toUpperCase()).not.toBe(LIME);
  }
  expect(l.onAccent).toBe(LIME);
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd apps/remote && pnpm test theme`
Expected: FAIL. `schemeFrom`, `palettes` and the other new exports are not exported.

- [ ] **Step 4: Implement**

Replace `apps/remote/src/theme.ts`:
```ts
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

export const LIME = '#C8F552';
export const FOREST = '#17301B';

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

export const font = {
  medium: 'PlusJakartaSans_500Medium',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
};

export const textStyle = {
  display: { fontFamily: font.extraBold, fontSize: 28 },
  room: { fontFamily: font.extraBold, fontSize: 22 },
  cardTitle: { fontFamily: font.extraBold, fontSize: 18 },
  tile: { fontFamily: font.bold, fontSize: 13 },
  body: { fontFamily: font.medium, fontSize: 15 },
  secondary: { fontFamily: font.medium, fontSize: 13 },
  chip: { fontFamily: font.bold, fontSize: 14 },
} as const;

export const space = (n: number) => n * 4;
export const radii = { tile: 18, card: 24, pill: 999 } as const;

/** Text in fixed-size boxes (top card, tiles, pills) may scale this far with the system font size. */
export const FIXED_TEXT_SCALE = 1.3;

export interface Theme {
  scheme: Scheme;
  c: Palette;
}

/** Forces a scheme for tests and screenshots. */
export const ThemeOverride = createContext<Scheme | null>(null);

export function schemeFrom(system: string | null | undefined, forced: Scheme | null): Scheme {
  if (forced) return forced;
  return system === 'light' ? 'light' : 'dark';
}

export function useTheme(): Theme {
  const scheme = schemeFrom(useColorScheme(), useContext(ThemeOverride));
  return { scheme, c: palettes[scheme] };
}

/** Builds a stylesheet per scheme once and returns a hook that picks the current one. */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(fn: (t: Theme) => T): () => T {
  const cache = new Map<Scheme, T>();
  return function useStyles(): T {
    const t = useTheme();
    let styles = cache.get(t.scheme);
    if (!styles) {
      styles = StyleSheet.create(fn(t));
      cache.set(t.scheme, styles);
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

// Legacy tokens: removed in Task 10 once every component uses useTheme().
export const colors = {
  bg: '#0E0F12',
  surface: '#1A1C21',
  surfaceHi: '#252830',
  border: '#2E323B',
  text: '#F2F3F5',
  muted: '#9AA0AA',
  accent: '#5B8CFF',
  accentText: '#0E0F12',
  danger: '#FF6B6B',
  warn: '#F5C451',
};
export const radius = 14;
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS. If a contrast assertion fails, darken or lighten only that token until it passes, and ledger the new value.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(remote): brand theme tokens, light/dark palettes, makeStyles

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 2: Brand mark, launcher icon, splash and app config

**Files:**
- Create: `apps/remote/assets/brand/z.svg`, `apps/remote/src/ui/ZMark.tsx`, `apps/remote/scripts/brand-assets.mjs`
- Regenerate: `apps/remote/assets/icon.png`, `android-icon-foreground.png`, `android-icon-background.png`, `android-icon-monochrome.png`, `splash-icon.png`
- Modify: `apps/remote/app.json`, `apps/remote/package.json`
- Test: `apps/remote/__tests__/brand.test.tsx`

**Interfaces:**
- Consumes: `LIME`, `FOREST` from Task 1.
- Produces:
  - `Z_PATH: string`
  - `ZMark({ size?: number; color: string; testID?: string })`
  - npm script `brand`.

- [ ] **Step 1: Install dependencies**

```bash
cd ~/projects/zapbar/apps/remote
pnpm expo install react-native-svg expo-splash-screen expo-system-ui expo-font @expo-google-fonts/plus-jakarta-sans
pnpm add -D sharp
```
`expo-system-ui` is what makes `userInterfaceStyle: "automatic"` work on Android. The Plan 2 prebuild warned about it.

- [ ] **Step 2: Write the failing tests**

`apps/remote/__tests__/brand.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FOREST, LIME } from '../src/theme';
import { Z_PATH, ZMark } from '../src/ui/ZMark';

it('draws the Z in the requested colour', async () => {
  await render(<ZMark size={32} color={LIME} />);
  expect(screen.getByLabelText('Zapbar')).toBeTruthy();
  expect(screen.getByTestId('zmark-path').props.stroke).toBe(LIME);
});

it('ships the same Z path as the SVG source', () => {
  const svg = readFileSync(join(__dirname, '../assets/brand/z.svg'), 'utf8');
  expect(svg).toContain(`d="${Z_PATH}"`);
});

it('configures the brand icon, splash and automatic light/dark', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '../app.json'), 'utf8')).expo;
  expect(app.android.package).toBe('app.zapbar.remote');
  expect(app.userInterfaceStyle).toBe('automatic');
  expect(app.android.adaptiveIcon.backgroundColor).toBe(FOREST);
  expect(app.android.adaptiveIcon.monochromeImage).toBe('./assets/android-icon-monochrome.png');
  const splash = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen');
  expect(splash?.[1]).toMatchObject({ image: './assets/splash-icon.png', backgroundColor: FOREST });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm test brand`
Expected: FAIL with "Cannot find module '../src/ui/ZMark'".

- [ ] **Step 4: Write the mark, the component and the generator**

`apps/remote/assets/brand/z.svg` is traced from the owner's `Lime geometric Z logo-5.png`: round caps, even stroke.
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M27 30H73L27 70H73" fill="none" stroke="#C8F552" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

`apps/remote/src/ui/ZMark.tsx`:
```tsx
import Svg, { Path } from 'react-native-svg';

/** Same path as assets/brand/z.svg (checked by a test). */
export const Z_PATH = 'M27 30H73L27 70H73';

export function ZMark({ size = 24, color, testID }: { size?: number; color: string; testID?: string }) {
  return (
    <Svg testID={testID} width={size} height={size} viewBox="0 0 100 100" accessibilityRole="image" accessibilityLabel="Zapbar">
      <Path testID="zmark-path" d={Z_PATH} fill="none" stroke={color} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
```

`apps/remote/scripts/brand-assets.mjs`:
```js
// Regenerates the launcher icon and splash PNGs from the Z path. Run: pnpm brand
import sharp from 'sharp';

const LIME = '#C8F552';
const FOREST = '#17301B';
const Z = 'M27 30H73L27 70H73';
const OUT = new URL('../assets/', import.meta.url).pathname;

// scale < 1 shrinks the Z inside the square (adaptive icons need it inside the centre 66%).
const svg = ({ stroke, scale = 1, bg }) => {
  const size = 100 / scale;
  const o = (size - 100) / 2;
  const rect = bg ? `<rect x="${-o}" y="${-o}" width="${size}" height="${size}" fill="${bg}"/>` : '';
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-o} ${-o} ${size} ${size}">${rect}` +
      `<path d="${Z}" fill="none" stroke="${stroke}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  );
};

const write = async (name, buf) => {
  await sharp(buf, { density: 1200 }).resize(1024, 1024).png().toFile(OUT + name);
  console.log('wrote', name);
};

await write('icon.png', svg({ stroke: LIME, scale: 0.75, bg: FOREST }));
await write('android-icon-foreground.png', svg({ stroke: LIME, scale: 0.7 }));
await write('android-icon-background.png', svg({ stroke: FOREST, bg: FOREST }));
await write('android-icon-monochrome.png', svg({ stroke: '#FFFFFF', scale: 0.7 }));
await write('splash-icon.png', svg({ stroke: LIME }));
```

In `apps/remote/package.json`, add to `scripts`:
```json
"brand": "node scripts/brand-assets.mjs"
```

- [ ] **Step 5: Generate the PNGs and check them**

Run: `pnpm brand && node -e "const s=require('sharp');Promise.all(['icon','android-icon-foreground','android-icon-background','android-icon-monochrome','splash-icon'].map(n=>s('assets/'+n+'.png').metadata().then(m=>console.log(n,m.width,m.height,m.hasAlpha))))"`
Expected:
- 5 "wrote" lines;
- each file 1024 × 1024;
- `android-icon-foreground`, `android-icon-monochrome` and `splash-icon` have alpha.

Open `assets/icon.png` with the Read tool and check by eye: a lime Z centred on forest green.

- [ ] **Step 6: Update app.json**

Edit `apps/remote/app.json`:
- Set `"userInterfaceStyle": "automatic"`.
- Set `"icon": "./assets/icon.png"`.
- Set `android.adaptiveIcon` to:
  ```json
  {
    "backgroundColor": "#17301B",
    "foregroundImage": "./assets/android-icon-foreground.png",
    "backgroundImage": "./assets/android-icon-background.png",
    "monochromeImage": "./assets/android-icon-monochrome.png"
  }
  ```
- Add this plugin entry to `plugins` (keep the existing ones):
  ```json
  ["expo-splash-screen", { "image": "./assets/splash-icon.png", "imageWidth": 160, "backgroundColor": "#17301B", "dark": { "image": "./assets/splash-icon.png", "backgroundColor": "#17301B" } }]
  ```
- Remove the top-level `splash` key if the template left one; the plugin replaces it.

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS. If `react-native-svg` fails to render under Jest, add a mock to `jest.setup.ts` and ledger it as a ruling. The mock maps `Svg` and `Path` to `View`s that keep their props, using the same `createElement` pattern as the vector-icons mock.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(remote): Z mark, adaptive launcher icon, splash, automatic light/dark

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 3: Bundled fonts and a theme-aware root layout

**Files:**
- Create: `apps/remote/src/ui/FontGate.tsx`
- Modify: `apps/remote/app/_layout.tsx`, `apps/remote/jest.setup.ts`
- Test: `apps/remote/__tests__/fontgate.test.tsx`

**Interfaces:**
- Consumes: `useTheme` (Task 1); the packages installed in Task 2.
- Produces: `FontGate({ children })`. It renders `children` once the fonts are loaded or have failed, and hides the splash at that point.

- [ ] **Step 1: Add the default Jest mocks**

Append to `apps/remote/jest.setup.ts`:
```ts
// Fonts and splash are native; tests run with fonts "loaded" unless a test overrides the mock.
jest.mock('@expo-google-fonts/plus-jakarta-sans', () => ({
  useFonts: jest.fn(() => [true, null]),
  PlusJakartaSans_500Medium: 1,
  PlusJakartaSans_700Bold: 2,
  PlusJakartaSans_800ExtraBold: 3,
}));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(async () => true), hideAsync: jest.fn(async () => true) }));
```

- [ ] **Step 2: Write the failing tests**

`apps/remote/__tests__/fontgate.test.tsx`:
```tsx
import { useFonts } from '@expo-google-fonts/plus-jakarta-sans';
import { render, screen } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Text } from 'react-native';
import { FontGate } from '../src/ui/FontGate';

const mockFonts = useFonts as jest.Mock;
const hide = SplashScreen.hideAsync as jest.Mock;
beforeEach(() => hide.mockClear());

it('keeps the splash up and renders nothing until the fonts load', async () => {
  mockFonts.mockReturnValueOnce([false, null]);
  await render(<FontGate><Text>app</Text></FontGate>);
  expect(screen.queryByText('app')).toBeNull();
  expect(hide).not.toHaveBeenCalled();
});

it('renders the app and hides the splash once the fonts load', async () => {
  mockFonts.mockReturnValueOnce([true, null]);
  await render(<FontGate><Text>app</Text></FontGate>);
  expect(screen.getByText('app')).toBeTruthy();
  expect(hide).toHaveBeenCalled();
});

it('a font load error still renders the app and hides the splash', async () => {
  mockFonts.mockReturnValueOnce([false, new Error('font failed')]);
  await render(<FontGate><Text>app</Text></FontGate>);
  expect(screen.getByText('app')).toBeTruthy();
  expect(hide).toHaveBeenCalled();
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm test fontgate`
Expected: FAIL with "Cannot find module '../src/ui/FontGate'".

- [ ] **Step 4: Implement**

`apps/remote/src/ui/FontGate.tsx`:
```tsx
import { PlusJakartaSans_500Medium, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, useFonts } from '@expo-google-fonts/plus-jakarta-sans';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';

void SplashScreen.preventAutoHideAsync().catch(() => {});

/** Holds the splash until the bundled fonts load. A load error falls back to the system font, never a stuck splash. */
export function FontGate({ children }: { children: ReactNode }) {
  const [loaded, error] = useFonts({ PlusJakartaSans_500Medium, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  const ready = loaded || !!error;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  return ready ? <>{children}</> : null;
}
```

Replace `apps/remote/app/_layout.tsx`:
```tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { RuntimeProvider } from '../src/runtime/RuntimeProvider';
import { useTheme } from '../src/theme';
import { FontGate } from '../src/ui/FontGate';

export default function RootLayout() {
  const { scheme, c } = useTheme();
  return (
    <FontGate>
      <RuntimeProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />
      </RuntimeProvider>
    </FontGate>
  );
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(remote): bundle Plus Jakarta Sans behind a FontGate; theme-aware root layout

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 4: Pill and PillSlider primitives

**Files:**
- Create: `apps/remote/src/ui/Pill.tsx`, `apps/remote/src/ui/PillSlider.tsx`
- Test: `apps/remote/__tests__/primitives.test.tsx`

**Interfaces:**
- Consumes: `makeStyles`, `useTheme`, `radii`, `space`, `textStyle`, `FIXED_TEXT_SCALE`, `palettes`, `ThemeOverride` (Task 1).
- Produces:
  - `type IconName` (MaterialCommunityIcons glyph name)
  - `Pill({ label, onPress, selected?, disabled?, variant?: 'chip'|'outline'|'primary', tone?: 'bg'|'surface', icon?, toggle?, accessibilityLabel?, testID?, block? })`
  - `pct(value: number | null, min: number, max: number): number`
  - `PillSlider({ testID, accessibilityLabel, min, max, value, disabled?, onValueChange, onSlidingStart?, onSlidingComplete? })`

- [ ] **Step 1: Write the failing tests**

`apps/remote/__tests__/primitives.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { palettes, ThemeOverride } from '../src/theme';
import { Pill } from '../src/ui/Pill';
import { pct, PillSlider } from '../src/ui/PillSlider';

const dark = (ui: ReactElement) => <ThemeOverride.Provider value="dark">{ui}</ThemeOverride.Provider>;
const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('Pill', () => {
  it('presses, reports selection and uses onAccent text when selected', async () => {
    const onPress = jest.fn();
    await render(dark(<Pill label="Movie" selected onPress={onPress} />));
    await fireEvent.press(screen.getByText('Movie'));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Movie' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(flat(screen.getByText('Movie').props.style).color).toBe(palettes.dark.onAccent);
  });

  it('ignores presses while disabled', async () => {
    const onPress = jest.fn();
    await render(dark(<Pill label="EQ" disabled onPress={onPress} />));
    await fireEvent.press(screen.getByText('EQ'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('acts as a switch when toggle is set', async () => {
    await render(dark(<Pill label="Night" toggle selected accessibilityLabel="Night mode" onPress={jest.fn()} />));
    expect(screen.getByLabelText('Night mode').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('caps font scaling on its label', async () => {
    await render(dark(<Pill label="Dialogue" onPress={jest.fn()} />));
    expect(screen.getByText('Dialogue').props.maxFontSizeMultiplier).toBeGreaterThan(1);
  });
});

describe('PillSlider', () => {
  it('maps the value to a fill width and clamps it', () => {
    expect(pct(42, 0, 100)).toBe(42);
    expect(pct(5, 0, 10)).toBe(50);
    expect(pct(null, 0, 10)).toBe(0);
    expect(pct(150, 0, 100)).toBe(100);
  });

  it('drives a native slider with step 1 and forwards changes', async () => {
    const onValueChange = jest.fn();
    await render(dark(<PillSlider testID="volume" accessibilityLabel="Volume" min={0} max={100} value={42} onValueChange={onValueChange} />));
    const slider = screen.getByTestId('volume');
    expect(slider.props.value).toBe(42);
    expect(slider.props.step).toBe(1);
    expect(flat(screen.getByTestId('volume-fill').props.style).width).toBe('42%');
    await fireEvent(slider, 'valueChange', 50);
    expect(onValueChange).toHaveBeenCalledWith(50);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test primitives`
Expected: FAIL with "Cannot find module '../src/ui/Pill'".

- [ ] **Step 3: Implement**

`apps/remote/src/ui/Pill.tsx`:
```tsx
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, Text } from 'react-native';
import { FIXED_TEXT_SCALE, makeStyles, radii, space, textStyle, useTheme } from '../theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Props {
  label: string;
  onPress(): void;
  selected?: boolean;
  disabled?: boolean;
  /** chip: filled surface; outline: border only; primary: always accent. */
  variant?: 'chip' | 'outline' | 'primary';
  /** What the pill sits on: on a surface card, chips use surfaceHi so they stay visible. */
  tone?: 'bg' | 'surface';
  icon?: IconName;
  toggle?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  block?: boolean;
}

export function Pill({ label, onPress, selected = false, disabled = false, variant = 'chip', tone = 'bg', icon, toggle = false, accessibilityLabel, testID, block = false }: Props) {
  const { c } = useTheme();
  const s = useStyles();
  const filled = variant === 'primary' || selected;
  const fg = filled ? c.onAccent : c.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={toggle ? 'switch' : 'button'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={toggle ? { checked: selected, disabled } : { selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.base,
        variant === 'outline' ? s.outline : tone === 'surface' ? s.chipOnSurface : s.chip,
        filled && s.filled,
        block && s.block,
        pressed && s.pressed,
        disabled && s.disabled,
      ]}
    >
      {icon && <MaterialCommunityIcons name={icon} size={18} color={fg} />}
      <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={[s.label, { color: fg }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ c }) => ({
  base: { minHeight: 48, paddingHorizontal: space(4), borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2) },
  chip: { backgroundColor: c.surface },
  chipOnSurface: { backgroundColor: c.surfaceHi },
  outline: { borderWidth: 1, borderColor: c.border },
  filled: { backgroundColor: c.accent, borderColor: c.accent },
  block: { alignSelf: 'stretch' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  label: { ...textStyle.chip },
}));
```

`apps/remote/src/ui/PillSlider.tsx`:
```tsx
import Slider from '@react-native-community/slider';
import { StyleSheet, View } from 'react-native';
import { makeStyles, radii } from '../theme';

interface Props {
  testID: string;
  accessibilityLabel: string;
  min: number;
  max: number;
  value: number | null;
  disabled?: boolean;
  onValueChange(v: number): void;
  onSlidingStart?(v: number): void;
  onSlidingComplete?(v: number): void;
}

export const pct = (value: number | null, min: number, max: number): number => {
  if (value === null || max <= min) return 0;
  return Math.round(((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100);
};

/**
 * The brand pill slider (spec §3.4). The visible track, fill and knob are plain views; a transparent native
 * slider on top takes the gesture, so dragging and the accessibility increment/decrement actions stay native.
 */
export function PillSlider({ testID, accessibilityLabel, min, max, value, disabled, onValueChange, onSlidingStart, onSlidingComplete }: Props) {
  const s = useStyles();
  return (
    <View style={[s.track, disabled && s.disabled]}>
      <View testID={`${testID}-fill`} style={[s.fill, { width: `${pct(value, min, max)}%` }]}>
        <View style={s.knob} />
      </View>
      <Slider
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        style={StyleSheet.absoluteFill}
        minimumValue={min}
        maximumValue={max}
        step={1}
        value={value ?? min}
        disabled={disabled}
        onValueChange={onValueChange}
        onSlidingStart={onSlidingStart}
        onSlidingComplete={onSlidingComplete}
        minimumTrackTintColor="transparent"
        maximumTrackTintColor="transparent"
        thumbTintColor="transparent"
      />
    </View>
  );
}

const useStyles = makeStyles(({ c }) => ({
  track: { height: 48, borderRadius: radii.pill, backgroundColor: c.surfaceHi, justifyContent: 'center', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, minWidth: 48, borderRadius: radii.pill, backgroundColor: c.accent, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 6 },
  knob: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.onAccent },
  disabled: { opacity: 0.4 },
}));
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(remote): Pill and PillSlider brand primitives

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 5: Top card (streaming / input / offline)

**Files:**
- Create: `apps/remote/src/ui/TopCard.tsx`
- Delete: `apps/remote/src/ui/NowPlayingStrip.tsx`, `apps/remote/src/ui/ConnectionBanner.tsx`
- Modify: `apps/remote/src/ui/RemoteView.tsx` (swap the strip and banner for `TopCard`; Task 7 restyles the rest)
- Modify: `apps/remote/__tests__/blocks.test.tsx` (remove the `NowPlayingStrip` and `ConnectionBanner` describes; they move to the new test)
- Test: `apps/remote/__tests__/topcard.test.tsx`

**Interfaces:**
- Consumes:
  - `Pill` (Task 4), `ZMark` (Task 2);
  - theme (Task 1): `FIXED_TEXT_SCALE`, `textStyle`, `radii`, `space`;
  - `ICONS` and `IconId` from `src/runtime/inputs`;
  - `modeLabel` from `src/ui/SoundRow`;
  - heos-core types `ConnectionStatus`, `NowPlaying`, `PlayState`.
- Produces:
  - `TOP_CARD_HEIGHT = 196`
  - `DEGRADED_TEXT = 'Soundbar settings unavailable'`
  - `bannerFor(status, hasCaps, onLan)`, moved verbatim from `ConnectionBanner`
  - `interface CardInput { label: string; icon: IconId; name: string }`
  - `TopCard({ status, hasCaps, onLan, np, playState, input, soundMode, disabled, onPlayPause, onNext, onPrevious, onOpenApp?, onRetry, onEditInput? })`

- [ ] **Step 1: Write the failing tests**

`apps/remote/__tests__/topcard.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { bannerFor, TOP_CARD_HEIGHT, TopCard } from '../src/ui/TopCard';
import { SPOTIFY } from '../test-utils/fixtures';

const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const PS5 = { label: 'PS5', icon: 'playstation' as const, name: 'HDMI 1' };
const props = (over: Partial<ComponentProps<typeof TopCard>> = {}): ComponentProps<typeof TopCard> => ({
  status: 'ready', hasCaps: true, onLan: true, np: null, playState: 'play', input: PS5, soundMode: 'MOVIE_NORMAL', disabled: false,
  onPlayPause: jest.fn(), onNext: jest.fn(), onPrevious: jest.fn(), onRetry: jest.fn(), ...over,
});

it('streaming: shows the track and drives transport and the source app', async () => {
  const p = props({ np: SPOTIFY, input: null, onOpenApp: jest.fn() });
  await render(<TopCard {...p} />);
  expect(screen.getByText('Golden')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Pause'));
  await fireEvent.press(screen.getByLabelText('Next'));
  await fireEvent.press(screen.getByLabelText('Previous'));
  await fireEvent.press(screen.getByText('Open Spotify'));
  expect(p.onPlayPause).toHaveBeenCalled();
  expect(p.onNext).toHaveBeenCalled();
  expect(p.onPrevious).toHaveBeenCalled();
  expect(p.onOpenApp).toHaveBeenCalled();
});

it('on an input: shows the input, its port and the sound mode; long-press edits it', async () => {
  const p = props({ onEditInput: jest.fn() });
  await render(<TopCard {...p} />);
  expect(screen.getByText('PS5')).toBeTruthy();
  expect(screen.getByText('HDMI 1 · Movie')).toBeTruthy();
  await fireEvent(screen.getByLabelText('Now on PS5'), 'longPress');
  expect(p.onEditInput).toHaveBeenCalled();
});

it('offline: shows the reason and retries; off the LAN there is no retry', async () => {
  const p = props({ status: 'offline' });
  const { rerender } = await render(<TopCard {...p} />);
  expect(screen.getByText('Reconnecting…')).toBeTruthy();
  await fireEvent.press(screen.getByText('Retry'));
  expect(p.onRetry).toHaveBeenCalled();
  await rerender(<TopCard {...props({ onLan: false })} />);
  expect(screen.getByText('Connect to your home Wi-Fi')).toBeTruthy();
  expect(screen.queryByText('Retry')).toBeNull();
});

it('degraded: keeps the input visible and adds a note', async () => {
  await render(<TopCard {...props({ status: 'degraded' })} />);
  expect(screen.getByText('PS5')).toBeTruthy();
  expect(screen.getByText('Soundbar settings unavailable')).toBeTruthy();
});

it('keeps one fixed height in every state', async () => {
  const states = [props({ np: SPOTIFY, input: null }), props(), props({ status: 'offline' }), props({ input: null })];
  for (const p of states) {
    const { unmount } = await render(<TopCard {...p} />);
    expect(flat(screen.getByTestId('top-card').props.style).height).toBe(TOP_CARD_HEIGHT);
    await unmount();
  }
});

it('long text and missing art keep the card height', async () => {
  const long = 'An extremely long track title that would never fit on one line of a phone screen';
  await render(<TopCard {...props({ np: { ...SPOTIFY, title: long, artUrl: null }, input: null })} />);
  expect(screen.getByText(long).props.numberOfLines).toBe(1);
  expect(screen.getByLabelText('Zapbar')).toBeTruthy();
  expect(flat(screen.getByTestId('top-card').props.style).height).toBe(TOP_CARD_HEIGHT);
});

it('caps font scaling in the fixed-height card', async () => {
  await render(<TopCard {...props()} />);
  expect(screen.getByText('PS5').props.maxFontSizeMultiplier).toBeGreaterThan(1);
  expect(screen.getByText('HDMI 1 · Movie').props.maxFontSizeMultiplier).toBeGreaterThan(1);
});

describe('bannerFor', () => {
  it('prefers the LAN message', () => {
    expect(bannerFor('offline', true, false)).toEqual({ text: 'Connect to your home Wi-Fi', retry: false });
  });

  it('covers each connection state', () => {
    expect(bannerFor('ready', true, true)).toBeNull();
    expect(bannerFor('offline', true, true)).toEqual({ text: 'Reconnecting…', retry: true });
    expect(bannerFor('degraded', true, true)).toEqual({ text: 'Soundbar settings unavailable', retry: false });
    expect(bannerFor('connecting', false, true)).toEqual({ text: 'Connecting…', retry: false });
    expect(bannerFor('probing', true, true)).toBeNull();
  });
});
```

In `apps/remote/__tests__/blocks.test.tsx`:
- Delete the imports of `bannerFor`, `ConnectionBanner` and `NowPlayingStrip`.
- Delete the `describe('NowPlayingStrip', …)` and `describe('ConnectionBanner', …)` blocks. Their assertions now live in `topcard.test.tsx`, unchanged.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test topcard`
Expected: FAIL with "Cannot find module '../src/ui/TopCard'".

- [ ] **Step 3: Implement**

`apps/remote/src/ui/TopCard.tsx`:
```tsx
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ConnectionStatus, NowPlaying, PlayState } from '@zapbar/heos-core';
import { Image, Pressable, Text, View } from 'react-native';
import { ICONS, type IconId } from '../runtime/inputs';
import { FIXED_TEXT_SCALE, makeStyles, radii, space, textStyle, useTheme } from '../theme';
import { Pill } from './Pill';
import { modeLabel } from './SoundRow';
import { ZMark } from './ZMark';

/** One height for every state, so switching between a stream and an input never moves the tiles below. */
export const TOP_CARD_HEIGHT = 196;
export const DEGRADED_TEXT = 'Soundbar settings unavailable';

export function bannerFor(status: ConnectionStatus, hasCaps: boolean, onLan: boolean): { text: string; retry: boolean } | null {
  if (!onLan) return { text: 'Connect to your home Wi-Fi', retry: false };
  if (status === 'offline') return { text: 'Reconnecting…', retry: true };
  if (status === 'degraded') return { text: DEGRADED_TEXT, retry: false };
  // A quick reconnect on app resume keeps the last state on screen without a banner.
  if ((status === 'connecting' || status === 'probing') && !hasCaps) return { text: 'Connecting…', retry: false };
  return null;
}

export interface CardInput {
  label: string;
  icon: IconId;
  /** The device's own name for the port, e.g. "HDMI 1". */
  name: string;
}

interface Props {
  status: ConnectionStatus;
  hasCaps: boolean;
  onLan: boolean;
  np: NowPlaying | null;
  playState: PlayState;
  input: CardInput | null;
  soundMode: string | null;
  disabled: boolean;
  onPlayPause(): void;
  onNext(): void;
  onPrevious(): void;
  onOpenApp?: () => void;
  onRetry(): void;
  onEditInput?: () => void;
}

export function TopCard(p: Props) {
  const { c } = useTheme();
  const s = useStyles();
  const banner = bannerFor(p.status, p.hasCaps, p.onLan);
  const note = banner?.text === DEGRADED_TEXT ? banner.text : null;
  const blocking = banner && !note ? banner : null;

  let body;
  if (blocking) {
    body = (
      <View style={s.center} accessibilityRole="alert">
        <MaterialCommunityIcons name={p.onLan ? 'lan-disconnect' : 'wifi-off'} size={40} color={c.warn} />
        <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={[s.title, { color: c.warn }]}>{blocking.text}</Text>
        {blocking.retry && <Pill label="Retry" variant="primary" onPress={p.onRetry} />}
      </View>
    );
  } else if (p.np) {
    const playing = p.playState === 'play';
    body = (
      <View style={s.stream}>
        {p.np.artUrl ? (
          <Image source={{ uri: p.np.artUrl }} style={s.art} resizeMode="cover" />
        ) : (
          <View style={[s.art, s.noArt]}>
            <ZMark size={44} color={c.accent} />
          </View>
        )}
        <View style={s.row}>
          <View style={s.meta}>
            <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={s.title}>{p.np.title}</Text>
            <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={s.sub}>
              {[p.np.artist, p.np.sourceName].filter(Boolean).join(' · ')}
            </Text>
            {p.onOpenApp && (
              <Pressable onPress={p.onOpenApp} accessibilityRole="link" hitSlop={8}>
                <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} style={s.link}>Open {p.np.sourceName}</Text>
              </Pressable>
            )}
          </View>
          <IconBtn icon="skip-previous" label="Previous" onPress={p.onPrevious} disabled={p.disabled} />
          <IconBtn icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} onPress={p.onPlayPause} disabled={p.disabled} primary />
          <IconBtn icon="skip-next" label="Next" onPress={p.onNext} disabled={p.disabled} />
        </View>
      </View>
    );
  } else if (p.input) {
    const sub = [p.input.name, p.soundMode ? modeLabel(p.soundMode) : null].filter(Boolean).join(' · ');
    body = (
      <Pressable style={s.center} onLongPress={p.onEditInput} accessibilityLabel={`Now on ${p.input.label}`} accessibilityHint="Long-press to edit this input">
        <View style={s.disc}>
          <MaterialCommunityIcons name={ICONS[p.input.icon]} size={52} color={c.accent} />
        </View>
        <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={s.title}>{p.input.label}</Text>
        <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={s.sub}>{sub}</Text>
      </Pressable>
    );
  } else {
    body = (
      <View style={s.center}>
        <ZMark size={44} color={c.accent} />
        <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} style={s.sub}>Pick an input below</Text>
      </View>
    );
  }

  return (
    <View testID="top-card" style={s.card}>
      {body}
      {note && (
        <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={s.note}>{note}</Text>
      )}
    </View>
  );
}

function IconBtn({ icon, label, onPress, disabled, primary }: { icon: 'skip-previous' | 'skip-next' | 'play' | 'pause'; label: string; onPress(): void; disabled: boolean; primary?: boolean }) {
  const { c } = useTheme();
  const s = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} hitSlop={4} style={[s.btn, primary && s.btnPrimary, disabled && s.disabled]}>
      <MaterialCommunityIcons name={icon} size={primary ? 26 : 28} color={primary ? c.onAccent : c.text} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ c }) => ({
  card: { height: TOP_CARD_HEIGHT, backgroundColor: c.surface, borderRadius: radii.card, padding: space(3), overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(2) },
  stream: { flex: 1, gap: space(2) },
  art: { width: '100%', height: 96, borderRadius: radii.tile },
  noArt: { backgroundColor: c.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  meta: { flex: 1, minWidth: 0 },
  title: { ...textStyle.cardTitle, color: c.text },
  sub: { ...textStyle.secondary, color: c.muted },
  link: { ...textStyle.secondary, color: c.text, textDecorationLine: 'underline' },
  disc: { width: 84, height: 84, borderRadius: 42, backgroundColor: c.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  btn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: c.accent },
  disabled: { opacity: 0.4 },
  note: { ...textStyle.secondary, color: c.warn, position: 'absolute', left: space(4), right: space(4), bottom: space(2), textAlign: 'center' },
}));
```

In `apps/remote/src/ui/RemoteView.tsx`:
- Remove the `ConnectionBanner` and `NowPlayingStrip` imports and their JSX.
- Insert the card where the banner was:

```tsx
import { TopCard } from './TopCard';
// …inside RemoteView, before return:
const all = [...inputs.visible, ...inputs.hidden];
const activeInput = all.find((i) => i.mid === settings.activeInput) ?? null;
const portName = caps?.inputs.find((i) => i.mid === settings.activeInput)?.name ?? '';
// …in the JSX, replacing <ConnectionBanner …/> and the {np && <NowPlayingStrip …/>} block:
<TopCard
  status={status}
  hasCaps={caps !== null}
  onLan={onLan}
  np={np}
  playState={settings.playState}
  input={activeInput ? { label: activeInput.label, icon: activeInput.icon, name: portName } : null}
  soundMode={settings.soundMode}
  disabled={!cli}
  onPlayPause={() => a.setPlayState(settings.playState === 'play' ? 'pause' : 'play')}
  onNext={a.next}
  onPrevious={a.previous}
  onOpenApp={np?.sourceId === SPOTIFY_SID ? () => a.openApp(np) : undefined}
  onRetry={a.reconnect}
  onEditInput={activeInput ? () => a.editInput(activeInput.mid) : undefined}
/>
```
`RemoteView`'s `inputs` prop type becomes `{ visible: ArrangedInput[]; hidden: ArrangedInput[] }`, which it already is.

Then delete the two old files:
```bash
git rm -q apps/remote/src/ui/NowPlayingStrip.tsx apps/remote/src/ui/ConnectionBanner.tsx
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS, including every test in `remote.test.tsx`. The "Golden", "Open Spotify" and "Retry" queries are now answered by `TopCard`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(remote): fixed-height top card for streaming, the active input and offline

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 6: Restyle the remote's building blocks

**Files:**
- Modify: `apps/remote/src/ui/InputGrid.tsx`, `VolumeBar.tsx`, `SoundRow.tsx`, `QuickSelects.tsx`, `Toast.tsx`
- Modify: `apps/remote/__tests__/blocks.test.tsx` (the Night assertion and two new tests)

**Interfaces:**
- Consumes: `Pill`, `PillSlider` (Task 4); theme (Task 1).
- Produces: the same component names and props as Plan 2. Only the visuals change, and the Night `Switch` becomes a `Pill` toggle.

- [ ] **Step 1: Change and add the tests**

In `apps/remote/__tests__/blocks.test.tsx`:

1. In `describe('SoundRow')` → "labels modes and drives every control", replace:
```tsx
    await fireEvent(screen.getByLabelText('Night mode'), 'valueChange', true);
```
with:
```tsx
    await fireEvent.press(screen.getByLabelText('Night mode'));
```
The Night switch became a pill toggle (spec §3.5). The assertion `expect(p.onNight).toHaveBeenCalledWith(1)` stays.

2. Append inside `describe('SoundRow', …)`:
```tsx
  it('night pill reflects the state and turns night mode off again', async () => {
    const p = h();
    await render(<SoundRow caps={CAPS} settings={deviceState({}, { nightLevel: 1 }).settings} disabled={false} {...p} />);
    expect(screen.getByLabelText('Night mode').props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByLabelText('Night mode'));
    expect(p.onNight).toHaveBeenCalledWith(0);
  });
```

3. Append inside `describe('InputGrid', …)`:
```tsx
  it('tile labels cap font scaling', async () => {
    await render(<InputGrid {...props()} />);
    expect(screen.getByText('PS5').props.maxFontSizeMultiplier).toBeGreaterThan(1);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test blocks`
Expected: FAIL. "Night mode" is still a `Switch`, so a press does nothing and `checked` is undefined, and tile labels have no `maxFontSizeMultiplier`.

- [ ] **Step 3: Implement**

`apps/remote/src/ui/InputGrid.tsx`: keep the props and the JSX structure, and replace the styling as below.
- The icon colour becomes `on ? c.onAccent : c.text` (from `useTheme()`).
- `const s = useStyles();` replaces the static `s`.
- The tile label gets `maxFontSizeMultiplier={FIXED_TEXT_SCALE}`.

```tsx
const useStyles = makeStyles(({ c }) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  tile: { width: '31.5%', minHeight: 76, borderRadius: radii.tile, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', gap: space(1), paddingHorizontal: space(2) },
  active: { backgroundColor: c.accent },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  label: { ...textStyle.tile, color: c.text, maxWidth: '100%' },
  activeLabel: { color: c.onAccent },
  more: { width: '31.5%', minHeight: 76, borderRadius: radii.tile, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  moreText: { ...textStyle.secondary, color: c.muted },
}));
```

`apps/remote/src/ui/VolumeBar.tsx`: keep the drag logic exactly (`drag` state, `shown`, the three handlers), and swap the native `Slider` for `PillSlider`:
```tsx
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FIXED_TEXT_SCALE, makeStyles, space, textStyle, useTheme } from '../theme';
import { PillSlider } from './PillSlider';

interface Props {
  volume: number;
  mute: boolean;
  disabled: boolean;
  onVolume(v: number): void;
  onMute(on: boolean): void;
}

export function VolumeBar({ volume, mute, disabled, onVolume, onMute }: Props) {
  const { c } = useTheme();
  const s = useStyles();
  // While a finger is on the slider it owns the value; reports from the bar would fight the thumb.
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? volume;
  return (
    <View style={[s.row, disabled && s.disabled]}>
      <Pressable accessibilityRole="button" accessibilityLabel={mute ? 'Unmute' : 'Mute'} disabled={disabled} onPress={() => onMute(!mute)} style={s.mute} hitSlop={8}>
        <MaterialCommunityIcons name={mute ? 'volume-off' : 'volume-high'} size={26} color={mute ? c.warn : c.text} />
      </Pressable>
      <View style={s.slider}>
        <PillSlider
          testID="volume"
          accessibilityLabel="Volume"
          min={0}
          max={100}
          value={shown}
          disabled={disabled}
          onSlidingStart={(v) => setDrag(v)}
          onValueChange={(v) => {
            if (drag !== null) setDrag(v);
            onVolume(v);
          }}
          onSlidingComplete={(v) => {
            onVolume(v);
            setDrag(null);
          }}
        />
      </View>
      <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} style={s.value}>{shown}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ c }) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  mute: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  slider: { flex: 1 },
  value: { ...textStyle.cardTitle, color: c.text, fontVariant: ['tabular-nums'], width: 40, textAlign: 'right' },
  disabled: { opacity: 0.4 },
}));
```

`apps/remote/src/ui/SoundRow.tsx`: keep `modeLabel`, `DIALOGUE_LABELS` and `Props`, and replace the `Chip`, `Switch` and EQ button with `Pill`:
```tsx
import type { Capabilities, DeviceSettings } from '@zapbar/heos-core';
import { Text, View } from 'react-native';
import { makeStyles, space, textStyle } from '../theme';
import { Pill } from './Pill';

// modeLabel, DIALOGUE_LABELS and Props stay exactly as in Plan 2.

export function SoundRow({ caps, settings, disabled, onSoundMode, onDialogue, onNight, onOpenEq }: Props) {
  const s = useStyles();
  const dialogueLevels = caps.dialogue ? Array.from({ length: caps.dialogue.max - caps.dialogue.min + 1 }, (_, i) => caps.dialogue!.min + i) : [];
  const nightOn = (settings.nightLevel ?? 0) > 0;
  return (
    <View style={[s.wrap, disabled && s.disabled]}>
      {caps.soundModes.length > 0 && (
        <View style={s.row}>
          {caps.soundModes.map((m) => (
            <Pill key={m} label={modeLabel(m)} selected={settings.soundMode === m} onPress={() => onSoundMode(m)} disabled={disabled} />
          ))}
        </View>
      )}
      {caps.dialogue && (
        <View style={s.row}>
          <Text style={s.label}>Dialogue</Text>
          {dialogueLevels.map((lv) => (
            <Pill key={lv} label={DIALOGUE_LABELS[lv] ?? String(lv)} selected={settings.dialogueLevel === lv} onPress={() => onDialogue(lv)} disabled={disabled} />
          ))}
        </View>
      )}
      <View style={s.row}>
        {caps.night && (
          <Pill
            label="Night"
            icon="weather-night"
            toggle
            accessibilityLabel="Night mode"
            selected={nightOn}
            disabled={disabled}
            onPress={() => onNight(nightOn ? caps.night!.min : caps.night!.max)}
          />
        )}
        <View style={s.spacer} />
        {caps.tone && <Pill label="EQ" icon="tune-vertical" variant="outline" onPress={onOpenEq} disabled={disabled} />}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ c }) => ({
  wrap: { gap: space(3) },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space(2) },
  label: { ...textStyle.secondary, color: c.muted, marginRight: space(1) },
  spacer: { flex: 1 },
  disabled: { opacity: 0.4 },
}));
```

`apps/remote/src/ui/QuickSelects.tsx`:
```tsx
import type { QuickSelect } from '@zapbar/heos-core';
import { View } from 'react-native';
import { makeStyles, space } from '../theme';
import { Pill } from './Pill';

export function QuickSelects({ items, disabled, onRecall }: { items: Array<QuickSelect & { used: boolean }>; disabled: boolean; onRecall(id: number): void }) {
  const s = useStyles();
  const used = items.filter((q) => q.used);
  if (used.length === 0) return null;
  return (
    <View style={s.row}>
      {used.map((q) => (
        <Pill key={q.id} label={q.name} variant="outline" icon="star-outline" onPress={() => onRecall(q.id)} disabled={disabled} />
      ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
}));
```

`apps/remote/src/ui/Toast.tsx`: keep the logic and swap the styles:
```tsx
const useStyles = makeStyles(({ c }) => ({
  toast: { position: 'absolute', left: space(4), right: space(4), bottom: space(6), backgroundColor: c.text, borderRadius: radii.card, padding: space(4) },
  text: { ...textStyle.body, color: c.bg },
}));
```
Inside `Toast`, add `const s = useStyles();` before the early return. Hooks must run on every render, so place it at the top with the other hooks. Change the import to `makeStyles, radii, space, textStyle` from `'../theme'`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS, including the VolumeBar drag tests ("holds the thumb under the finger…") and the owner-requirement tests in `remote.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(remote): brand styling for inputs, volume pill, sound pills, quick selects, toast

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 7: Remote screen and EQ sheet

**Files:**
- Modify: `apps/remote/src/ui/RemoteView.tsx`, `apps/remote/src/ui/EqSheet.tsx`, `apps/remote/app/remote.tsx`
- Test: `apps/remote/__tests__/remote.test.tsx` (append)

**Interfaces:**
- Consumes: `TopCard` (Task 5), `ZMark` (Task 2), `Pill` and `PillSlider` (Task 4), theme (Task 1).
- Produces: unchanged `RemoteView`, `RemoteActions` and `EqSheet` props.

- [ ] **Step 1: Write the failing tests**

Append to `apps/remote/__tests__/remote.test.tsx`:
```tsx
it('shows the active input in the top card when nothing streams', async () => {
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={actions()} />);
  expect(screen.getByLabelText('Now on PS5')).toBeTruthy();
  expect(screen.getByText('HDMI 1 · Movie')).toBeTruthy();
});

it('long-press on the top card opens the editor for the active input', async () => {
  const a = actions();
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={a} />);
  await fireEvent(screen.getByLabelText('Now on PS5'), 'longPress');
  expect(a.editInput).toHaveBeenCalledWith('inputs/hdmi_in_1');
});

it('shows the brand mark and the room name in the header', async () => {
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={actions()} />);
  expect(screen.getByLabelText('Zapbar')).toBeTruthy();
  expect(screen.getByText('Loving room')).toBeTruthy();
});

it('EQ sheet has a drag handle and pill sliders', async () => {
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={actions()} />);
  await fireEvent.press(screen.getByText('EQ'));
  expect(screen.getByTestId('eq-handle')).toBeTruthy();
  expect(screen.getByTestId('eq-bass-fill')).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test remote`
Expected: FAIL. There is no `Zapbar` label in the header yet, and no `eq-handle` or `eq-bass-fill`. The top-card tests may already pass after Task 5. If so, ledger that they pin Task 5's wiring, as planned.

- [ ] **Step 3: Implement**

`apps/remote/src/ui/RemoteView.tsx`: keep `RemoteActions`, `Props`, `SPOTIFY_SID`, the `cli`/`upnp` logic and the `TopCard` wiring from Task 5. Then:
- Build the header from `ZMark` plus the room name plus the settings cog.
- Style everything through `useStyles`.

```tsx
// header JSX:
<View style={s.header}>
  <ZMark size={26} color={c.accent} />
  <Text numberOfLines={1} style={s.name}>{state.name}</Text>
  <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={a.openSettings} style={s.icon} hitSlop={8}>
    <MaterialCommunityIcons name="cog-outline" size={24} color={c.muted} />
  </Pressable>
</View>
```
```tsx
const useStyles = makeStyles(({ c }) => ({
  root: { flex: 1, backgroundColor: c.bg },
  content: { padding: space(4), gap: space(4), paddingBottom: space(10) },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 48 },
  name: { ...textStyle.room, color: c.text, flex: 1 },
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
}));
```
The JSX order inside the `ScrollView`:
1. header;
2. `TopCard`;
3. `InputGrid`;
4. `VolumeBar`;
5. `SoundRow` (when `caps`);
6. `QuickSelects` (when `caps`).

Then the `EqSheet` and `Toast`, as before.

`apps/remote/src/ui/EqSheet.tsx`: keep `Props`, the safe-area padding and the `caps.tone` guard. Then:
- `Tone` uses `PillSlider`, keeping `testID={\`eq-${id}\`}`. The `-fill` view comes from `PillSlider`.
- Add a handle view `testID="eq-handle"`.
- Presets use `Pill` with `tone="surface"`.
- Reset becomes `<Pill label="Reset to neutral" variant="outline" block onPress={onReset} />`.

```tsx
const Tone = ({ id, label, range, value, onChange }: { id: string; label: string; range: Range; value: number | null; onChange(v: number): void }) => {
  const s = useStyles();
  return (
    <View style={s.tone}>
      <View style={s.toneHead}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.value}>{value ?? '–'}</Text>
      </View>
      <PillSlider testID={`eq-${id}`} accessibilityLabel={label} min={range.min} max={range.max} value={value} onValueChange={onChange} />
    </View>
  );
};
```
```tsx
const useStyles = makeStyles(({ c }) => ({
  scrim: { flex: 1, backgroundColor: c.scrim },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card, padding: space(5), gap: space(4) },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: space(1) },
  title: { ...textStyle.cardTitle, color: c.text },
  tone: { gap: space(2) },
  toneHead: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { ...textStyle.secondary, color: c.muted },
  value: { ...textStyle.body, color: c.text, fontVariant: ['tabular-nums'] },
  presets: { gap: space(2) },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
}));
```
In `EqSheet`, `useSafeAreaInsets()` and `useStyles()` are called before the `if (!caps.tone) return null;` guard. The sheet's `View` keeps `testID="eq-sheet"` and the style `[s.sheet, { paddingBottom: space(5) + insets.bottom }]`. Its first child is `<View testID="eq-handle" style={s.handle} />`.

`apps/remote/app/remote.tsx`: replace `colors.bg` with the theme. Add `const { c } = useTheme();` next to the other hooks, before the `Redirect` early return, and use `backgroundColor: c.bg`. Change the import to `useTheme` from `'../src/theme'`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS. That includes "keeps the EQ sheet buttons above the system navigation bar" and both owner-requirement tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(remote): branded remote screen header and EQ sheet

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 8: Setup screens

**Files:**
- Modify: `apps/remote/src/ui/SetupView.tsx`, `apps/remote/app/setup.tsx`
- Test: `apps/remote/__tests__/setup-view.test.tsx` (append)

**Interfaces:**
- Consumes: `ZMark`, `Pill`, theme.
- Produces: the same `SetupView` props.
- The welcome copy is folded into the scanning step (ruling: no new flow step, since the scan starts immediately).

- [ ] **Step 1: Write the failing tests**

Append to `apps/remote/__tests__/setup-view.test.tsx`:
```tsx
it('welcomes with the brand mark while scanning', async () => {
  const h = { onPick: jest.fn(), onManual: jest.fn(), onRescan: jest.fn(), onAnswer: jest.fn(), onFinish: jest.fn() };
  await render(<SetupView step={{ kind: 'scanning' }} {...h} />);
  expect(screen.getByLabelText('Zapbar')).toBeTruthy();
  expect(screen.getByText("Let's find your soundbar")).toBeTruthy();
  expect(screen.getByText('Looking on your Wi-Fi…')).toBeTruthy();
});

it('shows labelling progress as a progress bar', async () => {
  const h = { onPick: jest.fn(), onManual: jest.fn(), onRescan: jest.fn(), onAnswer: jest.fn(), onFinish: jest.fn() };
  await render(<SetupView step={{ kind: 'label', input: { mid: 'inputs/hdmi_in_1', name: 'HDMI 1' }, index: 1, total: 5 }} {...h} />);
  expect(screen.getByRole('progressbar').props.accessibilityValue).toMatchObject({ min: 0, max: 5, now: 2 });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test setup-view`
Expected: FAIL. The welcome text and the progressbar role are missing.

- [ ] **Step 3: Implement**

`apps/remote/src/ui/SetupView.tsx`: keep `Props`, the `ip`/`used` state and every step's behaviour and copy, except the scanning copy. Restyle as follows.

**Scanning and connecting:**
```tsx
case 'scanning':
case 'connecting':
  return (
    <View style={s.center}>
      <Pulse><ZMark size={96} color={c.accent} /></Pulse>
      <Text style={s.title}>{step.kind === 'scanning' ? "Let's find your soundbar" : `Connecting to ${step.name}…`}</Text>
      {step.kind === 'scanning' && <Text style={s.body}>Looking on your Wi-Fi…</Text>}
    </View>
  );
```
With `Pulse`, a gentle opacity loop:
```tsx
function Pulse({ children }: { children: ReactNode }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ opacity: v }}>{children}</Animated.View>;
}
```

**Label step:** a progress bar above the question.
```tsx
<View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: step.total, now: step.index + 1 }} style={s.progressTrack}>
  <View style={[s.progressFill, { width: `${((step.index + 1) / step.total) * 100}%` }]} />
</View>
<Text style={s.progress}>{step.index + 1} of {step.total}</Text>
```
Choices are tiles: icon in `c.text`, and "Not used" as an outlined tile (`c.id === 'unused'` gets `s.choiceOutline`).

**Manual step:**
- the pill `TextInput` (`s.input`, with `placeholderTextColor={c.muted}`);
- `<Pill label="Connect" variant="primary" block onPress={() => onManual(ip)} />`;
- `<Pill label="Search again" variant="outline" block onPress={onRescan} />`.

**Extras:**
- keep the `Switch`es, with `trackColor={{ true: c.accent, false: c.border }}` and `thumbColor={c.surface}`;
- `<Pill label="Done" variant="primary" block onPress={() => onFinish(used)} />`.

**Pick:** cards in `c.surface`.

Remove the local `Button` component; `Pill` replaces it.
```tsx
const useStyles = makeStyles(({ c }) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(4), padding: space(6) },
  page: { flex: 1, padding: space(6), gap: space(4) },
  title: { ...textStyle.display, color: c.text, textAlign: 'left' },
  body: { ...textStyle.body, color: c.muted },
  error: { ...textStyle.body, color: c.danger },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: c.surfaceHi, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: c.accent },
  progress: { ...textStyle.secondary, color: c.muted },
  card: { backgroundColor: c.surface, borderRadius: radii.card, padding: space(4), minHeight: 64 },
  cardTitle: { ...textStyle.cardTitle, color: c.text },
  cardSub: { ...textStyle.secondary, color: c.muted },
  input: { ...textStyle.body, fontSize: 17, backgroundColor: c.surface, color: c.text, borderRadius: radii.pill, paddingHorizontal: space(5), minHeight: 52 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  choice: { width: '47.5%', minHeight: 64, borderRadius: radii.tile, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4) },
  choiceOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border },
  choiceText: { ...textStyle.body, fontFamily: textStyle.chip.fontFamily, color: c.text },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
}));
```
`'transparent'` is a keyword, not a hex colour. The Task 10 scan allows it.

`apps/remote/app/setup.tsx`: replace `colors.bg` with `useTheme().c.bg`, the same way as in `app/remote.tsx`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS, including the existing setup-view tests ("2 of 5", "PS5", "Connect", "Search again", "Done", the extras `valueChange`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(remote): branded setup with welcome, progress bar and answer tiles

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 9: Settings and inline rename with explicit save

**Files:**
- Modify: `apps/remote/src/ui/SettingsView.tsx`, `apps/remote/src/ui/InputsEditor.tsx`, `apps/remote/app/settings/index.tsx`, `apps/remote/app/settings/inputs.tsx`
- Test: `apps/remote/__tests__/settings.test.tsx`
  - Change two InputsEditor tests: renaming is now explicit (spec §4).
  - Add new tests.

**Interfaces:**
- Consumes: `Pill`, theme, `ArrangedInput`.
- Produces:
  - `pendingRenames(drafts: Record<string, string>, inputs: ArrangedInput[]): Array<[string, string]>`
  - `InputsEditor` gains an `onDraftsChange?(pending: Array<[string, string]>): void` prop. `onRename` is now called only on ✓ or Done.

- [ ] **Step 1: Change and add the tests**

In `apps/remote/__tests__/settings.test.tsx`:

1. Change the import line to also import `pendingRenames`:
```tsx
import { InputsEditor, pendingRenames } from '../src/ui/InputsEditor';
```
Keep any other names already imported on that line.

2. In "renames, re-icons, hides and moves inputs", replace the `endEditing` line:
```tsx
    await fireEvent(screen.getByLabelText('Label for PS5'), 'endEditing', { nativeEvent: { text: 'PlayStation' } });
```
with:
```tsx
    await fireEvent.changeText(screen.getByLabelText('Label for PS5'), 'PlayStation');
    await fireEvent.press(screen.getByLabelText('Save name for PS5'));
```

3. Replace the whole "saves a rename while typing, so Back with the keyboard open keeps it" test with these:
```tsx
  it('typing alone does not save; the check button appears only after a change', async () => {
    const p = h();
    await render(<InputsEditor inputs={INPUTS} {...p} />);
    expect(screen.queryByLabelText('Save name for PS5')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Label for PS5'), 'PlayStation');
    expect(p.onRename).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Save name for PS5')).toBeTruthy();
  });

  it('the keyboard Done key saves the name', async () => {
    const p = h();
    await render(<InputsEditor inputs={INPUTS} {...p} />);
    await fireEvent.changeText(screen.getByLabelText('Label for PS5'), 'PlayStation');
    await fireEvent(screen.getByLabelText('Label for PS5'), 'submitEditing');
    expect(p.onRename).toHaveBeenCalledWith('inputs/hdmi_in_1', 'PlayStation');
  });

  it('the undo button restores the saved name without saving', async () => {
    const p = h();
    await render(<InputsEditor inputs={INPUTS} {...p} />);
    await fireEvent.changeText(screen.getByLabelText('Label for PS5'), 'PlayStation');
    await fireEvent.press(screen.getByLabelText('Undo name change for PS5'));
    expect(screen.getByLabelText('Label for PS5').props.value).toBe('PS5');
    expect(p.onRename).not.toHaveBeenCalled();
  });

  it('reports unsaved drafts to the screen', async () => {
    const onDraftsChange = jest.fn();
    await render(<InputsEditor inputs={INPUTS} {...h()} onDraftsChange={onDraftsChange} />);
    await fireEvent.changeText(screen.getByLabelText('Label for PS5'), 'PlayStation');
    expect(onDraftsChange).toHaveBeenLastCalledWith([['inputs/hdmi_in_1', 'PlayStation']]);
  });
```

4. Append outside the `describe`:
```tsx
it('pendingRenames lists only changed names', () => {
  const inputs = [
    { mid: 'a', label: 'PS5', icon: 'playstation' as const, hidden: false },
    { mid: 'b', label: 'TV', icon: 'tv' as const, hidden: false },
  ];
  expect(pendingRenames({ a: 'PS5 ', b: 'Telly' }, inputs)).toEqual([['b', 'Telly']]);
  expect(pendingRenames({}, inputs)).toEqual([]);
  expect(pendingRenames({ a: '' }, inputs)).toEqual([['a', '']]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test settings`
Expected: FAIL. `pendingRenames` is not exported, there is no "Save name for PS5" button, and typing calls `onRename`.

- [ ] **Step 3: Implement**

`apps/remote/src/ui/InputsEditor.tsx`:
```tsx
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { ICONS, type ArrangedInput, type IconId } from '../runtime/inputs';
import { makeStyles, radii, space, textStyle, useTheme } from '../theme';

interface Props {
  inputs: ArrangedInput[];
  focus?: string;
  onRename(mid: string, label: string): void;
  onIcon(mid: string, icon: IconId): void;
  onHidden(mid: string, hidden: boolean): void;
  onMove(mid: string, delta: -1 | 1): void;
  /** Unsaved names, so the screen can ask "Save changes?" before leaving. */
  onDraftsChange?(pending: Array<[string, string]>): void;
}

const ICON_IDS = Object.keys(ICONS) as IconId[];

/** Drafts that differ from the saved label (whitespace-insensitive). An emptied name is a change: it resets to the default. */
export function pendingRenames(drafts: Record<string, string>, inputs: ArrangedInput[]): Array<[string, string]> {
  return inputs.flatMap((i) => {
    const d = drafts[i.mid];
    return d !== undefined && d.trim() !== i.label ? [[i.mid, d] as [string, string]] : [];
  });
}

export function InputsEditor({ inputs, focus, onRename, onIcon, onHidden, onMove, onDraftsChange }: Props) {
  const { c } = useTheme();
  const s = useStyles();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    onDraftsChange?.(pendingRenames(drafts, inputs));
  }, [drafts, inputs]);
  const drop = (mid: string) => setDrafts(({ [mid]: _gone, ...rest }) => rest);
  const save = (mid: string) => {
    const text = drafts[mid];
    if (text === undefined) return;
    onRename(mid, text);
    drop(mid);
  };

  return (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {inputs.map((i, idx) => {
        const dirty = pendingRenames({ [i.mid]: drafts[i.mid] ?? i.label }, [i]).length > 0;
        return (
          <View key={i.mid} style={[s.card, i.mid === focus && s.focus]}>
            <View style={s.head}>
              <TextInput
                accessibilityLabel={`Label for ${i.label}`}
                value={drafts[i.mid] ?? i.label}
                onChangeText={(t) => setDrafts((d) => ({ ...d, [i.mid]: t }))}
                onSubmitEditing={() => save(i.mid)}
                returnKeyType="done"
                autoFocus={i.mid === focus}
                style={[s.input, dirty && s.inputDirty]}
              />
              {dirty && (
                <>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Undo name change for ${i.label}`} onPress={() => drop(i.mid)} style={s.iconBtn}>
                    <MaterialCommunityIcons name="close" size={22} color={c.text} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Save name for ${i.label}`} onPress={() => save(i.mid)} style={[s.iconBtn, s.iconOn]}>
                    <MaterialCommunityIcons name="check" size={22} color={c.onAccent} />
                  </Pressable>
                </>
              )}
              {!dirty && (
                <Switch
                  accessibilityLabel={`Show ${i.label}`}
                  value={!i.hidden}
                  onValueChange={(show) => onHidden(i.mid, !show)}
                  trackColor={{ true: c.accent, false: c.border }}
                  thumbColor={c.surface}
                />
              )}
            </View>
            <View style={s.icons}>
              {ICON_IDS.map((id) => (
                <Pressable key={id} accessibilityRole="button" accessibilityLabel={`Icon ${id}`} accessibilityState={{ selected: i.icon === id }} onPress={() => onIcon(i.mid, id)} style={[s.iconBtn, i.icon === id && s.iconOn]}>
                  <MaterialCommunityIcons name={ICONS[id]} size={22} color={i.icon === id ? c.onAccent : c.text} />
                </Pressable>
              ))}
            </View>
            <View style={s.move}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Move ${i.label} up`} disabled={idx === 0} onPress={() => onMove(i.mid, -1)} style={s.iconBtn}>
                <MaterialCommunityIcons name="chevron-up" size={22} color={idx === 0 ? c.border : c.text} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Move ${i.label} down`} disabled={idx === inputs.length - 1} onPress={() => onMove(i.mid, 1)} style={s.iconBtn}>
                <MaterialCommunityIcons name="chevron-down" size={22} color={idx === inputs.length - 1 ? c.border : c.text} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles(({ c }) => ({
  content: { padding: space(4), gap: space(3) },
  card: { backgroundColor: c.surface, borderRadius: radii.card, padding: space(4), gap: space(3) },
  focus: { borderWidth: 2, borderColor: c.accent },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  input: { ...textStyle.body, flex: 1, color: c.text, minHeight: 48, paddingHorizontal: space(4), borderRadius: radii.pill, backgroundColor: c.surfaceHi },
  inputDirty: { borderWidth: 1, borderColor: c.accent },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  iconBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceHi },
  iconOn: { backgroundColor: c.accent },
  move: { flexDirection: 'row', gap: space(2), justifyContent: 'flex-end' },
}));
```
The show/hide switch hides while a name is being edited, so the ✓ and × fit on the row. Visibility is a single tap and still applies immediately.

`apps/remote/app/settings/inputs.tsx`: add the leave prompt, and switch to the theme.
```tsx
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { arrangeInputs, moveInput } from '../../src/runtime/inputs';
import { useActiveDevice, useManager, useUi } from '../../src/runtime/RuntimeProvider';
import { useTheme } from '../../src/theme';
import { InputsEditor } from '../../src/ui/InputsEditor';

export default function InputsScreen() {
  const m = useManager();
  const { c } = useTheme();
  const state = useActiveDevice();
  const prefs = useUi((s) => (state ? s.prefs[state.key] : undefined));
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const navigation = useNavigation();
  const pending = useRef<Array<[string, string]>>([]);
  const { all } = arrangeInputs(state?.caps?.inputs ?? [], prefs ?? {});
  const rename = (mid: string, label: string) => m.setInputPref(mid, { label: label.trim() || undefined });

  // Back (gesture, button or hardware) with an unsaved name asks first: nothing is saved or lost silently.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (pending.current.length === 0) return;
        e.preventDefault();
        const leave = () => {
          pending.current = [];
          navigation.dispatch(e.data.action);
        };
        Alert.alert('Save changes?', 'An input name has not been saved.', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: leave },
          {
            text: 'Save',
            onPress: () => {
              pending.current.forEach(([mid, label]) => rename(mid, label));
              leave();
            },
          },
        ]);
      }),
    [navigation],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <InputsEditor
        inputs={all}
        focus={focus}
        onRename={rename}
        onIcon={(mid, icon) => m.setInputPref(mid, { icon })}
        onHidden={(mid, hidden) => m.setInputPref(mid, { hidden })}
        onMove={(mid, delta) => m.setInputOrder(moveInput(all.map((i) => i.mid), mid, delta))}
        onDraftsChange={(p) => {
          pending.current = p;
        }}
      />
    </SafeAreaView>
  );
}
```
If the `beforeRemove` event type is not inferred from expo-router's `useNavigation()`, type the listener argument explicitly. Use `EventArg<'beforeRemove', true, { action: NavigationAction }>` from `@react-navigation/native`, and ledger the ruling.

`apps/remote/src/ui/SettingsView.tsx`: keep `Props`, every label and the accessibility labels. Restyle as grouped cards:
- **Section titles** in `textStyle.secondary` / `c.muted`, uppercase.
- **Device rows** inside one `c.surface` card with `radii.card`. The active device gets a lime dot: a 10 × 10 `c.accent` circle before the name.
- **"Add a soundbar"** and **"Inputs"** become rows with a chevron (`chevron-right`).
- **The About card** holds the version, the disclaimer and the privacy line.
- All styles go through `makeStyles`.

`apps/remote/app/settings/index.tsx`: replace `colors.bg` with `useTheme().c.bg`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(remote): inline rename with explicit save and a leave prompt; branded settings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 10: Remove legacy tokens and forbid hard-coded colours

**Files:**
- Modify: `apps/remote/src/theme.ts` (delete `colors` and `radius`)
- Modify: any file the typecheck then flags
- Test: `apps/remote/__tests__/no-hardcoded-colors.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `theme.ts` without the legacy exports.

- [ ] **Step 1: Write the failing test**

`apps/remote/__tests__/no-hardcoded-colors.test.ts`:
```ts
/** @jest-environment node */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

it('keeps every colour in src/theme.ts', () => {
  const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))].filter((f) => !f.endsWith(join('src', 'theme.ts')));
  const offenders = files.flatMap((f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .map((line, n) => ({ f, n: n + 1, line }))
      .filter(({ line }) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(line)),
  );
  expect(offenders.map(({ f, n, line }) => `${f.replace(ROOT, '')}:${n}: ${line.trim()}`)).toEqual([]);
});

it('has no legacy colour tokens left', () => {
  const theme = readFileSync(join(ROOT, 'src', 'theme.ts'), 'utf8');
  expect(theme).not.toMatch(/export const colors\b/);
  expect(theme).not.toMatch(/export const radius\b/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test no-hardcoded`
Expected: FAIL on "has no legacy colour tokens left". The first test lists any remaining hex or rgba in `src/` and `app/`. It should already be empty after Tasks 3–9; if not, the list names each line.

- [ ] **Step 3: Implement**

Delete the `// Legacy tokens…` block from `apps/remote/src/theme.ts`: both the `colors` and the `radius` exports.

Run: `pnpm typecheck`
Every error is a leftover import of `colors` or `radius`. Move each one to `useTheme()` / `makeStyles` / `radii`, the same way the earlier tasks did, and repeat until the typecheck is clean.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck && cd ../.. && pnpm test`
Expected: everything PASSES: app suite, heos-core suite and both typechecks.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(remote): drop legacy colour tokens; test forbids colours outside theme.ts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 11: On-device design check (emulator and owner)

**Files:**
- Create: `docs/design-check/` (screenshots), `docs/design-check.md`

**Interfaces:**
- Consumes: the whole app.
- Produces: emulator screenshots in both schemes, an arm64 APK at `E:\projects\zapbar\APK\`, and the owner's verdict.

- [ ] **Step 1: Build the x86_64 APK and install it on the emulator**

```bash
export JAVA_HOME=~/tools/jdk-17.0.13+11 ANDROID_HOME=~/android-sdk PATH=~/tools/jdk-17.0.13+11/bin:$PATH
cd ~/projects/zapbar/apps/remote && npx expo prebuild --platform android --clean > ~/projects/zapbar/.superpowers/prebuild.log 2>&1
cd android && for i in 1 2 3; do ./gradlew assembleRelease --no-parallel -PreactNativeArchitectures=x86_64 -Pexpo.useLegacyPackaging=true > ~/projects/zapbar/.superpowers/apk-x86.log 2>&1 && break; ~/projects/zapbar/.superpowers/bin/fix-gradle-cache; ./gradlew --stop >/dev/null 2>&1; done; tail -1 ~/projects/zapbar/.superpowers/apk-x86.log
cp app/build/outputs/apk/release/app-release.apk /mnt/c/Users/<you>/zapbar-x86_64.apk
```
Start the emulator if it isn't running. Run the Windows `emulator.exe -avd Zapbar_Phone -no-snapshot -no-boot-anim` in the background and wait until `sys.boot_completed` is `1`. Then:
```bash
ADB=/mnt/c/Users/<you>/AppData/Local/Android/Sdk/platform-tools/adb.exe
$ADB install -r 'C:\Users\<you>\zapbar-x86_64.apk'
```
Expected:
- `BUILD SUCCESSFUL`, then `Success`.
- The emulator launcher shows the lime-Z-on-forest adaptive icon (screenshot the home screen).

- [ ] **Step 2: Screenshot every screen in dark and light**

For each `mode` in `yes` (dark) and `no` (light), run `$ADB shell cmd uimode night $mode`, relaunch the app, and capture with `$ADB exec-out screencap -p > docs/design-check/<screen>-<dark|light>.png`. Screens:
- `setup-scan`: after `pm clear app.zapbar.remote`. Enter `10.0.0.82` on the manual step; SSDP does not cross the emulator NAT.
- `setup-label`.
- `remote-input`.
- `eq`.
- `settings`.
- `inputs-edit`: type a new name so ✓ and × show.

Read each PNG with the Read tool and compare it against the mockups (`visual-direction-v3.html`, `idle-top.html`). Check:
- brand colours in both schemes;
- no lime text on light backgrounds;
- the top card at the same height across screens;
- nothing clipped by the status or navigation bars;
- the Plus Jakarta Sans font, not Roboto.

Every mismatch becomes a fix with a test where it is JavaScript, then a rebuild.

**Do not tap input tiles or change sound settings on the real soundbar from the emulator.** Only setup, EQ open/close and the settings screens are touched.

- [ ] **Step 3: Check the leave prompt**

On `inputs-edit`, with an unsaved name, press Back (`$ADB shell input keyevent 4`). Expected: the "Save changes?" dialog. Screenshot it as `inputs-leave-prompt-dark.png`. Choose "Keep editing", which must leave you on the screen. Then press Back again and choose "Discard": the name reverts.

- [ ] **Step 4: Build the phone APK and hand it to the owner**

```bash
cd ~/projects/zapbar/apps/remote/android && for i in 1 2 3; do ./gradlew assembleRelease --no-parallel -PreactNativeArchitectures=arm64-v8a -Pexpo.useLegacyPackaging=true > ~/projects/zapbar/.superpowers/apk-arm64.log 2>&1 && break; ~/projects/zapbar/.superpowers/bin/fix-gradle-cache; ./gradlew --stop >/dev/null 2>&1; done
~/android-sdk/build-tools/36.1.0/apksigner verify app/build/outputs/apk/release/app-release.apk && cp app/build/outputs/apk/release/app-release.apk /mnt/e/projects/zapbar/APK/zapbar-0.2.0-arm64.apk
```
Before building, bump `version` in `app.json` to `0.2.0`. Remove older APKs from `E:\projects\zapbar\APK\` with a plain `rm <file>` (no `-f`).

Ask the owner to install it and check:
1. the icon and splash;
2. dark and light, by flipping the phone's dark-mode setting;
3. the top card on Spotify and on PS5;
4. the volume pill drag;
5. a rename with ✓, and Back with an unsaved name.

- [ ] **Step 5: Record and commit**

Write `docs/design-check.md`: one line per screen and scheme (PASS/FAIL, what was seen) plus the owner's verdict.
```bash
git add docs/design-check.md docs/design-check/*.png apps/remote/app.json
git commit -m "docs: visual design check (emulator light/dark + owner)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
git push -u origin feat/design
```
