// Live probe, READ-ONLY: lists the bar's name actions (SCPD) and reads the current name via ACT and the CLI.
import { soapCall, ACT } from '../src/upnp/soap';
import { nodeHttp, nodeSocketFactory } from '../src/node';
import { HeosCliClient } from '../src/cli/client';
import { createCliCommands } from '../src/cli/commands';

const IP = process.argv[2] ?? '10.0.0.82';
const ep = { http: nodeHttp, baseUrl: `http://${IP}:60006`, timeoutMs: 4000 };

const desc = await (await fetch(`http://${IP}:60006/upnp/desc/aios_device/aios_device.xml`)).text();
const scpdUrls = [...desc.matchAll(/<SCPDURL>([^<]+)<\/SCPDURL>/g)].map((m) => m[1]!);
for (const u of scpdUrls) {
  const scpd = await (await fetch(`http://${IP}:60006${u.startsWith('/') ? '' : '/'}${u}`)).text().catch(() => '');
  for (const a of scpd.matchAll(/<action>\s*<name>([^<]*Name[^<]*)<\/name>([\s\S]*?)<\/action>/g)) {
    const args = [...a[2]!.matchAll(/<name>([^<]+)<\/name>\s*<direction>([^<]+)<\/direction>/g)].map((x) => `${x[1]}(${x[2]})`);
    console.log(`SCPD ${u}: ${a[1]} ${args.join(', ')}`);
  }
}
const cli = await HeosCliClient.connect(nodeSocketFactory, IP);
const cmds = createCliCommands(cli);
const cliName = async () => (await cmds.getPlayers())[0]?.name;
const before = await soapCall(ep, ACT, 'GetFriendlyName').catch((e) => ({ error: String(e) }));
console.log('GetFriendlyName ->', JSON.stringify(before), '| CLI name ->', await cliName());
// Read-only on purpose: a rename write once locked up the bar (docs/probe-results.md, "Rename").
cli.close();
