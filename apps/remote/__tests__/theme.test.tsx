import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ACCENTS, AppearanceContext, DEFAULT_APPEARANCE, contrast, FONTS, LIME, makeStyles, palettes, PERK_IDS, themeFor, schemeFrom, ThemeOverride, useTheme } from '../src/theme';

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

it('every accent keeps AA contrast for its on-accent text in both schemes, and stands out on the dark background', () => {
  for (const [id, a] of Object.entries(ACCENTS)) {
    for (const scheme of ['dark', 'light'] as const) {
      expect([id, scheme, contrast(a[scheme].accent, a[scheme].onAccent) >= 4.5]).toEqual([id, scheme, true]);
    }
    expect([id, contrast(a.dark.accent, palettes.dark.bg) >= 3]).toEqual([id, true]);
  }
});

it('lime is exactly the Plan 3 palette', () => {
  expect(ACCENTS.lime.dark).toEqual({ accent: palettes.dark.accent, onAccent: palettes.dark.onAccent });
  expect(ACCENTS.lime.light).toEqual({ accent: palettes.light.accent, onAccent: palettes.light.onAccent });
});

const useAppearanceStyles = makeStyles(({ c, type }) => ({ t: { ...type.body, color: c.accent } }));
function AppearanceProbe() {
  const s = useAppearanceStyles();
  return <Text testID="probe" style={s.t}>z</Text>;
}

it('switching appearance re-renders with the new font and accent', async () => {
  const tree = (font: 'jakarta' | 'comic', accent: 'lime' | 'coral') => (
    <ThemeOverride.Provider value="dark">
      <AppearanceContext.Provider value={{ ...DEFAULT_APPEARANCE, font, accent }}>
        <AppearanceProbe />
      </AppearanceContext.Provider>
    </ThemeOverride.Provider>
  );
  const r = await render(tree('jakarta', 'lime'));
  expect(screen.getByTestId('probe')).toHaveStyle({ fontFamily: FONTS.jakarta.medium, color: ACCENTS.lime.dark.accent });
  await r.rerender(tree('comic', 'coral'));
  expect(screen.getByTestId('probe')).toHaveStyle({ fontFamily: FONTS.comic.medium, color: ACCENTS.coral.dark.accent });
});

it('themes differing only in one perk are distinct', () => {
  for (const id of PERK_IDS) {
    const a = themeFor('dark', DEFAULT_APPEARANCE);
    const b = themeFor('dark', { ...DEFAULT_APPEARANCE, [id]: true });
    expect(b.appearance).not.toBe(a.appearance);
    expect(b.appearance[id]).toBe(true);
  }
});
