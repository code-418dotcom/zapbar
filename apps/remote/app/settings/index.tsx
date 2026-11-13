import Constants from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from 'zustand';
import { useManager, useSupporter, useSupporterState, useUi } from '../../src/runtime/RuntimeProvider';
import { useTheme } from '../../src/theme';
import { SettingsView } from '../../src/ui/SettingsView';

export default function SettingsScreen() {
  const android = Platform.OS === 'android';
  const m = useManager();
  const { c } = useTheme();
  const devices = useUi((s) => s.devices);
  const activeKey = useUi((s) => s.activeKey);
  const quick = useUi((s) => s.quick);
  const statuses = useStore(m.store, (s) => s.devices);
  const sup = useSupporter();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const supState = useSupporterState((s) => s);
  // Opening Settings re-checks tip ownership (pending purchases, refunds).
  useEffect(() => {
    void sup.refresh();
  }, [sup]);
  return (
    <SafeAreaView edges={Platform.OS === 'ios' ? ['bottom', 'left', 'right'] : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <SettingsView
        devices={devices}
        activeKey={activeKey}
        statusOf={(key) => statuses[key]?.status}
        version={Constants.expoConfig?.version ?? '0.0.0'}
        onActivate={(key) => {
          m.activate(key);
          router.back();
        }}
        onForget={(key) => {
          const name = devices.find((d) => d.key === key)?.name ?? 'this soundbar';
          Alert.alert(`Forget ${name}?`, 'Its input labels are removed too.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Forget',
              style: 'destructive',
              onPress: () => {
                m.forget(key);
                if (!m.ui.getState().activeKey) router.replace('/setup');
              },
            },
          ]);
        }}
        onAddDevice={() => router.push('/setup')}
        quick={android ? quick : undefined}
        onQuick={android ? (p) => m.setQuickSettings(p) : undefined}
        onBattery={android ? () => require('../../modules/zapbar-quick').default.openBatterySettings() : undefined}
        onRename={async (key, name) => {
          const r = await m.renameDevice(key, name);
          return r === 'invalid' ? 'Use 1 to 40 characters' : r === 'failed' ? "Couldn't rename the soundbar" : null;
        }}
        onInputs={() => router.push('/settings/inputs')}
        focus={focus === 'support' ? 'support' : undefined}
        support={{ state: supState, onBuy: (id) => void sup.buy(id), onAppearance: (p) => sup.setAppearance(p), canRestore: Platform.OS === 'ios', onRestore: () => sup.restore() }}
      />
    </SafeAreaView>
  );
}
