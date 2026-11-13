import type { StoreApi } from 'zustand/vanilla';
import type { DeviceState, HeosState } from '@zapbar/heos-core';
import type { QuickNative } from '../../modules/zapbar-quick';
import { arrangeInputs } from './inputs';
import type { DeviceManager, UiState } from './manager';
import { displayName } from './memory';
import { effectiveAppearance, type SupporterState } from './supporter';
import { capFor } from './volume';

export interface QuickConfigJs {
  key: string;
  serial: string;
  lastIp: string;
  name: string;
  inputs: Array<{ mid: string; label: string; icon: string; hidden: boolean }>;
  volumeKeys: boolean;
  notification: boolean;
  volumeCap: number;
}

/** What native quick access needs to know, without any live values (those come from the bar itself). */
export function buildQuickConfig(ui: UiState, devices: HeosState['devices'], cap = 100): QuickConfigJs | null {
  const known = ui.devices.find((d) => d.key === ui.activeKey);
  if (!known) return null;
  const state = devices[known.key];
  const inputs = state?.caps?.inputs ?? ui.inputs[known.key] ?? [];
  const arranged = arrangeInputs(inputs, ui.prefs[known.key] ?? {}).all;
  return {
    key: known.key,
    serial: known.key,
    // known.lastIp only changes once a connection there succeeded; the live store may hold an IP that never worked.
    lastIp: known.lastIp,
    name: displayName(known, state),
    inputs: arranged.map((i) => ({ mid: i.mid, label: i.label, icon: i.icon, hidden: i.hidden })),
    volumeKeys: ui.quick.volumeKeys,
    notification: ui.quick.notification,
    volumeCap: cap,
  };
}

export interface QuickStateJs {
  volume: number;
  mute: boolean;
  activeMid: string | null;
  playState: string;
}

/** The live values iOS widgets paint from (Android's native services read the bar themselves). Null until connected. */
export function buildQuickState(dev: DeviceState | undefined): QuickStateJs | null {
  if (!dev || dev.status !== 'ready') return null;
  const s = dev.settings;
  return { volume: s.volume, mute: s.mute, activeMid: s.activeInput, playState: s.playState };
}

/** Pushes the snapshot and the live state to native whenever either changes. Returns the unsubscribe function. */
export function startQuickSync(m: DeviceManager, native: QuickNative, supporter: StoreApi<SupporterState>): () => void {
  let last = '';
  let lastState = '';
  const push = () => {
    const c = buildQuickConfig(m.ui.getState(), m.store.getState().devices, capFor(effectiveAppearance(supporter.getState())));
    if (!c) return;
    const json = JSON.stringify(c);
    if (json !== last) {
      last = json;
      native.setConfig(json);
    }
    const st = buildQuickState(m.store.getState().devices[c.key]);
    const stJson = st && JSON.stringify(st);
    if (stJson && stJson !== lastState) {
      lastState = stJson;
      native.setState(stJson);
    }
  };
  push();
  const a = m.ui.subscribe(push);
  const b = m.store.subscribe(push);
  const c = supporter.subscribe(push);
  return () => {
    a();
    b();
    c();
  };
}
