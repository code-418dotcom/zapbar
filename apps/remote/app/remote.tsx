import { Redirect, router } from 'expo-router';
import { Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { arrangeInputs } from '../src/runtime/inputs';
import { displayName } from '../src/runtime/memory';
import { showOffLan, useActiveDevice, useManager, useSupporterState, useUi } from '../src/runtime/RuntimeProvider';
import { useTheme } from '../src/theme';
import { RemoteView, type RemoteActions } from '../src/ui/RemoteView';

export default function RemoteScreen() {
  const m = useManager();
  const { c, appearance } = useTheme();
  const state = useActiveDevice();
  const onLan = useUi((s) => s.onLan);
  const otherNet = useUi((s) => s.otherSubnet);
  const prefs = useUi((s) => (state ? s.prefs[state.key] : undefined));
  const cachedInputs = useUi((s) => (state ? s.inputs[state.key] : undefined));
  const known = useUi((s) => s.devices.find((d) => d.key === state?.key));
  const applying = useUi((s) => !!state && s.applying === state.key);
  const supporter = useSupporterState((s) => s.supporter);
  const canTip = useSupporterState((s) => s.available);
  const dev = state ? m.device(state.key) : undefined;
  if (!state || !dev) return <Redirect href="/setup" />;

  const actions: RemoteActions = {
    playInput: (mid) => void dev.playInput(mid),
    setVolume: (v) => void dev.setVolume(v),
    setMute: (on) => void dev.setMute(on),
    setPlayState: (s) => void dev.setPlayState(s),
    next: () => void dev.next(),
    previous: () => void dev.previous(),
    recallQuickSelect: (id) => void dev.recallQuickSelect(id),
    setSoundMode: (mode) => void dev.setSoundMode(mode),
    setDialogue: (lv) => void dev.setDialogue(lv),
    setNight: (lv) => void dev.setNight(lv),
    setBass: (v) => void dev.setBass(v),
    setTreble: (v) => void dev.setTreble(v),
    setSubwoofer: (v) => void dev.setSubwoofer(v),
    resetTone: () => void dev.resetTone(),
    selectEqPreset: (id) => void dev.selectEqPreset(id),
    reconnect: () => dev.reconnectNow(),
    openApp: () => void Linking.openURL('spotify:').catch(() => Linking.openURL('https://open.spotify.com')),
    openSettings: () => router.push('/settings'),
    openSupport: () => router.push({ pathname: '/settings', params: { focus: 'support' } }),
    editInput: (mid) => router.push({ pathname: '/settings/inputs', params: { focus: mid } }),
    showHidden: () => router.push('/settings/inputs'),
    setGroupMembers: (pids) => void dev.setGroupMembers(pids),
    setMemberVolume: (pid, v) => void dev.setMemberVolume(pid, v),
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <RemoteView supporter={supporter} canTip={canTip} state={state} inputs={arrangeInputs(state.caps?.inputs ?? cachedInputs ?? [], prefs ?? {}, { pirate: appearance.pirate })} onLan={!showOffLan(onLan, otherNet, state.status)} actions={actions} displayName={displayName(known, state)} applying={applying} />
    </SafeAreaView>
  );
}
