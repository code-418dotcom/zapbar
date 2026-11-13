import { clamp } from '../util';
import { RENDERING, soapCall, UpnpFault, type UpnpEndpoint } from './soap';
import { numOrNull } from './xml';

// Ranges from the device SCPD (allowedValueRange), DHT-S716H firmware 3.139.170.
export const TONE_RANGE = {
  bass: { min: 0, max: 10, neutral: 5 },
  treble: { min: 0, max: 10, neutral: 5 },
  subwoofer: { min: 0, max: 30 },
} as const;

const CHANNEL = { InstanceID: 0, Channel: 'Master' };
const NON_EQ_PRESETS = new Set(['FactoryDefaults', 'InstallationDefaults', 'Disabled']);

async function getNumber(ep: UpnpEndpoint, action: string, outArg: string): Promise<number> {
  const r = await soapCall(ep, RENDERING, action, CHANNEL);
  const n = numOrNull(r[outArg] ?? '');
  if (n === null) throw new UpnpFault(action, 'parse', `missing ${outArg}`);
  return n;
}

export const getBass = (ep: UpnpEndpoint) => getNumber(ep, 'X_GetBass', 'CurrentBass');
export const getTreble = (ep: UpnpEndpoint) => getNumber(ep, 'X_GetTreble', 'CurrentTreble');
export const getSubwoofer = (ep: UpnpEndpoint) => getNumber(ep, 'X_GetSubwoofer', 'CurrentLevel');

export async function setBass(ep: UpnpEndpoint, v: number): Promise<void> {
  await soapCall(ep, RENDERING, 'X_SetBass', { ...CHANNEL, DesiredBass: clamp(Math.round(v), TONE_RANGE.bass.min, TONE_RANGE.bass.max) });
}

export async function setTreble(ep: UpnpEndpoint, v: number): Promise<void> {
  await soapCall(ep, RENDERING, 'X_SetTreble', { ...CHANNEL, DesiredTreble: clamp(Math.round(v), TONE_RANGE.treble.min, TONE_RANGE.treble.max) });
}

export async function setSubwoofer(ep: UpnpEndpoint, v: number): Promise<void> {
  await soapCall(ep, RENDERING, 'X_SetSubwoofer', { ...CHANNEL, DesiredLevel: clamp(Math.round(v), TONE_RANGE.subwoofer.min, TONE_RANGE.subwoofer.max) });
}

export async function listEqPresets(ep: UpnpEndpoint): Promise<string[]> {
  const r = await soapCall(ep, RENDERING, 'ListPresets', { InstanceID: 0 });
  return (r.CurrentPresetNameList ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !NON_EQ_PRESETS.has(s));
}

export async function getEqPreset(ep: UpnpEndpoint): Promise<string | null> {
  const r = await soapCall(ep, RENDERING, 'X_GetPreset', { InstanceID: 0 });
  return r.CurrentPreset || null;
}

export async function selectEqPreset(ep: UpnpEndpoint, id: string): Promise<void> {
  await soapCall(ep, RENDERING, 'SelectPreset', { InstanceID: 0, PresetName: id });
}

/** Display label for a device preset id; the firmware misspells "Acoustic". */
export const presetLabel = (id: string): string => (id === 'Accoustic' ? 'Acoustic' : id);
