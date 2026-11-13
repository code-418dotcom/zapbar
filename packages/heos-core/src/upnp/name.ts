import { ACT, soapCall, type UpnpEndpoint, type UpnpService } from './soap';

/** Renaming goes through GroupControl: ACT's SetFriendlyName needs a configuration token (docs/probe-results.md). */
export const GROUP_CONTROL: UpnpService = {
  path: '/upnp/control/AiosServicesDvc/GroupControl',
  type: 'urn:schemas-denon-com:service:GroupControl:1',
};

export const MAX_NAME_LENGTH = 40;

/** Trimmed name of 1–40 visible characters, or null when it cannot be used. Invisible format/control characters are dropped first. */
export function cleanName(raw: string): string | null {
  const name = raw.replace(/[\p{Cf}\p{Cc}]/gu, '').trim();
  return name.length >= 1 && name.length <= MAX_NAME_LENGTH ? name : null;
}

/** Read via ACT only: GroupControl's GetDeviceFriendlyName answers "" on the DHT-S716H. */
export async function getFriendlyName(ep: UpnpEndpoint): Promise<string> {
  const out = await soapCall(ep, ACT, 'GetFriendlyName');
  return out.friendlyName ?? '';
}

/** An empty name locks up the bar's network stack until a power cycle, so it never leaves this function. */
export async function setFriendlyName(ep: UpnpEndpoint, raw: string): Promise<void> {
  const name = cleanName(raw);
  if (!name) throw new Error('Refusing to send an empty or over-long name');
  await soapCall(ep, GROUP_CONTROL, 'SetDeviceFriendlyName', { DeviceFriendlyName: name });
}

/**
 * Name of a bonded set (stereo pair, or a bar with surrounds) as the HEOS app shows it; "" when not bonded
 * (DHT-S716H on its own answers ""). CLI get_players names a stereo pair after its left speaker (tester, 2× Home 150).
 */
export async function getGroupFriendlyName(ep: UpnpEndpoint): Promise<string> {
  const out = await soapCall(ep, GROUP_CONTROL, 'GetGroupFriendlyName');
  return out.GroupFriendlyName ?? '';
}
