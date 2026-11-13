import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HeosDevice, type DeviceOptions } from '../src/device';
import { nodeHttp, nodeSocketFactory } from '../src/node';
import { createHeosStore, type HeosStore } from '../src/state/store';
import { FakeHeos } from './fake/fake-heos';
import { waitFor } from './helpers';

const KEY = 'TESTSERIAL0001';
let fake: FakeHeos;
let store: HeosStore;
let dev: HeosDevice | undefined;

const make = (over: Partial<DeviceOptions> = {}, ident = { key: KEY, ip: '127.0.0.1' }) =>
  new HeosDevice(
    { socketFactory: nodeSocketFactory, http: nodeHttp, store, cliPort: fake.cliPort, upnpPort: fake.httpPort, timeoutMs: 300, backoffMs: [20, 40], heartbeatMs: 10_000, upnpPollMs: 50, ...over },
    ident,
  );
const st = () => store.getState().devices[KEY]!;

beforeEach(async () => {
  fake = await FakeHeos.start();
  store = createHeosStore();
});
afterEach(async () => {
  dev?.stop();
  dev = undefined;
  await fake.stop();
});

it('connects, probes and reaches ready with state and a zone', async () => {
  dev = make();
  dev.start();
  await waitFor(() => st().status === 'ready');
  expect(st()).toMatchObject({ pid: 7331878, name: 'Loving room', model: 'Denon DHT-S716H', ip: '127.0.0.1' });
  expect(st().settings).toMatchObject({ volume: 49, mute: false, playState: 'play', activeInput: 'inputs/hdmi_in_1', nowPlaying: null, bass: 5, dialogueLevel: 2 });
  expect(st().caps?.inputs).toHaveLength(8);
  expect(store.getState().zones).toEqual([{ id: `zone:${KEY}`, name: 'Loving room', memberKeys: [KEY] }]);
  expect(fake.count('system/register_for_change_events')).toBe(1);
});

it('is degraded when UPnP is down but the CLI works', async () => {
  fake.upnpDown = true;
  dev = make();
  dev.start();
  await waitFor(() => st().status === 'degraded');
  expect(st().caps?.inputs).toHaveLength(8);
  expect(st().caps?.tone).toBeNull();
});

it('goes offline when the connection drops and reconnects', async () => {
  dev = make();
  dev.start();
  await waitFor(() => st().status === 'ready');
  fake.dropConnections();
  await waitFor(() => fake.connections === 2 && st().status === 'ready');
});

it('drops and recovers the connection when heartbeats stop answering', async () => {
  dev = make({ heartbeatMs: 50, timeoutMs: 100 });
  dev.start();
  await waitFor(() => st().status === 'ready');
  fake.silenced.add('system/heart_beat');
  // The offline window between drop and reconnect is ~20 ms; watch the reconnect instead.
  await waitFor(() => fake.connections >= 2);
  fake.silenced.delete('system/heart_beat');
  await waitFor(() => st().status === 'ready');
});

it('re-discovers a changed IP by key after repeated failures', async () => {
  const resolveIp = vi.fn(async () => '127.0.0.1');
  dev = make({ resolveIp }, { key: KEY, ip: '127.0.0.9' });
  dev.start();
  await waitFor(() => st().status === 'ready');
  expect(resolveIp).toHaveBeenCalledWith(KEY);
  expect(st().ip).toBe('127.0.0.1');
});

it('never reaches ready when the device at the IP has a different key', async () => {
  const resolveIp = vi.fn(async () => null);
  dev = new HeosDevice(
    { socketFactory: nodeSocketFactory, http: nodeHttp, store, cliPort: fake.cliPort, upnpPort: fake.httpPort, timeoutMs: 300, backoffMs: [20], resolveIp },
    { key: 'OTHERSERIAL', ip: '127.0.0.1' },
  );
  dev.start();
  await waitFor(() => resolveIp.mock.calls.length > 0);
  expect(store.getState().devices.OTHERSERIAL!.status).not.toBe('ready');
});

it('reconnectNow reconnects without waiting for backoff', async () => {
  dev = make({ backoffMs: [5000] });
  dev.start();
  await waitFor(() => st().status === 'ready');
  dev.reconnectNow();
  await waitFor(() => fake.connections === 2, 1000);
  await waitFor(() => st().status === 'ready', 1000);
});

it('stop() goes offline and stops reconnecting', async () => {
  dev = make();
  dev.start();
  await waitFor(() => st().status === 'ready');
  dev.stop();
  expect(st().status).toBe('offline');
  const n = fake.connections;
  await new Promise((r) => setTimeout(r, 150));
  expect(fake.connections).toBe(n);
});

it('start/stop/start leaves exactly one live connection and stops heartbeats after stop', async () => {
  dev = make({ heartbeatMs: 30 });
  dev.start();
  dev.stop();
  dev.start();
  await waitFor(() => st().status === 'ready');
  await new Promise((r) => setTimeout(r, 150));
  expect(fake.openConnections).toBe(1);
  expect(await dev.setVolume(20)).toBe(true);
  dev.stop();
  await new Promise((r) => setTimeout(r, 50));
  const beats = fake.count('system/heart_beat');
  await new Promise((r) => setTimeout(r, 150));
  expect(fake.count('system/heart_beat')).toBe(beats);
  expect(fake.openConnections).toBe(0);
});

it('a UPnP failure that outlives its connection does not mark the new session degraded', async () => {
  dev = make();
  dev.start();
  await waitFor(() => st().status === 'ready');
  fake.soapDelay.set('X_SetBass', 600);
  const p = dev.setBass(7);
  fake.dropConnections();
  expect(await p).toBe(false);
  await waitFor(() => st().status === 'ready');
  expect(st().status).toBe('ready');
});

it('reconnectNow during IP re-discovery reconnects without waiting for backoff', async () => {
  const resolveIp = vi.fn(async () => {
    dev!.reconnectNow();
    await new Promise((r) => setTimeout(r, 50));
    return '127.0.0.1';
  });
  dev = make({ resolveIp, backoffMs: [20, 5000] }, { key: KEY, ip: '127.0.0.9' });
  dev.start();
  await waitFor(() => st().status === 'ready', 1500);
});

it('still connects when a receiver refuses mute, play state and now playing', async () => {
  fake.failNext('player/get_mute', '9', 'System error');
  fake.failNext('player/get_play_state', '9', 'System error');
  fake.failNext('player/get_now_playing_media', '9', 'System error');
  dev = make();
  dev.start();
  await waitFor(() => st().status === 'ready');
  expect(st().settings).toMatchObject({ volume: 49, mute: false, playState: 'stop', nowPlaying: null });
  expect(fake.connections).toBe(1);
});
