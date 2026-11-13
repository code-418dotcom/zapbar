import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeHttp } from '../src/node';
import { getAudioConfig, getTvConfig, parseAudioConfig, parseTvConfig } from '../src/upnp/act';
import { getBass, getEqPreset, getSubwoofer, getTreble, listEqPresets, presetLabel, selectEqPreset, setBass, setSubwoofer, setTreble } from '../src/upnp/rendering';
import { ACT, soapCall, UpnpFault, UpnpUnreachable, type UpnpEndpoint } from '../src/upnp/soap';
import { FakeHeos } from './fake/fake-heos';
import { AUDIO_CONFIG_XML, TV_CONFIG_XML } from './fixtures/dht-s716h';

describe('ACT config parsing (real fixtures)', () => {
  it('parses the audio config', () => {
    expect(parseAudioConfig(AUDIO_CONFIG_XML)).toMatchObject({ soundMode: 'MOVIE_NORMAL', availableSoundModes: ['MUSIC_NORMAL', 'MOVIE_NORMAL'], bassBoost: 0 });
  });

  it('parses mixed-content dialogue and night', () => {
    expect(parseTvConfig(TV_CONFIG_XML)).toMatchObject({ dialogue: { level: 2, supported: true }, night: { level: 0, supported: true }, audioDelay: 0 });
  });

  it('accepts a config wrapped in its root twice', () => {
    expect(parseAudioConfig(`<AudioConfig>${AUDIO_CONFIG_XML}</AudioConfig>`).soundMode).toBe('MOVIE_NORMAL');
  });

  it('tolerates empty and unknown config', () => {
    expect(parseAudioConfig('')).toMatchObject({ soundMode: null, availableSoundModes: [], bassBoost: null });
    expect(parseTvConfig('<TvConfig><futureThing>7</futureThing><dialogueEnhance>3</dialogueEnhance></TvConfig>')).toMatchObject({
      dialogue: { level: 3, supported: true },
      night: null,
      audioDelay: null,
    });
  });
});

describe('UPnP against the fake device', () => {
  let fake: FakeHeos;
  let ep: UpnpEndpoint;
  beforeEach(async () => {
    fake = await FakeHeos.start();
    ep = { http: nodeHttp, baseUrl: fake.baseUrl, timeoutMs: 1000 };
  });
  afterEach(() => fake.stop());

  it('reads the embedded ACT configs', async () => {
    expect((await getAudioConfig(ep)).soundMode).toBe('MOVIE_NORMAL');
    expect((await getTvConfig(ep)).dialogue).toEqual({ level: 2, supported: true });
  });

  it('reads and sets tone controls, clamping to range', async () => {
    expect(await getBass(ep)).toBe(5);
    await setBass(ep, 7);
    expect(fake.state.bass).toBe(7);
    await setTreble(ep, -3);
    expect(await getTreble(ep)).toBe(0);
    await setSubwoofer(ep, 40);
    expect(await getSubwoofer(ep)).toBe(30);
  });

  it('lists only real EQ presets and selects one', async () => {
    expect(await listEqPresets(ep)).toEqual(['Accoustic', 'Classical', 'Jazz', 'Pop', 'Rock']);
    expect(await getEqPreset(ep)).toBeNull();
    await selectEqPreset(ep, 'Rock');
    expect(await getEqPreset(ep)).toBe('Rock');
    expect(presetLabel('Accoustic')).toBe('Acoustic');
  });

  it('raises UpnpFault for an action the device rejects', async () => {
    await expect(soapCall(ep, ACT, 'NoSuchAction')).rejects.toBeInstanceOf(UpnpFault);
  });

  it('raises UpnpUnreachable when the service is down', async () => {
    fake.upnpDown = true;
    await expect(getBass(ep)).rejects.toBeInstanceOf(UpnpUnreachable);
  });

  it('raises UpnpUnreachable when nothing listens', async () => {
    await expect(getBass({ http: nodeHttp, baseUrl: 'http://127.0.0.1:1', timeoutMs: 500 })).rejects.toBeInstanceOf(UpnpUnreachable);
  });
});
