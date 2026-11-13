/** @jest-environment node */
import { nodeHttp, nodeSocketFactory } from '../../../packages/heos-core/src/node';
import { FakeHeos } from '../../../packages/heos-core/test/fake/fake-heos';
import { waitFor } from '../../../packages/heos-core/test/helpers';
import { DeviceManager } from '../src/runtime/manager';
import { DeviceMemory, memoryKv } from '../src/runtime/memory';
import { LocalNetworkDenied } from '../src/runtime/discovery';
import { DENIED_TEXT, SetupFlow } from '../src/setup/flow';

const KEY = 'TESTSERIAL0001';
let fake: FakeHeos;
let m: DeviceManager;

const make = (ips: string[]) =>
  new DeviceManager({
    socketFactory: nodeSocketFactory,
    http: nodeHttp,
    memory: new DeviceMemory(memoryKv()),
    discover: async () => ips,
    deviceOptions: { cliPort: fake.cliPort, upnpPort: fake.httpPort, timeoutMs: 300, backoffMs: [20] },
  });
const step = (f: SetupFlow) => f.state.getState().step;

beforeEach(async () => {
  fake = await FakeHeos.start();
});
afterEach(async () => {
  m?.stopAll();
  await fake.stop();
});

it('auto-picks a single device and asks about each HDMI input, then the extras', async () => {
  m = make(['127.0.0.1']);
  const f = new SetupFlow(m);
  await f.scan();
  expect(step(f)).toMatchObject({ kind: 'label', index: 0, total: 5, input: { mid: 'inputs/hdmi_arc_1' } });
  f.answer('tv');
  expect(step(f)).toMatchObject({ kind: 'label', index: 1, input: { mid: 'inputs/hdmi_in_1' } });
  f.answer('playstation');
  f.answer('switch');
  f.answer('unused');
  f.answer('unused');
  expect(step(f)).toMatchObject({ kind: 'extras' });
  f.finishExtras(['inputs/optical_in_1']);
  expect(step(f)).toEqual({ kind: 'done' });
  const prefs = m.ui.getState().prefs[KEY]!;
  expect(prefs['inputs/hdmi_in_1']).toEqual({ label: 'PS5', icon: 'playstation', hidden: false });
  expect(prefs['inputs/hdmi_in_3']).toEqual({ hidden: true });
  expect(prefs['inputs/optical_in_1']).toEqual({ hidden: false });
  expect(prefs['inputs/aux_in_1']).toEqual({ hidden: true });
  expect(m.isSetupDone(KEY)).toBe(true);
});

it('no devices found → manual step', async () => {
  m = make([]);
  const f = new SetupFlow(m);
  await f.scan();
  expect(step(f)).toEqual({ kind: 'manual', error: null });
});

it('scan shows the denied message when discovery is denied', async () => {
  m = make([]);
  m.scan = () => Promise.reject(new LocalNetworkDenied());
  const f = new SetupFlow(m);
  await f.scan();
  expect(step(f)).toEqual({ kind: 'manual', error: DENIED_TEXT, denied: true });
});

it('scan recognises the denial by error name alone', async () => {
  m = make([]);
  m.scan = () => Promise.reject({ name: 'LocalNetworkDenied' });
  const f = new SetupFlow(m);
  await f.scan();
  expect(step(f)).toEqual({ kind: 'manual', error: DENIED_TEXT, denied: true });
});

it('scan treats other discovery errors as nothing found', async () => {
  m = make([]);
  m.scan = () => Promise.reject(new Error('x'));
  const f = new SetupFlow(m);
  await f.scan();
  expect(step(f)).toEqual({ kind: 'manual', error: null });
});

it('malformed IP', async () => {
  m = make([]);
  const f = new SetupFlow(m);
  await f.manual('10.0.0');
  expect(step(f)).toEqual({ kind: 'manual', error: 'Enter an IP address like 192.168.1.20' });
});

it('non-HEOS IP', async () => {
  m = make([]);
  const f = new SetupFlow(m);
  await f.manual('127.0.0.9');
  expect(step(f)).toEqual({ kind: 'manual', error: 'No soundbar answered at 127.0.0.9' });
});

it('manual IP that answers continues to labelling', async () => {
  m = make([]);
  const f = new SetupFlow(m);
  await f.manual(' 127.0.0.1 ');
  await waitFor(() => step(f).kind === 'label');
});

it('Add a soundbar skips a soundbar that is already set up', async () => {
  m = make(['127.0.0.1']);
  m.adopt((await m.scan())[0]!);
  m.markSetupDone(KEY);
  const f = new SetupFlow(m);
  await f.scan();
  expect(step(f)).toMatchObject({ kind: 'manual', error: expect.stringContaining('No new soundbar') });
});

it('typing the IP of a set-up soundbar reconnects it and keeps its labels', async () => {
  m = make([]);
  m.adopt((await m.probeIp('127.0.0.1'))[0]!);
  m.markSetupDone(KEY);
  m.setInputPref('inputs/hdmi_in_1', { label: 'PS5' });
  const f = new SetupFlow(m);
  await f.manual('127.0.0.1');
  expect(step(f)).toEqual({ kind: 'done' });
  expect(m.ui.getState().prefs[KEY]!['inputs/hdmi_in_1']!.label).toBe('PS5');
});
