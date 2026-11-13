import { PlusJakartaSans_500Medium, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, useFonts } from '@expo-google-fonts/plus-jakarta-sans';
import { ComicNeue_400Regular, ComicNeue_700Bold } from '@expo-google-fonts/comic-neue';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';

void SplashScreen.preventAutoHideAsync().catch(() => {});

/** Holds the splash until the bundled fonts load. A load error falls back to the system font, never a stuck splash. */
export function FontGate({ children }: { children: ReactNode }) {
  const [loaded, error] = useFonts({ PlusJakartaSans_500Medium, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, ComicNeue_400Regular, ComicNeue_700Bold });
  const ready = loaded || !!error;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  return ready ? <>{children}</> : null;
}
