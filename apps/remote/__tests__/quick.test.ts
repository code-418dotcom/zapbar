import { arrangeInputs } from '../src/runtime/inputs';
import { DeviceManager } from '../src/runtime/manager';
import { DeviceMemory, memoryKv } from '../src/runtime/memory';
import { buildQuickConfig, buildQuickState, startQuickSync } from '../src/runtime/quick';
import { Supporter } from '../src/runtime/supporter';
import { CAPS, deviceState } from '../test-utils/fixtures';
import { FakeBilling } from './fakes/fake-billing';

const KEY = 'TESTSERIAL0001';
function manager() {
  const memory = new DeviceMemory(memoryKv());
  memory.saveDevice({ key: KEY, name: 'Loving room', model: 'm', lastIp: '10.0.0.82' });
  const m = new DeviceManager({ socketFactory: () => new Promise(() => {}), http: async () => ({ status: 500, text: '' }), memory, discover: async () => [] });
  m.store.setState({ devices: { [KEY]: deviceState() } });
  return m;
}
const sup = () => new Supporter(new FakeBilling(), new DeviceMemory(memoryKv()));
const native = () => ({ setConfig: jest.fn(), setState: jest.fn(), setLiveWanted: jest.fn(), refreshWidgets: jest.fn(), openBatterySettings: jest.fn(), tick: jest.fn(() => Promise.resolve()) });

it('builds a snapshot with display name, arranged inputs and flags', () => {
  const m = manager();
  m.setInputPref('inputs/hdmi_in_1', { label: 'PS5', icon: 'playstation' });
  const c = buildQuickConfig(m.ui.getState(), m.store.getState().devices)!;
  expect(c).toMatchObject({ key: KEY, serial: KEY, lastIp: '10.0.0.82', name: 'Loving room', volumeKeys: true, notification: true });
  expect(c.inputs.map((i) => i.mid)).toEqual(arrangeInputs(CAPS.inputs, m.ui.getState().prefs[KEY] ?? {}).all.map((i) => i.mid));
  expect(c.inputs.find((i) => i.mid === 'inputs/hdmi_in_1')).toMatchObject({ label: 'PS5', icon: 'playstation', hidden: false });
});

it('has no snapshot without an active device', () => {
  const m = new DeviceManager({ socketFactory: () => new Promise(() => {}), http: async () => ({ status: 500, text: '' }), memory: new DeviceMemory(memoryKv()), discover: async () => [] });
  expect(buildQuickConfig(m.ui.getState(), m.store.getState().devices)).toBeNull();
});

it('pushes the snapshot once, then only when it changes', () => {
  const m = manager();
  const n = native();
  const stop = startQuickSync(m, n, sup().store);
  expect(n.setConfig).toHaveBeenCalledTimes(1);
  m.store.setState({ devices: { [KEY]: deviceState({}, { volume: 50 }) } }); // volume is not in the snapshot
  expect(n.setConfig).toHaveBeenCalledTimes(1);
  m.setInputPref('inputs/hdmi_in_1', { label: 'PS5' });
  expect(n.setConfig).toHaveBeenCalledTimes(2);
  expect(JSON.parse(n.setConfig.mock.calls[1]![0]).inputs.find((i: { mid: string }) => i.mid === 'inputs/hdmi_in_1').label).toBe('PS5');
  m.setQuickSettings({ notification: false });
  expect(JSON.parse(n.setConfig.mock.calls[2]![0]).notification).toBe(false);
  stop();
});

it('remembers the quick settings', () => {
  const kv = memoryKv();
  const m1 = new DeviceMemory(kv);
  expect(m1.quickSettings()).toEqual({ volumeKeys: true, notification: true });
  m1.setQuickSettings({ volumeKeys: false });
  expect(new DeviceMemory(kv).quickSettings()).toEqual({ volumeKeys: false, notification: true });
});

it('pushes only an IP that has connected before, never a stale live one', () => {
  const m = manager();
  m.store.setState({ devices: { [KEY]: deviceState({ ip: '10.0.0.99', status: 'offline' }) } });
  expect(buildQuickConfig(m.ui.getState(), m.store.getState().devices)!.lastIp).toBe('10.0.0.82');
});

