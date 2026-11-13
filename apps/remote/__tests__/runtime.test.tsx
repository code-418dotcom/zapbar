import { render, screen } from '@testing-library/react-native';
import { PermissionsAndroid, Text } from 'react-native';
import { DeviceManager } from '../src/runtime/manager';
import { Supporter } from '../src/runtime/supporter';
import { DEFAULT_APPEARANCE, useTheme } from '../src/theme';
import { FakeBilling } from './fakes/fake-billing';

jest.mock('@react-native-community/netinfo', () => ({ addEventListener: () => () => {}, configure: jest.fn() }));
import NetInfo from '@react-native-community/netinfo';
import { DeviceMemory, memoryKv } from '../src/runtime/memory';
import { RuntimeProvider, requestNotificationPermissionOnce } from '../src/runtime/RuntimeProvider';
import { isLan, otherSubnet } from '../src/runtime/RuntimeProvider';

it('disables NetInfo internet reachability so no request leaves the LAN', () => {
  expect((NetInfo.configure as jest.Mock)).toHaveBeenCalledTimes(1);
  const cfg = (NetInfo.configure as jest.Mock).mock.calls[0][0] as { reachabilityShouldRun: () => boolean };
  expect(cfg.reachabilityShouldRun()).toBe(false);
});

it('treats Wi-Fi and Ethernet as LAN, everything else as off-LAN', () => {
  expect(isLan({ type: 'wifi', isConnected: true })).toBe(true);
  expect(isLan({ type: 'ethernet', isConnected: true })).toBe(true);
  expect(isLan({ type: 'cellular', isConnected: true })).toBe(false);
  expect(isLan({ type: 'wifi', isConnected: false })).toBe(false);
});

it('flags Wi-Fi on a different subnet than the soundbar (guest Wi-Fi hint) without calling it off-LAN', () => {
  const wifi = (ipAddress: string) => ({ type: 'wifi', isConnected: true, details: { ipAddress, subnet: '255.255.255.0' } });
  expect(otherSubnet(wifi('192.168.50.4').details, '10.0.0.82')).toBe(true);
  expect(otherSubnet(wifi('10.0.0.45').details, '10.0.0.82')).toBe(false);
  expect(otherSubnet(wifi('192.168.50.4').details, undefined)).toBe(false);
  expect(otherSubnet(null, '10.0.0.82')).toBe(false);
  // A routed IoT VLAN must still be allowed to connect.
  expect(isLan(wifi('192.168.50.4'))).toBe(true);
});

it('shows the home Wi-Fi message on another subnet only while the soundbar is unreachable', () => {
  const { showOffLan } = require('../src/runtime/RuntimeProvider');
  expect(showOffLan(false, false, 'ready')).toBe(true);
  expect(showOffLan(true, true, 'offline')).toBe(true);
  expect(showOffLan(true, true, 'ready')).toBe(false);
  expect(showOffLan(true, false, 'offline')).toBe(false);
});

it('asks for the notification permission once, on Android 13+, only with the notification on', async () => {
  const req = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted');
  const mem = new DeviceMemory(memoryKv());
  await requestNotificationPermissionOnce(mem, { OS: 'android', Version: 34 });
  await requestNotificationPermissionOnce(mem, { OS: 'android', Version: 34 });
  expect(req).toHaveBeenCalledTimes(1);
  const mem2 = new DeviceMemory(memoryKv());
  mem2.setQuickSettings({ notification: false });
  await requestNotificationPermissionOnce(mem2, { OS: 'android', Version: 34 });
  await requestNotificationPermissionOnce(new DeviceMemory(memoryKv()), { OS: 'android', Version: 32 });
  expect(req).toHaveBeenCalledTimes(1);
  req.mockRestore();
});

describe('perk flags in the theme context', () => {

  const build = (supporter: boolean, stored: object) => {
    const memory = new DeviceMemory(memoryKv());
    memory.setSupporter(supporter);
    memory.setAppearance(stored as never);
    const m = new DeviceManager({ socketFactory: () => new Promise(() => {}), http: async () => ({ status: 500, text: '' }), memory, discover: async () => [] });
    const sup = new Supporter(new FakeBilling(), memory);
    jest.spyOn(sup, 'refresh').mockResolvedValue(undefined);
    return { m, sup };
  };
  const Probe = ({ k }: { k: 'pirate' | 'dad' }) => <Text>{`${k}:${String(useTheme().appearance[k])}`}</Text>;

  it('perk flags reach the theme context', async () => {
    const { m, sup } = build(true, { ...DEFAULT_APPEARANCE, pirate: true });
    await render(<RuntimeProvider manager={m} supporter={sup}><Probe k="pirate" /></RuntimeProvider>);
    expect(screen.getByText('pirate:true')).toBeTruthy();
  });

  it('non-supporters never get perk flags in the theme context', async () => {
    const { m, sup } = build(false, { ...DEFAULT_APPEARANCE, dad: true });
    await render(<RuntimeProvider manager={m} supporter={sup}><Probe k="dad" /></RuntimeProvider>);
    expect(screen.getByText('dad:false')).toBeTruthy();
  });
});
