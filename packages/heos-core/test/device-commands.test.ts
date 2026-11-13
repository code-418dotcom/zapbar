import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HeosDevice } from '../src/device';
import { nodeHttp, nodeSocketFactory } from '../src/node';
import { createHeosStore, type HeosStore } from '../src/state/store';
import { FakeHeos } from './fake/fake-heos';
import { waitFor } from './helpers';

const KEY = 'TESTSERIAL0001';
const PID = 7331878;
let fake: FakeHeos;
let store: HeosStore;
let dev: HeosDevice;
const st = () => store.getState().devices[KEY]!;

async function ready(status: 'ready' | 'degraded' = 'ready') {
  dev = new HeosDevice(
    { socketFactory: nodeSocketFactory, http: nodeHttp, store, cliPort: fake.cliPort, upnpPort: fake.httpPort, timeoutMs: 500, backoffMs: [20], upnpPollMs: 50 },
    { key: KEY, ip: '127.0.0.1' },
  );
  dev.start();
  await waitFor(() => st().status === status);
}

beforeEach(async () => {
  fake = await FakeHeos.start();
  store = createHeosStore();
});
afterEach(async () => {
  dev?.stop();
  await fake.stop();
});

describe('CLI commands', () => {
  it('applies mute optimistically before the device confirms', async () => {
    await ready();
    const p = dev.setMute(true);
    expect(st().settings.mute).toBe(true);
    expect(await p).toBe(true);
    expect(fake.state.mute).toBe(true);
  });

  it('switches input and keeps it after the now-playing event', async () => {
    await ready();
    expect(await dev.playInput('inputs/hdmi_in_2')).toBe(true);
    expect(fake.state.nowPlayingMid).toBe('inputs/hdmi_in_2');
    await new Promise((r) => setTimeout(r, 50));
    expect(st().settings.activeInput).toBe('inputs/hdmi_in_2');
  });

  it("rolls back and reports the device's error", async () => {
    await ready();
    fake.failNext('browse/play_input', '2', 'Invalid input');
    expect(await dev.playInput('inputs/hdmi_in_4')).toBe(false);
    expect(st().settings.activeInput).toBe('inputs/hdmi_in_1');
    expect(st().lastError?.text).toBe("Couldn't change input: Invalid input");
  });

  it('reports a timeout as "soundbar didn\'t respond" and rolls back', async () => {
    await ready();
    fake.silenced.add('player/set_mute');
    expect(await dev.setMute(true)).toBe(false);
    expect(st().settings.mute).toBe(false);
    expect(st().lastError?.text).toBe("Couldn't change mute, soundbar didn't respond");
  });

  it('coalesces a rapid volume drag and lands on the last value', async () => {
    await ready();
    const calls: Promise<boolean>[] = [];
    for (let v = 10; v <= 30; v++) calls.push(dev.setVolume(v));
    await Promise.all(calls);
    await waitFor(() => fake.state.volume === 30);
    expect(fake.count('player/set_volume')).toBeLessThan(21);
    expect(st().settings.volume).toBe(30);
  });

  it('volumeStep moves relative to the current volume and clamps', async () => {
    await ready();
    await dev.volumeStep(5);
    expect(fake.state.volume).toBe(54);
    await dev.setVolume(250);
    expect(fake.state.volume).toBe(100);
  });

  it('applies external changes from device events', async () => {
    await ready();
    fake.state.volume = 12;
    fake.emit('player_volume_changed', { pid: PID, level: 12, mute: 'on' });
    await waitFor(() => st().settings.volume === 12);
    expect(st().settings.mute).toBe(true);
  });

  it('ignores events for other players', async () => {
    await ready();
    fake.emit('player_volume_changed', { pid: 999, level: 1, mute: 'on' });
    await new Promise((r) => setTimeout(r, 50));
    expect(st().settings.volume).toBe(49);
  });

  it('shows a stream in now-playing when the source changes', async () => {
    await ready();
    fake.state.nowPlayingMid = 'spotify:track:1';
    fake.emit('player_now_playing_changed', { pid: PID });
    await waitFor(() => st().settings.nowPlaying !== null);
    expect(st().settings).toMatchObject({ activeInput: null, nowPlaying: { title: 'Fake Song', sourceName: 'Spotify' } });
  });

  it('sends nothing while offline', async () => {
    await ready();
    dev.stop();
    const before = fake.received.length;
    expect(await dev.setVolume(10)).toBe(false);
    expect(await dev.setBass(7)).toBe(false);
    expect(fake.received.length).toBe(before);
  });
});

