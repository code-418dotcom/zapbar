/** @jest-environment node */
import { request } from 'node:http';
import type { HttpFn } from '@zapbar/heos-core';
import { nodeSocketFactory } from '../../../packages/heos-core/src/node';
import { FakeHeos } from '../../../packages/heos-core/test/fake/fake-heos';
import { waitFor } from '../../../packages/heos-core/test/helpers';
import { DeviceManager } from '../src/runtime/manager';
import { DeviceMemory, memoryKv, type KeyValue } from '../src/runtime/memory';

// jest-expo stubs global fetch, so heos-core's fetch-based nodeHttp cannot reach FakeHeos here.
const nodeHttp: HttpFn = (url, req) =>
  new Promise((resolve, reject) => {
    const r = request(url, { method: req.method, headers: req.headers, timeout: req.timeoutMs }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
    });
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', reject);
    r.end(req.body);
  });

const KEY = 'TESTSERIAL0001';
let fake: FakeHeos;
let kv: KeyValue;
let managers: DeviceManager[];

const make = (discover = async () => ['127.0.0.1']) => {
  const m = new DeviceManager({
    socketFactory: nodeSocketFactory,
    http: nodeHttp,
    memory: new DeviceMemory(kv),
    discover,
    deviceOptions: { cliPort: fake.cliPort, upnpPort: fake.httpPort, timeoutMs: 300, backoffMs: [20, 40] },
  });
  managers.push(m);
  return m;
};
const status = (m: DeviceManager) => m.store.getState().devices[KEY]?.status;

beforeEach(async () => {
  fake = await FakeHeos.start();
  kv = memoryKv();
  managers = [];
});
afterEach(async () => {
  managers.forEach((m) => m.stopAll());
  await fake.stop();
});

it('scans, adopts and connects a device, and remembers it', async () => {
  const m = make();
  const players = await m.scan();
  expect(players.map((p) => p.key)).toEqual([KEY]);
  m.adopt(players[0]!);
  await waitFor(() => status(m) === 'ready');
  expect(m.ui.getState()).toMatchObject({ activeKey: KEY, devices: [{ key: KEY, name: 'Loving room', lastIp: '127.0.0.1' }] });
  expect(await m.waitForCaps(KEY, 1000)).toMatchObject({ inputs: expect.any(Array) });
});

it('reconnects to the remembered device after a restart', async () => {
  const first = make();
  first.adopt((await first.scan())[0]!);
  await waitFor(() => status(first) === 'ready');
  first.stopAll();
  const second = make();
  second.start();
  await waitFor(() => status(second) === 'ready');
});

it('a changed IP is rediscovered and saved', async () => {
  new DeviceMemory(kv).saveDevice({ key: KEY, name: 'Loving room', model: 'x', lastIp: '127.0.0.9' });
  const m = make();
  m.start();
  await waitFor(() => status(m) === 'ready', 3000);
  expect(new DeviceMemory(kv).devices()[0]!.lastIp).toBe('127.0.0.1');
});

it('stores input prefs and order for the active device', async () => {
  const m = make();
  m.adopt((await m.scan())[0]!);
  m.setInputPref('inputs/hdmi_in_1', { label: 'PS5' });
  m.setInputOrder(['inputs/hdmi_in_2', 'inputs/hdmi_in_1']);
  expect(m.ui.getState().prefs[KEY]).toEqual({ 'inputs/hdmi_in_1': { label: 'PS5', order: 1 }, 'inputs/hdmi_in_2': { order: 0 } });
  expect(new DeviceMemory(kv).inputPrefs(KEY)['inputs/hdmi_in_1']!.label).toBe('PS5');
});

it('forget stops the device and clears it', async () => {
  const m = make();
  m.adopt((await m.scan())[0]!);
  await waitFor(() => status(m) === 'ready');
  m.forget(KEY);
  expect(m.ui.getState()).toMatchObject({ activeKey: null, devices: [] });
  await waitFor(() => fake.openConnections === 0);
});

it('rapid foreground flapping keeps one connection', async () => {
  const m = make();
  m.adopt((await m.scan())[0]!);
  await waitFor(() => status(m) === 'ready');
  for (let i = 0; i < 6; i++) m.setForeground(i % 2 === 0);
  m.setForeground(true);
  await waitFor(() => status(m) === 'ready');
  await new Promise((r) => setTimeout(r, 150));
  expect(fake.openConnections).toBe(1);
});

