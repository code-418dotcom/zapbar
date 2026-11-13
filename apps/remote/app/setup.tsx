import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from 'zustand';
import { useManager } from '../src/runtime/RuntimeProvider';
import { SetupFlow } from '../src/setup/flow';
import { useTheme } from '../src/theme';
import { SetupView } from '../src/ui/SetupView';

export default function SetupScreen() {
  const m = useManager();
  const { c } = useTheme();
  const [flow] = useState(() => new SetupFlow(m));
  // The iOS header (see _layout) only shows when Setup was opened from Settings.
  const [header] = useState(() => Platform.OS === 'ios' && router.canGoBack());
  const step = useStore(flow.state, (s) => s.step);
  useEffect(() => {
    void flow.scan();
  }, [flow]);
  useEffect(() => {
    if (step.kind === 'done') router.replace('/remote');
  }, [step.kind]);
  return (
    <SafeAreaView edges={header ? ['bottom', 'left', 'right'] : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <SetupView
        step={step}
        onPick={(p) => void flow.choose(p)}
        onManual={(ip) => void flow.manual(ip)}
        onRescan={() => void flow.scan()}
        onAnswer={(id) => flow.answer(id)}
        onFinish={(used) => flow.finishExtras(used)}
        onOpenSettings={() => void Linking.openSettings()}
      />
    </SafeAreaView>
  );
}