describe('UPnP commands', () => {
  it('sets tone, sound mode, dialogue and night', async () => {
    await ready();
    expect(await dev.setBass(8)).toBe(true);
    expect(await dev.setTreble(2)).toBe(true);
    expect(await dev.setSubwoofer(20)).toBe(true);
    expect(await dev.setSoundMode('MUSIC_NORMAL')).toBe(true);
    expect(await dev.setDialogue(3)).toBe(true);
    expect(await dev.setNight(1)).toBe(true);
    expect(fake.state).toMatchObject({ bass: 8, treble: 2, subwoofer: 20, soundMode: 'MUSIC_NORMAL', dialogueLevel: 3, nightLevel: 1 });
    expect(st().settings).toMatchObject({ bass: 8, treble: 2, subwoofer: 20, soundMode: 'MUSIC_NORMAL', dialogueLevel: 3, nightLevel: 1 });
  });

  it('resets tone to neutral and selects an EQ preset', async () => {
    await ready();
    await dev.setBass(9);
    expect(await dev.resetTone()).toBe(true);
    expect(fake.state).toMatchObject({ bass: 5, treble: 5 });
    expect(await dev.selectEqPreset('Jazz')).toBe(true);
    expect(st().settings.eqPreset).toBe('Jazz');
  });

  it('blocks UPnP commands while degraded but keeps CLI commands working', async () => {
    fake.upnpDown = true;
    await ready('degraded');
    expect(await dev.setBass(7)).toBe(false);
    expect(st().lastError?.text).toBe('Soundbar settings unavailable');
    expect(await dev.setVolume(20)).toBe(true);
    expect(fake.state.volume).toBe(20);
  });

  it('polls UPnP settings while visible', async () => {
    await ready();
    dev.setVisible(true);
    fake.state.bass = 8;
    await waitFor(() => st().settings.bass === 8);
    dev.setVisible(false);
  });

  it('recovers from degraded to ready when UPnP comes back', async () => {
    fake.upnpDown = true;
    await ready('degraded');
    dev.setVisible(true);
    fake.upnpDown = false;
    await waitFor(() => st().status === 'ready');
    expect(st().caps?.tone).not.toBeNull();
  });
});

describe('tone drags', () => {
  it('coalesces a rapid bass drag and lands on the last value', async () => {
    await ready();
    fake.soapDelay.set('X_SetBass', 30);
    const calls: Promise<boolean>[] = [];
    for (let v = 1; v <= 10; v++) calls.push(dev.setBass(v));
    await Promise.all(calls);
    await waitFor(() => fake.state.bass === 10);
    expect(fake.soapReceived.filter((a) => a === 'X_SetBass').length).toBeLessThanOrEqual(3);
    expect(st().settings.bass).toBe(10);
  });

  it('rolls back a failed tone drag to the last confirmed value', async () => {
    await ready();
    fake.soapDelay.set('X_SetBass', 800);
    const a = dev.setBass(8);
    const b = dev.setBass(9);
    await Promise.all([a, b]);
    expect(st().settings.bass).toBe(5);
  });
});

describe('source changes', () => {
  it('switches from a stream to an input in one call (owner requirement)', async () => {
    fake.state.nowPlayingMid = 'spotify:track:1';
    await ready();
    expect(st().settings.nowPlaying).not.toBeNull();
    expect(await dev.playInput('inputs/hdmi_in_1')).toBe(true);
    expect(fake.state.nowPlayingMid).toBe('inputs/hdmi_in_1');
    await waitFor(() => st().settings.activeInput === 'inputs/hdmi_in_1' && st().settings.nowPlaying === null);
    expect(fake.count('browse/play_input')).toBe(1);
  });

  it('re-reads sound settings when the source changes', async () => {
    await ready();
    fake.state.soundMode = 'MUSIC_NORMAL';
    fake.state.dialogueLevel = 0;
    fake.state.nowPlayingMid = 'spotify:track:1';
    fake.emit('player_now_playing_changed', { pid: PID });
    await waitFor(() => st().settings.soundMode === 'MUSIC_NORMAL');
    expect(st().settings.dialogueLevel).toBe(0);
  });
});

