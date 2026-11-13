/**
 * Live write-probe against a real HEOS soundbar: changes each setting briefly, reads it back, restores it.
 * Usage (from packages/heos-core):
 *   pnpm exec tsx scripts/probe-writes.ts <ip> [--quickselect] [--spotify] [--listen <seconds>]
 * Never calls system/check_account (it returns the HEOS account e-mail).
 */
import { writeFileSync } from 'node:fs';
import { HeosCliClient } from '../src/cli/client';
import { createCliCommands } from '../src/cli/commands';
import { nodeHttp, nodeSocketFactory } from '../src/node';
import { getAudioConfig, getTvConfig } from '../src/upnp/act';
import { getBass, getEqPreset, getTreble, selectEqPreset, setBass, setTreble } from '../src/upnp/rendering';
import { ACT, soapCall, type UpnpEndpoint } from '../src/upnp/soap';
import { sleep } from '../src/util';

const args = process.argv.slice(2);
const ip = args[0] ?? '10.0.0.82';
const flag = (f: string) => args.includes(f);
const listenSec = Number(args[args.indexOf('--listen') + 1] ?? 0);
const ep: UpnpEndpoint = { http: nodeHttp, baseUrl: `http://${ip}:60006`, timeoutMs: 5000 };
const out: string[] = ['# Write-probe results', '', `Device ${ip}, run ${new Date().toISOString()}`, ''];
const log = (...lines: string[]) => {
  for (const s of lines) {
    console.log(s);
    out.push(s);
  }
};

interface Candidate { name: string; write: (v: string) => Promise<unknown> }

const setAudio = (xml: string) => soapCall(ep, ACT, 'SetAudioConfig', { AudioConfig: xml });
const setTv = (xml: string) => soapCall(ep, ACT, 'SetTvConfig', { TvConfig: xml });
const withApply = async (fn: () => Promise<unknown>) => {
  const t = await soapCall(ep, ACT, 'GetConfigurationToken');
  await fn();
  await soapCall(ep, ACT, 'ApplyChanges', { configurationToken: t.configurationToken ?? '' });
};

async function tryCandidates(label: string, read: () => Promise<string>, target: string, original: string, candidates: Candidate[]): Promise<Candidate | null> {
  for (const c of candidates) {
    try {
      await c.write(target);
    } catch (e) {
      log(`| ${label} | ${c.name} | error: ${(e as Error).message} |`);
      continue;
    }
    await sleep(800);
    const got = await read();
    const works = got === target;
    log(`| ${label} | ${c.name} | wrote ${target}, read back ${got} → ${works ? 'WORKS' : 'no effect'} |`);
    if (works) {
      await c.write(original);
      await sleep(800);
      log(`| ${label} | restore | read back ${await read()} (original ${original}) |`);
      return c;
    }
  }
  log(`| ${label} | — | NO CANDIDATE WORKED |`);
  return null;
}

async function scanRange(label: string, winner: Candidate, read: () => Promise<string>, original: string, values: number[]) {
  const accepted: number[] = [];
  for (const v of values) {
    try {
      await winner.write(String(v));
      await sleep(600);
      if ((await read()) === String(v)) accepted.push(v);
    } catch {
      /* rejected value */
    }
  }
  await winner.write(original);
  await sleep(600);
  log(`- ${label} accepted values: [${accepted.join(', ')}] (restored to ${await read()})`);
}

const levelCandidates = (tag: string): Candidate[] => [
  { name: 'partial-nested', write: (v) => setTv(`<TvConfig><${tag}><level>${v}</level></${tag}></TvConfig>`) },
  { name: 'partial-text', write: (v) => setTv(`<TvConfig><${tag}>${v}</${tag}></TvConfig>`) },
  {
    name: 'full-echo',
    write: async (v) => setTv((await getTvConfig(ep)).rawXml.replace(new RegExp(`<${tag}>\\d*<level>\\d+</level>`), `<${tag}>${v}<level>${v}</level>`)),
  },
  { name: 'partial-nested+ApplyChanges', write: (v) => withApply(() => setTv(`<TvConfig><${tag}><level>${v}</level></${tag}></TvConfig>`)) },
];

