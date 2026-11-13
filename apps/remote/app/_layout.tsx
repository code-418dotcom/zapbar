import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { RuntimeProvider } from '../src/runtime/RuntimeProvider';
import { useTheme } from '../src/theme';
import { FontGate } from '../src/ui/FontGate';

// iOS has no system back button: pushed screens get the native header with a back chevron
// (tester feedback, 1.3.0). Android keeps its system back and full-bleed screens.
const IOS = Platform.OS === 'ios';

export default function RootLayout() {
  const { scheme, c, type } = useTheme();
  const header = {
    headerShown: IOS,
    headerStyle: { backgroundColor: c.bg },
    headerTintColor: c.accent,
    headerTitleStyle: { color: c.text, fontFamily: type.chip.fontFamily },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
  };
  return (
    <FontGate>
      <RuntimeProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Screen name="settings/index" options={{ ...header, title: 'Settings' }} />
          <Stack.Screen name="settings/inputs" options={{ ...header, title: 'Inputs' }} />
          {/* First run has nothing to go back to; "Add a soundbar" from Settings does. */}
          <Stack.Screen name="setup" options={({ navigation }) => ({ ...header, headerShown: IOS && navigation.canGoBack(), title: 'Add a soundbar' })} />
        </Stack>
      </RuntimeProvider>
    </FontGate>
  );
}
