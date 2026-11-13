import { render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { processColor } from 'react-native';
import { join } from 'node:path';
import { FOREST, LIME } from '../src/theme';
import { Z_PATH, ZMark } from '../src/ui/ZMark';

it('draws the Z in the requested colour', async () => {
  await render(<ZMark size={32} color={LIME} />);
  expect(screen.getByLabelText('Zapbar')).toBeTruthy();
  // react-native-svg hands native props a packed ARGB colour: { type: 0, payload }.
  expect(screen.getByTestId('zmark-path').props.stroke.payload).toBe(processColor(LIME));
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

it('lists the splash plugin exactly once, so its config is not swallowed', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '../app.json'), 'utf8')).expo;
  const entries = app.plugins.filter((p: unknown) => p === 'expo-splash-screen' || (Array.isArray(p) && p[0] === 'expo-splash-screen'));
  expect(entries).toHaveLength(1);
});
