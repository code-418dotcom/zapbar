import { CLI_PORT, HeosCliClient } from '../cli/client';
import { createCliCommands, deviceKey, type PlayerInfo } from '../cli/commands';
import type { SocketFactory } from '../transport';

export const SSDP_ADDR = '239.255.255.250';
export const SSDP_PORT = 1900;
export const HEOS_ST = 'urn:schemas-denon-com:device:ACT-Denon:1';

export interface SsdpHit {
  ip: string;
  location: string;
}

export interface FoundPlayer extends PlayerInfo {
  key: string;
}

export function buildMSearch(mx = 2): string {
  return ['M-SEARCH * HTTP/1.1', `HOST: ${SSDP_ADDR}:${SSDP_PORT}`, 'MAN: "ssdp:discover"', `MX: ${mx}`, `ST: ${HEOS_ST}`, '', ''].join('\r\n');
}

export function parseSsdpResponse(text: string, fromIp: string): SsdpHit | null {
  const lines = text.split(/\r?\n/);
  if (!/^HTTP\/1\.1 200/i.test(lines[0] ?? '')) return null;
  const headers: Record<string, string> = {};
  for (const l of lines.slice(1)) {
    const i = l.indexOf(':');
    if (i > 0) headers[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
  }
  if (headers.st !== HEOS_ST || !headers.location) return null;
  return { ip: fromIp, location: headers.location };
}

export const uniqueIps = (hits: SsdpHit[]): string[] => [...new Set(hits.map((h) => h.ip))];

// get_players on any HEOS device lists every player in that HEOS system, with its IP.
export async function listPlayers(ips: string[], factory: SocketFactory, port = CLI_PORT): Promise<FoundPlayer[]> {
  const found = new Map<string, FoundPlayer>();
  for (const ip of ips) {
    let client: HeosCliClient | null = null;
    try {
      client = await HeosCliClient.connect(factory, ip, { port, timeoutMs: 2000 });
      for (const p of await createCliCommands(client).getPlayers()) {
        const key = deviceKey(p);
        if (!found.has(key)) found.set(key, { ...p, key, ip: p.ip || ip });
      }
    } catch {
      // unreachable or not HEOS; try the next IP
    } finally {
      client?.close();
    }
  }
  return [...found.values()];
}

export async function findIpByKey(ips: string[], key: string, factory: SocketFactory, port = CLI_PORT): Promise<string | null> {
  const players = await listPlayers(ips, factory, port);
  return players.find((p) => p.key === key)?.ip ?? null;
}
