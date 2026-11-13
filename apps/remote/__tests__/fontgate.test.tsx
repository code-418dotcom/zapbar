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
