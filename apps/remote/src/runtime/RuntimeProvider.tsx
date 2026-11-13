import NetInfo from '@react-native-community/netinfo';
import type { DeviceState } from '@zapbar/heos-core';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { useStore } from 'zustand';
import { nativeDiscover } from './discovery';
import { AppearanceContext, type Appearance } from '../theme';
import { storeBilling } from './billing';
import { DeviceManager, type UiState } from './manager';
import type { QuickNative } from '../../modules/zapbar-quick';
import { DeviceMemory, sqliteKv } from './memory';
import { startQuickSync } from './quick';
import { effectiveAppearance, Supporter, type SupporterState } from './supporter';
import { rnHttp, rnSocketFactory } from './transport';

// NetInfo's JS reachability check fetches clients3.google.com/generate_204; Zapbar must never leave the LAN, and never reads isInternetReachable.
NetInfo.configure({ reachabilityShouldRun: () => false });

const Ctx = createContext<DeviceManager | null>(null);
const SupCtx = createContext<Supporter | null>(null);

interface NetLike {
  type: string;
  isConnected: boolean | null;
  details?: { ipAddress?: string | null; subnet?: string | null } | null;
}

const ipToInt = (ip: string): number | null => {
  const p = ip.split('.').map(Number);
  return p.length === 4 && p.every((x) => Number.isInteger(x) && x >= 0 && x <= 255) ? ((p[0]! << 24) | (p[1]! << 16) | (p[2]! << 8) | p[3]!) >>> 0 : null;
};

export const isLan = (n: NetLike): boolean => !!n.isConnected && (n.type === 'wifi' || n.type === 'ethernet');

/**
 * The phone's subnet does not contain the soundbar's IP (guest Wi-Fi, or a routed IoT VLAN).
 * Only a hint: routed setups can still reach the bar, so connecting is never blocked on it.
 */
export function otherSubnet(details: NetLike['details'], deviceIp?: string): boolean {
  const me = details?.ipAddress ? ipToInt(details.ipAddress) : null;
  const mask = details?.subnet ? ipToInt(details.subnet) : null;
  const bar = deviceIp ? ipToInt(deviceIp) : null;
  if (me === null || mask === null || bar === null) return false;
  return ((me & mask) >>> 0) !== ((bar & mask) >>> 0);
}

/** Show "Connect to your home Wi-Fi" when off Wi-Fi, or on another subnet while the bar is unreachable. */
export const showOffLan = (onLan: boolean, otherNet: boolean, status: string): boolean =>
  !onLan || (otherNet && status !== 'ready' && status !== 'degraded');

function createDefaultManager(): DeviceManager {
  return new DeviceManager({
    socketFactory: rnSocketFactory,
    http: rnHttp,
    memory: new DeviceMemory(sqliteKv()),
    discover: nativeDiscover(),
  });
}

/** Android 13+ needs POST_NOTIFICATIONS for the live-controls notification; ask once, only if it is wanted. */
export async function requestNotificationPermissionOnce(memory: DeviceMemory, platform: { OS: string; Version: number | string }): Promise<void> {
  if (platform.OS !== 'android' || Number(platform.Version) < 33) return;
  if (!memory.quickSettings().notification || memory.flag('askedNotifications')) return;
  memory.setFlag('askedNotifications');
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
}

/** The native quick-access module, loaded lazily so tests and other platforms never touch it. */
function nativeQuick(): QuickNative {
  return require('../../modules/zapbar-quick').default as QuickNative;
}

export function RuntimeProvider({ manager, quick, supporter, children }: { manager?: DeviceManager; quick?: QuickNative; supporter?: Supporter; children: ReactNode }) {
  const [m] = useState(() => manager ?? createDefaultManager());
  const [q] = useState(() => quick ?? nativeQuick());
  const [sup] = useState(() => supporter ?? new Supporter(storeBilling(), m.memory));
  const isSupporter = useStore(sup.store, (s) => s.supporter);
  const accent = useStore(sup.store, (s) => s.appearance.accent);
  const font = useStore(sup.store, (s) => s.appearance.font);
  const eleven = useStore(sup.store, (s) => s.appearance.eleven);
  const pirate = useStore(sup.store, (s) => s.appearance.pirate);
  const confetti = useStore(sup.store, (s) => s.appearance.confetti);
  const dad = useStore(sup.store, (s) => s.appearance.dad);
  const appearance = useMemo<Appearance>(
    () => effectiveAppearance({ supporter: isSupporter, appearance: { accent, font, eleven, pirate, confetti, dad } }),
    [isSupporter, accent, font, eleven, pirate, confetti, dad],
  );
  useEffect(() => {
    void sup.refresh();
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') void sup.refresh();
    });
    return () => app.remove();
  }, [sup]);
  useEffect(() => {
    m.start();
    const stopSync = startQuickSync(m, q, sup.store);
    void requestNotificationPermissionOnce(m.memory, Platform);
    q.setLiveWanted(AppState.currentState === 'active');
    const app = AppState.addEventListener('change', (s) => {
      m.setForeground(s === 'active');
      q.setLiveWanted(s === 'active');
    });
    const unsubNet = NetInfo.addEventListener((n) => {
      const ui = m.ui.getState();
      const barIp = ui.devices.find((d) => d.key === ui.activeKey)?.lastIp;
      const details = n.details as NetLike['details'];
      m.ui.setState({ otherSubnet: otherSubnet(details, barIp) });
      m.setNetwork(isLan({ type: n.type, isConnected: n.isConnected }), details?.ipAddress ?? undefined);
    });
    return () => {
      stopSync();
      app.remove();
      unsubNet();
      m.stopAll();
    };
  }, [m, q, sup]);
  return (
    <Ctx.Provider value={m}>
      <SupCtx.Provider value={sup}>
        <AppearanceContext.Provider value={appearance}>{children}</AppearanceContext.Provider>
      </SupCtx.Provider>
    </Ctx.Provider>
  );
}

export function useSupporter(): Supporter {
  const s = useContext(SupCtx);
  if (!s) throw new Error('RuntimeProvider missing');
  return s;
}

export function useSupporterState<T>(selector: (s: SupporterState) => T): T {
  return useStore(useSupporter().store, selector);
}

export function useManager(): DeviceManager {
  const m = useContext(Ctx);
  if (!m) throw new Error('RuntimeProvider missing');
  return m;
}

export function useUi<T>(selector: (s: UiState) => T): T {
  return useStore(useManager().ui, selector);
}

export function useActiveDevice(): DeviceState | null {
  const m = useManager();
  const key = useUi((s) => s.activeKey);
  return useStore(m.store, (s) => (key ? s.devices[key] ?? null : null));
}
