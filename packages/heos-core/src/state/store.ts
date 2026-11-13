import { createStore } from 'zustand/vanilla';
import { EMPTY_SETTINGS, type DeviceSettings, type DeviceState, type Zone } from './types';

export interface HeosState {
  devices: Record<string, DeviceState>;
  zones: Zone[];
}

export const createHeosStore = () => createStore<HeosState>()(() => ({ devices: {}, zones: [] }));
export type HeosStore = ReturnType<typeof createHeosStore>;

export function upsertDevice(store: HeosStore, key: string, patch: Partial<Omit<DeviceState, 'key' | 'settings'>>): void {
  store.setState((s) => {
    const prev: DeviceState = s.devices[key] ?? {
      key, pid: null, name: '', model: '', ip: '', status: 'offline', caps: null, settings: { ...EMPTY_SETTINGS }, lastError: null, players: [], group: null,
    };
    const next: DeviceState = { ...prev, ...patch };
    const hasZone = s.zones.some((z) => z.memberKeys.includes(key));
    const zones = hasZone
      ? s.zones.map((z) => (z.memberKeys.length === 1 && z.memberKeys[0] === key && next.name ? { ...z, name: next.name } : z))
      : [...s.zones, { id: `zone:${key}`, name: next.name, memberKeys: [key] }];
    return { devices: { ...s.devices, [key]: next }, zones };
  });
}

export function patchSettings(store: HeosStore, key: string, patch: Partial<DeviceSettings>): void {
  store.setState((s) => {
    const d = s.devices[key];
    if (!d) return s;
    return { devices: { ...s.devices, [key]: { ...d, settings: { ...d.settings, ...patch } } } };
  });
}
