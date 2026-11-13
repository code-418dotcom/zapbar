// Native modules have no JS implementation under Jest. Tests that exercise them mock them in the test file.
jest.mock('react-native-tcp-socket', () => ({ __esModule: true, default: { createConnection: jest.fn() } }));
// Icon fonts load through the asset registry, which Jest lacks. Icons render as an empty View tagged with the glyph name.
jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  const MaterialCommunityIcons = ({ name }: { name: string }) => createElement(View, { testID: `icon-${name}` });
  return { MaterialCommunityIcons };
});
// Fonts and splash are native; tests run with fonts "loaded" unless a test overrides the mock.
jest.mock('@expo-google-fonts/plus-jakarta-sans', () => ({
  useFonts: jest.fn(() => [true, null]),
  PlusJakartaSans_500Medium: 1,
  PlusJakartaSans_700Bold: 2,
  PlusJakartaSans_800ExtraBold: 3,
}));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(async () => true), hideAsync: jest.fn(async () => true) }));
jest.mock('./modules/zapbar-quick', () => ({ __esModule: true, default: { setConfig: jest.fn(), setState: jest.fn(), setLiveWanted: jest.fn(), refreshWidgets: jest.fn(), openBatterySettings: jest.fn(), tick: jest.fn(() => Promise.resolve()) } }));
