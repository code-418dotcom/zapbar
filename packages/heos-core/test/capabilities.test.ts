import { afterEach, beforeEach, expect, it } from 'vitest';
import { probeCapabilities } from '../src/capabilities';
import { HeosCliClient } from '../src/cli/client';
import { createCliCommands, type CliCommands, type PlayerInfo } from '../src/cli/commands';
import { nodeHttp, nodeSocketFactory } from '../src/node';
import type { UpnpEndpoint } from '../src/upnp/soap';
import { FakeHeos, type FakeState } from './fake/fake-heos';

let fake: FakeHeos;
let client: HeosCliClient;
let cmds: CliCommands;
let ep: UpnpEndpoint;
let player: PlayerInfo;

async function setup(over: Partial<FakeState> = {}) {
  fake = await FakeHeos.start(over);
  client = await HeosCliClient.connect(nodeSocketFactory, '127.0.0.1', { port: fake.cliPort });
  cmds = createCliCommands(client);
  ep = { http: nodeHttp, baseUrl: fake.baseUrl, timeoutMs: 500 };
  player = (await cmds.getPlayers())[0]!;
}
beforeEach(() => setup());
afterEach(async () => {
  client.close();
  await fake.stop();
});

it('detects every soundbar capability and snapshots the settings', async () => {
  const { caps, settings } = await probeCapabilities(cmds, ep, player);
  expect(caps.upnpReachable).toBe(true);
  expect(caps.inputs).toHaveLength(8);
  expect(caps.quickSelects.filter((q) => q.used).map((q) => q.name)).toEqual(['Watch TV']);
  expect(caps.tone).toEqual({ bass: { min: 0, max: 10, neutral: 5 }, treble: { min: 0, max: 10, neutral: 5 }, subwoofer: { min: 0, max: 30 } });
  expect(caps.soundModes).toEqual(['MUSIC_NORMAL', 'MOVIE_NORMAL']);
  expect(caps.dialogue).toEqual({ min: 0, max: 3 });
  expect(caps.night).toEqual({ min: 0, max: 1 });
  expect(settings).toMatchObject({ bass: 5, treble: 5, subwoofer: 15, eqPreset: null, soundMode: 'MOVIE_NORMAL', dialogueLevel: 2, nightLevel: 0 });
});

it('hides EQ presets when the device reports no current preset (DHT-S716H: presets have no effect)', async () => {
  const { caps } = await probeCapabilities(cmds, ep, player);
  expect(caps.eqPresets).toEqual([]);
});

it('exposes EQ presets when the device reports a current preset', async () => {
  client.close();
  await fake.stop();
  await setup({ preset: 'Jazz' });
  const { caps, settings } = await probeCapabilities(cmds, ep, player);
  expect(caps.eqPresets).toEqual(['Accoustic', 'Classical', 'Jazz', 'Pop', 'Rock']);
  expect(settings.eqPreset).toBe('Jazz');
});

it('keeps CLI capabilities and drops UPnP ones when UPnP is unreachable', async () => {
  fake.upnpDown = true;
  const { caps } = await probeCapabilities(cmds, ep, player);
  expect(caps.upnpReachable).toBe(false);
  expect(caps.inputs).toHaveLength(8);
  expect(caps.tone).toBeNull();
  expect(caps.eqPresets).toEqual([]);
  expect(caps.dialogue).toBeNull();
});

it('drops only the features whose actions fault', async () => {
  fake.faultActions.add('GetTvConfig');
  fake.faultActions.add('ListPresets');
  const { caps } = await probeCapabilities(cmds, ep, player);
  expect(caps.upnpReachable).toBe(true);
  expect(caps.tone).not.toBeNull();
  expect(caps.eqPresets).toEqual([]);
  expect(caps.dialogue).toBeNull();
  expect(caps.night).toBeNull();
});

it('hides sound modes and the subwoofer on a Home speaker without a subwoofer', async () => {
  client.close();
  await fake.stop();
  await setup({ model: 'Denon Home 150' });
  const { caps, settings } = await probeCapabilities(cmds, ep, player);
  expect(caps.soundModes).toEqual([]);
  expect(caps.tone?.subwoofer).toBeNull();
  expect(caps.tone?.bass).toBeDefined();
  expect(settings).toMatchObject({ subwoofer: null, soundMode: null });
});

it('shows the subwoofer on a Home speaker that reports one enabled', async () => {
  client.close();
  await fake.stop();
  await setup({ model: 'Denon Home 350', subwooferEnable: 1 });
  const { caps } = await probeCapabilities(cmds, ep, player);
  expect(caps.tone?.subwoofer).toEqual({ min: 0, max: 30 });
  expect(caps.soundModes).toEqual([]);
});

it.each(['Marantz NR1200', 'Denon DRA-800H', 'Marantz SR6013'])('hides soundbar sound modes on receiver %s', async (model) => {
  client.close();
  await fake.stop();
  await setup({ model });
  const { caps } = await probeCapabilities(cmds, ep, player);
  expect(caps.soundModes).toEqual([]);
});

it.each(['Denon DHT-S216', 'Denon Home Sound Bar 550', 'HEOS Bar', 'HEOS HomeCinema'])('keeps sound modes on soundbar %s', async (model) => {
  client.close();
  await fake.stop();
  await setup({ model });
  const { caps } = await probeCapabilities(cmds, ep, player);
  expect(caps.soundModes).toEqual(['MUSIC_NORMAL', 'MOVIE_NORMAL']);
  expect(caps.tone?.subwoofer).not.toBeNull();
});