it('leaving the LAN does not force a reconnect; returning does', async () => {
  const m = make();
  m.adopt((await m.scan())[0]!);
  await waitFor(() => status(m) === 'ready');
  const before = fake.connections;
  m.setNetwork(false);
  await new Promise((r) => setTimeout(r, 100));
  expect(fake.connections).toBe(before);
  expect(m.ui.getState().onLan).toBe(false);
  m.setNetwork(true);
  await waitFor(() => fake.connections === before + 1);
});

describe('review fixes', () => {
  it('manual adopt of a known device with a new IP connects and keeps the IP', async () => {
    new DeviceMemory(kv).saveDevice({ key: KEY, name: 'Loving room', model: 'x', lastIp: '127.0.0.9' });
    const m = make(async () => []); // SSDP blocked: only the typed IP can help
    m.start();
    await new Promise((r) => setTimeout(r, 100));
    const [p] = await m.probeIp('127.0.0.1');
    m.adopt(p!);
    await waitFor(() => status(m) === 'ready', 3000);
    await new Promise((r) => setTimeout(r, 100));
    expect(new DeviceMemory(kv).devices()[0]!.lastIp).toBe('127.0.0.1');
  });

  it('resuming while off the LAN does not connect, and leaving the LAN stops retries', async () => {
    const m = make();
    m.adopt((await m.scan())[0]!);
    await waitFor(() => status(m) === 'ready');
    m.setNetwork(false);
    await waitFor(() => fake.openConnections === 0);
    const before = fake.connections;
    m.setForeground(false);
    m.setForeground(true);
    await new Promise((r) => setTimeout(r, 200));
    expect(fake.connections).toBe(before);
    m.setNetwork(true);
    await waitFor(() => status(m) === 'ready');
  });

  it('a Wi-Fi network change while on the LAN forces a reconnect', async () => {
    const m = make();
    m.adopt((await m.scan())[0]!);
    await waitFor(() => status(m) === 'ready');
    m.setNetwork(true, '10.0.0.45');
    await new Promise((r) => setTimeout(r, 100));
    const before = fake.connections;
    m.setNetwork(true, '10.0.1.7');
    await waitFor(() => fake.connections === before + 1);
  });

  it('remembers the input list so a cold start without the soundbar still shows tiles', async () => {
    const first = make();
    first.adopt((await first.scan())[0]!);
    await waitFor(() => status(first) === 'ready');
    first.stopAll();
    const second = make(async () => []);
    expect(second.ui.getState().inputs[KEY]?.map((i) => i.mid)).toContain('inputs/hdmi_in_1');
  });
});
describe('rename', () => {
  it('renames the bar itself when it accepts', async () => {
    const m = make();
    m.adopt((await m.scan())[0]!);
    await waitFor(() => status(m) === 'ready');
    expect(await m.renameDevice(KEY, '  Living room ')).toBe('device');
    expect(fake.state.name).toBe('Living room');
    expect(m.ui.getState().devices[0]!.nickname).toBeUndefined();
  });

  it('falls back to a Zapbar nickname when the bar refuses', async () => {
    const m = make();
    m.adopt((await m.scan())[0]!);
    await waitFor(() => status(m) === 'ready');
    fake.faultActions.add('SetDeviceFriendlyName');
    expect(await m.renameDevice(KEY, 'Living room')).toBe('nickname');
    expect(new DeviceMemory(kv).devices()[0]!.nickname).toBe('Living room');
  });

  it('rejects an empty or over-long name', async () => {
    const m = make();
    m.adopt((await m.scan())[0]!);
    expect(await m.renameDevice(KEY, '   ')).toBe('invalid');
    expect(await m.renameDevice(KEY, 'x'.repeat(41))).toBe('invalid');
  });
});

describe('applying a rename', () => {
  it('marks the bar as applying after a rename, until it is ready again', async () => {
    const m = make();
    m.adopt((await m.scan())[0]!);
    await waitFor(() => status(m) === 'ready');
    expect(await m.renameDevice(KEY, 'Living room')).toBe('device');
    expect(m.ui.getState().applying).toBe(KEY);
    const dev = m.store.getState().devices[KEY]!;
    m.store.setState({ devices: { [KEY]: { ...dev, status: 'degraded' } } });
    expect(m.ui.getState().applying).toBe(KEY);
    m.store.setState({ devices: { [KEY]: { ...dev, status: 'ready' } } });
    expect(m.ui.getState().applying).toBeNull();
  });
});
