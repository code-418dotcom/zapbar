import { Platform } from 'react-native';
import { buildMSearch, parseSsdpResponse, uniqueIps, type SsdpHit } from '@zapbar/heos-core';
import type { RawReply } from '../../modules/zapbar-discovery';

export type SearchFn = (message: string, timeoutMs: number) => Promise<RawReply[]>;

export async function discoverIps(search: SearchFn, timeoutMs = 3000): Promise<string[]> {
  const raw = await search(buildMSearch(), timeoutMs).catch(() => [] as RawReply[]);
  return uniqueIps(raw.map((r) => parseSsdpResponse(r.text, r.ip)).filter((h): h is SsdpHit => h !== null));
}

/** The native module is loaded lazily so tests never touch it. */
export function nativeSearch(): SearchFn {
  const mod = require('../../modules/zapbar-discovery').default as { searchAsync: SearchFn };
  return (message, timeoutMs) => mod.searchAsync(message, timeoutMs);
}

export const HEOS_BONJOUR = '_heos-audio._tcp';
export const IOS_BROWSE_MS = 10_000;

export type BrowseFn = (serviceType: string, timeoutMs: number) => Promise<string[]>;

/** iOS denied local network access; the UI should point the user at Settings. */
export class LocalNetworkDenied extends Error {
  constructor() {
    super('Local network access denied');
    this.name = 'LocalNetworkDenied';
  }
}

export async function browseIps(browse: BrowseFn, timeoutMs = IOS_BROWSE_MS): Promise<string[]> {
  try {
    const ips = await browse(HEOS_BONJOUR, timeoutMs);
    return [...new Set(ips)];
  } catch (e) {
    if ((e as { code?: string } | null)?.code === 'LOCAL_NETWORK_DENIED') throw new LocalNetworkDenied();
    return [];
  }
}

/** Loaded lazily, like nativeSearch. */
export function nativeBrowse(): BrowseFn {
  const mod = require('../../modules/zapbar-discovery').default as { browseAsync: BrowseFn };
  return (serviceType, timeoutMs) => mod.browseAsync(serviceType, timeoutMs);
}

/** iOS browses Bonjour (no multicast entitlement); Android keeps SSDP. */
export function nativeDiscover(os: string = Platform.OS): () => Promise<string[]> {
  return os === 'ios' ? () => browseIps(nativeBrowse()) : () => discoverIps(nativeSearch());
}