describe('volumeCap follows effective appearance', () => {
  const lastCap = (n: ReturnType<typeof native>) => JSON.parse(n.setConfig.mock.calls.at(-1)![0]).volumeCap;
  it('buildQuickConfig defaults to 100', () => {
    const m = manager();
    expect(buildQuickConfig(m.ui.getState(), m.store.getState().devices)!.volumeCap).toBe(100);
    expect(buildQuickConfig(m.ui.getState(), m.store.getState().devices, 30)!.volumeCap).toBe(30);
  });
  it('supporter with dad is capped at 30, a refund lifts it, a non-supporter is never capped', async () => {
    const m = manager();
    const billing = new FakeBilling();
    billing.purchases = [{ id: 'supporter_2', state: 'owned', token: 't', acknowledged: true }];
    const s = new Supporter(billing, new DeviceMemory(memoryKv()));
    const n = native();
    const stop = startQuickSync(m, n, s.store);
    expect(lastCap(n)).toBe(100);
    await s.refresh();
    s.setAppearance({ dad: true });
    expect(lastCap(n)).toBe(30);
    billing.purchases = [];
    await s.refresh();
    expect(lastCap(n)).toBe(100);
    stop();
    // stored dad:true without supporter status
    const s2 = sup();
    s2.store.setState({ supporter: false, appearance: { ...s2.store.getState().appearance, dad: true } });
    const n2 = native();
    const stop2 = startQuickSync(m, n2, s2.store);
    expect(lastCap(n2)).toBe(100);
    stop2();
  });
});

it('pushes live volume and mute to setState', () => {
  const m = manager();
  const n = native();
  const stop = startQuickSync(m, n, sup().store);
  expect(JSON.parse(n.setState.mock.calls[0]![0])).toEqual({ volume: 35, mute: false, activeMid: 'inputs/hdmi_in_1', playState: deviceState().settings.playState });
  m.store.setState({ devices: { [KEY]: deviceState({}, { volume: 50, mute: true }) } });
  expect(JSON.parse(n.setState.mock.calls[1]![0])).toMatchObject({ volume: 50, mute: true });
  stop();
});

it('does not push setState when nothing changed', () => {
  const m = manager();
  const n = native();
  const stop = startQuickSync(m, n, sup().store);
  m.setInputPref('inputs/hdmi_in_1', { label: 'PS5' }); // config changes, state does not
  expect(n.setState).toHaveBeenCalledTimes(1);
  stop();
});

it('no live state pushes no setState', () => {
  expect(buildQuickState(undefined)).toBeNull();
  expect(buildQuickState(deviceState({ status: 'connecting' }))).toBeNull();
  const m = manager();
  m.store.setState({ devices: { [KEY]: deviceState({ status: 'offline' }) } });
  const n = native();
  const stop = startQuickSync(m, n, sup().store);
  expect(n.setState).not.toHaveBeenCalled();
  expect(n.setConfig).toHaveBeenCalledTimes(1);
  stop();
});

it('setState and setConfig carry the arranged inputs', () => {
  const m = manager();
  m.setInputPref('inputs/hdmi_in_1', { hidden: true });
  m.setInputPref('inputs/hdmi_in_2', { label: 'PS5' });
  const n = native();
  const stop = startQuickSync(m, n, sup().store);
  const inputs: { mid: string; hidden: boolean }[] = JSON.parse(n.setConfig.mock.calls[0]![0]).inputs;
  expect(inputs.map((i) => i.mid)).toEqual(arrangeInputs(CAPS.inputs, m.ui.getState().prefs[KEY] ?? {}).all.map((i) => i.mid));
  expect(inputs.find((i) => i.mid === 'inputs/hdmi_in_1')!.hidden).toBe(true);
  expect(JSON.parse(n.setState.mock.calls[0]![0]).activeMid).toBe('inputs/hdmi_in_1');
  stop();
});