async function main() {
  log('## ACT setter formats', '');
  log('| setting | candidate | result |');
  log('|---|---|---|');

  const audio = await getAudioConfig(ep);
  const mode0 = audio.soundMode ?? '';
  const modeTarget = audio.availableSoundModes.find((m) => m !== mode0) ?? mode0;
  const readMode = async () => (await getAudioConfig(ep)).soundMode ?? '';
  await tryCandidates('soundMode', readMode, modeTarget, mode0, [
    { name: 'partial', write: (v) => setAudio(`<AudioConfig><soundMode>${v}</soundMode></AudioConfig>`) },
    { name: 'full-echo', write: async (v) => setAudio((await getAudioConfig(ep)).rawXml.replace(/<soundMode>[^<]*<\/soundMode>/, `<soundMode>${v}</soundMode>`)) },
    { name: 'partial+ApplyChanges', write: (v) => withApply(() => setAudio(`<AudioConfig><soundMode>${v}</soundMode></AudioConfig>`)) },
  ]);

  const tv = await getTvConfig(ep);
  const readDialogue = async () => String((await getTvConfig(ep)).dialogue?.level ?? '');
  const d0 = String(tv.dialogue?.level ?? 0);
  const dWin = await tryCandidates('dialogue', readDialogue, d0 === '1' ? '2' : '1', d0, levelCandidates('dialogueEnhance'));

  const readNight = async () => String((await getTvConfig(ep)).night?.level ?? '');
  const n0 = String(tv.night?.level ?? 0);
  const nWin = await tryCandidates('night', readNight, n0 === '0' ? '1' : '0', n0, levelCandidates('nightMode'));

  log('', '## Ranges', '');
  if (dWin) await scanRange('dialogue', dWin, readDialogue, d0, [0, 1, 2, 3, 4, 5]);
  if (nWin) await scanRange('night', nWin, readNight, n0, [0, 1, 2, 3]);

  log('', '## Tone and presets', '');
  const b0 = await getBass(ep);
  const t0 = await getTreble(ep);
  const p0 = await getEqPreset(ep);
  await setBass(ep, b0 === 10 ? 9 : b0 + 1);
  await sleep(600);
  log(`- X_SetBass ${b0}→${b0 === 10 ? 9 : b0 + 1}: read back ${await getBass(ep)}`);
  for (const p of ['Rock', 'Disabled']) {
    await selectEqPreset(ep, p);
    await sleep(800);
    log(`- SelectPreset(${p}): bass ${await getBass(ep)}, treble ${await getTreble(ep)}, X_GetPreset "${(await getEqPreset(ep)) ?? ''}"`);
  }
  if (p0) await selectEqPreset(ep, p0);
  await setBass(ep, b0);
  await setTreble(ep, t0);
  await sleep(600);
  log(`- restored: bass ${await getBass(ep)} (was ${b0}), treble ${await getTreble(ep)} (was ${t0}), preset "${(await getEqPreset(ep)) ?? ''}" (was "${p0 ?? ''}")`);

  const client = await HeosCliClient.connect(nodeSocketFactory, ip, { timeoutMs: 5000 });
  const cmds = createCliCommands(client);
  const players = await cmds.getPlayers();
  const me = players.find((p) => p.ip === ip) ?? players[0];
  if (!me) throw new Error('no player found');
  const pid = me.pid;

  if (flag('--quickselect')) {
    log('', '## Quick Select', '');
    const vol0 = await cmds.getVolume(pid);
    const np0 = await cmds.getNowPlaying(pid);
    await cmds.playQuickSelect(pid, 1);
    await sleep(2500);
    const np1 = await cmds.getNowPlaying(pid);
    log(`- play_quickselect id=1: volume ${vol0}→${await cmds.getVolume(pid)}, mid "${np0?.mid}"→"${np1?.mid}"`);
    if (np0?.mid.startsWith('inputs/')) await cmds.playInput(pid, np0.mid);
    await cmds.setVolume(pid, vol0);
    log(`- restored volume ${await cmds.getVolume(pid)}, mid "${(await cmds.getNowPlaying(pid))?.mid}"`);
  }

  if (flag('--spotify')) {
    log('', '## Spotify Connect control via CLI', '');
    const np = await cmds.getNowPlaying(pid);
    if (!np || np.mid.startsWith('inputs/')) {
      log('- skipped: start Spotify on the soundbar via Spotify Connect first');
    } else {
      log(`- now playing: sid ${np.sid}, type ${np.type}, song "${np.song}", has art ${np.image_url ? 'yes' : 'no'}`);
      await cmds.setPlayState(pid, 'pause');
      await sleep(1500);
      log(`- set_play_state pause → get_play_state ${await cmds.getPlayState(pid)}`);
      await cmds.setPlayState(pid, 'play');
      await sleep(1500);
      log(`- set_play_state play → get_play_state ${await cmds.getPlayState(pid)}`);
      await cmds.playNext(pid);
      await sleep(2500);
      log(`- play_next → song "${(await cmds.getNowPlaying(pid))?.song}"`);
    }
  }

  if (listenSec > 0) {
    log('', `## Events (${listenSec}s)`, '');
    await cmds.registerForChangeEvents(true);
    client.onEvent((e) => log(`- ${new Date().toISOString().slice(11, 19)} event/${e.event} ${JSON.stringify(e.message)}`));
    client.onClose(() => log(`- ${new Date().toISOString().slice(11, 19)} CLI connection closed`));
    console.log('\nNOW, in order: change bass in the HEOS app, switch input on the IR remote, press power (standby), press power again.\n');
    await sleep(listenSec * 1000);
    try {
      log(`- after listening: get_play_state ${await cmds.getPlayState(pid)}`);
    } catch (e) {
      log(`- after listening: CLI error ${(e as Error).message}`);
    }
  }
  client.close();
}

main()
  .catch((e) => log(`\nFAILED: ${(e as Error).stack ?? e}`))
  .finally(() => {
    const path = new URL('../../../docs/probe-results.md', import.meta.url);
    writeFileSync(path, out.join('\n') + '\n');
    console.log(`\nwrote ${path.pathname}`);
  });
