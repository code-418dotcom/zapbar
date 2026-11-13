/**
 * End-to-end check against a real soundbar: discover, connect, print state, nudge volume and restore.
 * Usage (from packages/heos-core): pnpm exec tsx scripts/smoke.ts [ip]
 */
import { createHeosStore, HeosDevice, listPlayers, presetLabel, uniqueIps } from '../src';
import { nodeHttp, nodeSocketFactory, nodeSsdpSearch } from '../src/node';
import { sleep } from '../src/util';

const ips = process.argv[2] ? [process.argv[2]] : uniqueIps(await nodeSsdpSearch());
console.log('candidate IPs:', ips);
const players = await listPlayers(ips, nodeSocketFactory);
const target = players[0];
if (!target) throw new Error('no HEOS player found');
console.log(`found ${players.length} player(s); using "${target.name}" (${target.model}) at ${target.ip}`);

const store = createHeosStore();
const dev = new HeosDevice({ socketFactory: nodeSocketFactory, http: nodeHttp, store }, { key: target.key, ip: target.ip });
dev.start();
const t0 = Date.now();
while (!['ready', 'degraded'].includes(dev.state.status)) {
  if (Date.now() - t0 > 10_000) throw new Error(`stuck in ${dev.state.status}`);
  await sleep(100);
}
const { caps, settings, status } = dev.state;
console.log('status:', status);
console.log('inputs:', caps?.inputs.map((i) => i.name).join(', '));
console.log('quick selects in use:', caps?.quickSelects.filter((q) => q.used).map((q) => q.name).join(', ') || 'none');
console.log('eq presets:', caps?.eqPresets.map(presetLabel).join(', ') || 'none');
console.log('sound modes:', caps?.soundModes.join(', '));
console.log('settings:', JSON.stringify(settings));

const v0 = settings.volume;
console.log(`volume ${v0} → ${v0 + 1}:`, await dev.setVolume(v0 + 1));
await sleep(800);
console.log(`volume back to ${v0}:`, await dev.setVolume(v0));
await sleep(500);
console.log('final volume:', dev.state.settings.volume, dev.state.settings.volume === v0 ? 'OK' : 'MISMATCH');
dev.stop();
process.exit(0);
