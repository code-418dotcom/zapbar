import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HeosCliClient } from '../src/cli/client';
import { createCliCommands, deviceKey, type CliCommands } from '../src/cli/commands';
import { nodeSocketFactory } from '../src/node';
import { FakeHeos } from './fake/fake-heos';

let fake: FakeHeos;
let client: HeosCliClient;
let cmds: CliCommands;
const PID = 7331878;

beforeEach(async () => {
  fake = await FakeHeos.start();
  client = await HeosCliClient.connect(nodeSocketFactory, '127.0.0.1', { port: fake.cliPort });
  cmds = createCliCommands(client);
});
afterEach(async () => {
  client.close();
  await fake.stop();
});

describe('CLI commands against the fake device', () => {
  it('maps get_players including the serial', async () => {
    expect(await cmds.getPlayers()).toEqual([
      { pid: PID, name: 'Loving room', model: 'Denon DHT-S716H', version: '3.139.170', ip: '127.0.0.1', network: 'wired', serial: 'TESTSERIAL0001' },
    ]);
  });

  it('lists inputs with the player-name prefix stripped', async () => {
    const inputs = await cmds.getInputs(PID, 'Loving room');
    expect(inputs).toHaveLength(8);
    expect(inputs[1]).toEqual({ mid: 'inputs/hdmi_in_1', name: 'HDMI 1' });
  });

  it('reads and sets volume, clamping to 0-100', async () => {
    expect(await cmds.getVolume(PID)).toBe(49);
    await cmds.setVolume(PID, 150);
    expect(fake.state.volume).toBe(100);
  });

  it('reads and sets mute', async () => {
    await cmds.setMute(PID, true);
    expect(await cmds.getMute(PID)).toBe(true);
  });

  it('plays an input through the "command under process" reply', async () => {
    await cmds.playInput(PID, 'inputs/hdmi_in_3');
    expect(fake.state.nowPlayingMid).toBe('inputs/hdmi_in_3');
  });

  it('returns now-playing for inputs and streams', async () => {
    expect(await cmds.getNowPlaying(PID)).toMatchObject({ mid: 'inputs/hdmi_in_1', sid: 1027 });
    fake.state.nowPlayingMid = 'spotify:track:1';
    expect(await cmds.getNowPlaying(PID)).toMatchObject({ song: 'Fake Song', artist: 'Fake Artist', sid: 4 });
  });

  it('reads play state and quick selects', async () => {
    expect(await cmds.getPlayState(PID)).toBe('play');
    const qs = await cmds.getQuickSelects(PID);
    expect(qs[0]).toEqual({ id: 1, name: 'Watch TV' });
    await cmds.playQuickSelect(PID, 1);
    expect(fake.count('player/play_quickselect')).toBe(1);
  });

  it('deviceKey prefers the serial and falls back to the pid', () => {
    expect(deviceKey({ pid: 1, serial: 'ABC' })).toBe('ABC');
    expect(deviceKey({ pid: 1 })).toBe('pid:1');
  });
});