describe('input switch settling', () => {
  it('a stale now-playing report right after an input tap does not bounce the tile back', async () => {
    await ready();
    expect(st().settings.activeInput).toBe('inputs/hdmi_in_1');
    const seen: Array<string | null> = [];
    const unsub = store.subscribe((s) => seen.push(s.devices[KEY]!.settings.activeInput));
    expect(await dev.playInput('inputs/hdmi_in_2')).toBe(true);
    // The bar re-reports the old input once before the switch lands (seen on the DHT-S716H).
    fake.state.nowPlayingMid = 'inputs/hdmi_in_1';
    fake.emit('player_now_playing_changed', { pid: PID });
    await new Promise((r) => setTimeout(r, 100));
    fake.state.nowPlayingMid = 'inputs/hdmi_in_2';
    fake.emit('player_now_playing_changed', { pid: PID });
    await new Promise((r) => setTimeout(r, 100));
    unsub();
    expect(st().settings.activeInput).toBe('inputs/hdmi_in_2');
    expect(seen.slice(seen.indexOf('inputs/hdmi_in_2'))).not.toContain('inputs/hdmi_in_1');
  });

  it('accepts a change made elsewhere once the switch has landed', async () => {
    await ready();
    await dev.playInput('inputs/hdmi_in_2');
    fake.emit('player_now_playing_changed', { pid: PID });
    await waitFor(() => st().settings.activeInput === 'inputs/hdmi_in_2');
    await new Promise((r) => setTimeout(r, 50));
    fake.state.nowPlayingMid = 'inputs/hdmi_in_1';
    fake.emit('player_now_playing_changed', { pid: PID });
    await waitFor(() => st().settings.activeInput === 'inputs/hdmi_in_1');
  });
});

describe('volume drag settling', () => {
  it('late echoes of in-between drag values do not pull the slider back', async () => {
    await ready();
    await Promise.all([dev.setVolume(20), dev.setVolume(25), dev.setVolume(30)]);
    await waitFor(() => fake.state.volume === 30);
    const seen: number[] = [];
    const unsub = store.subscribe((s) => seen.push(s.devices[KEY]!.settings.volume));
    // The real bar acknowledges each step late, after the drag already ended.
    // (25 was coalesced away while 20 was in flight, so only 20 and 30 were ever sent.)
    expect(fake.count('player/set_volume')).toBe(2);
    fake.emit('player_volume_changed', { pid: PID, level: 20, mute: 'off' });
    await new Promise((r) => setTimeout(r, 100));
    unsub();
    expect(seen.filter((v) => v !== 30)).toEqual([]);
    expect(st().settings.volume).toBe(30);
  });

  it('still follows a volume change made elsewhere', async () => {
    await ready();
    await dev.setVolume(30);
    fake.emit('player_volume_changed', { pid: PID, level: 12, mute: 'off' });
    await waitFor(() => st().settings.volume === 12);
  });
});

describe('rename', () => {
  it('renames the bar and updates the store', async () => {
    await ready();
    expect(await dev.setName('Living room')).toBe('ok');
    expect(fake.state.name).toBe('Living room');
    expect(st().name).toBe('Living room');
  });

  it('reports unsupported when the bar faults the action', async () => {
    await ready();
    fake.faultActions.add('SetDeviceFriendlyName');
    expect(await dev.setName('Living room')).toBe('unsupported');
    expect(st().name).toBe('Loving room');
  });

  it('refuses an empty name without contacting the bar', async () => {
    await ready();
    expect(await dev.setName('  ')).toBe('failed');
    expect(fake.soapReceived.some((a) => a.includes('SetDeviceFriendlyName'))).toBe(false);
  });
});

describe('stereo pair', () => {
  it('shows the pair name instead of the left speaker name', async () => {
    fake.state.pairName = 'Living room pair';
    await ready();
    expect(st().name).toBe('Living room pair');
    expect(st().players.find((p) => p.pid === PID)?.name).toBe('Living room pair');
  });

  it('keeps the speaker name when the device is not bonded', async () => {
    await ready();
    expect(st().name).toBe('Loving room');
  });

  it('never renames a pair through the left speaker: the caller keeps a nickname', async () => {
    fake.state.pairName = 'Living room pair';
    await ready();
    expect(await dev.setName('Lounge')).toBe('unsupported');
    expect(fake.soapReceived.some((a) => a.includes('SetDeviceFriendlyName'))).toBe(false);
  });

  it('still connects when the pair-name lookup faults', async () => {
    fake.faultActions.add('GetGroupFriendlyName');
    await ready();
    expect(st().name).toBe('Loving room');
  });
});
