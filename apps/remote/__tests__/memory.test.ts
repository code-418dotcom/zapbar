import { DEFAULT_APPEARANCE } from '../src/theme';
import { DeviceMemory, memoryKv } from '../src/runtime/memory';

const BAR = { key: 'SERIAL1', name: 'Loving room', model: 'Denon DHT-S716H', lastIp: '10.0.0.82' };
const BAR2 = { key: 'SERIAL2', name: 'Bedroom', model: 'Denon Home 150', lastIp: '10.0.0.90' };

it('starts empty', () => {
  const m = new DeviceMemory(memoryKv());
  expect(m.devices()).toEqual([]);
  expect(m.activeKey()).toBeNull();
});

it('saves, updates and activates devices', () => {
  const m = new DeviceMemory(memoryKv());
  m.saveDevice(BAR);
  m.saveDevice({ ...BAR, lastIp: '10.0.0.83' });
  expect(m.devices()).toEqual([{ ...BAR, lastIp: '10.0.0.83' }]);
  expect(m.activeKey()).toBe('SERIAL1');
  m.saveDevice(BAR2);
  m.setActive('SERIAL2');
  expect(m.activeKey()).toBe('SERIAL2');
});

it('forgets a device with its prefs and falls back to another active device', () => {
  const m = new DeviceMemory(memoryKv());
  m.saveDevice(BAR);
  m.saveDevice(BAR2);
  m.setActive('SERIAL2');
  m.setInputPref('SERIAL2', 'inputs/hdmi_in_1', { label: 'PS5' });
  m.markSetupDone('SERIAL2');
  m.forgetDevice('SERIAL2');
  expect(m.devices()).toEqual([BAR]);
  expect(m.activeKey()).toBe('SERIAL1');
  expect(m.inputPrefs('SERIAL2')).toEqual({});
  expect(m.isSetupDone('SERIAL2')).toBe(false);
});

it('merges input prefs and stores order', () => {
  const m = new DeviceMemory(memoryKv());
  m.setInputPref('S', 'inputs/hdmi_in_1', { label: 'PS5', icon: 'playstation' });
  m.setInputPref('S', 'inputs/hdmi_in_1', { hidden: true });
  expect(m.inputPrefs('S')).toEqual({ 'inputs/hdmi_in_1': { label: 'PS5', icon: 'playstation', hidden: true } });
  m.setInputOrder('S', ['inputs/hdmi_in_2', 'inputs/hdmi_in_1']);
  expect(m.inputPrefs('S')['inputs/hdmi_in_2']).toEqual({ order: 0 });
  expect(m.inputPrefs('S')['inputs/hdmi_in_1']!.order).toBe(1);
});

it('survives corrupt stored JSON', () => {
  const kv = memoryKv();
  kv.setItemSync('devices', '{not json');
  expect(new DeviceMemory(kv).devices()).toEqual([]);
});

it('persists the supporter flag and appearance, with safe defaults', () => {
  const m = new DeviceMemory(memoryKv());
  expect(m.supporter()).toBe(false);
  expect(m.appearance()).toEqual(DEFAULT_APPEARANCE);
  m.setSupporter(true);
  m.setAppearance({ ...DEFAULT_APPEARANCE, accent: 'coral', font: 'comic' });
  expect(m.supporter()).toBe(true);
  expect(m.appearance()).toEqual({ ...DEFAULT_APPEARANCE, accent: 'coral', font: 'comic' });
});

it('ignores an unknown stored accent or font', () => {
  const kv = memoryKv();
  kv.setItemSync('appearance', JSON.stringify({ accent: 'hotpink', font: 'papyrus' }));
  expect(new DeviceMemory(kv).appearance()).toEqual(DEFAULT_APPEARANCE);
});

it('appearance() fills missing and invalid perk flags', () => {
  const m = new DeviceMemory(memoryKv());
  m.setAppearance({ accent: 'sky', font: 'comic' } as never);
  expect(m.appearance()).toEqual({ accent: 'sky', font: 'comic', eleven: false, pirate: false, confetti: false, dad: false });
  m.setAppearance({ ...DEFAULT_APPEARANCE, dad: 'yes', pirate: true } as never);
  expect(m.appearance()).toMatchObject({ dad: false, pirate: true });
});
