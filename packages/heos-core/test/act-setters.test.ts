import { afterEach, beforeEach, expect, it } from 'vitest';
import { nodeHttp } from '../src/node';
import { audioPatchXml, getAudioConfig, getTvConfig, setAudioConfig, setTvConfig, tvPatchXml } from '../src/upnp/act';
import type { UpnpEndpoint } from '../src/upnp/soap';
import { FakeHeos } from './fake/fake-heos';

let fake: FakeHeos;
let ep: UpnpEndpoint;
beforeEach(async () => {
  fake = await FakeHeos.start();
  ep = { http: nodeHttp, baseUrl: fake.baseUrl, timeoutMs: 1000 };
});
afterEach(() => fake.stop());

it('builds patch XML containing only the changed fields', () => {
  expect(audioPatchXml({ soundMode: 'MUSIC_NORMAL' })).toBe('<AudioConfig><soundMode>MUSIC_NORMAL</soundMode></AudioConfig>');
  expect(tvPatchXml({ nightLevel: 1 })).toBe('<TvConfig><nightMode><level>1</level></nightMode></TvConfig>');
  expect(tvPatchXml({ dialogueLevel: 3 })).toBe('<TvConfig><dialogueEnhance><level>3</level></dialogueEnhance></TvConfig>');
});

it('sets the sound mode', async () => {
  await setAudioConfig(ep, { soundMode: 'MUSIC_NORMAL' });
  expect((await getAudioConfig(ep)).soundMode).toBe('MUSIC_NORMAL');
});

it('sets dialogue and night levels', async () => {
  await setTvConfig(ep, { dialogueLevel: 3 });
  await setTvConfig(ep, { nightLevel: 1 });
  const tv = await getTvConfig(ep);
  expect(tv.dialogue?.level).toBe(3);
  expect(tv.night?.level).toBe(1);
});
