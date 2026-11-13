import { ACT, soapCall, type UpnpEndpoint } from './soap';
import { child, numOrNull, parseXml, textOf, xmlEscape } from './xml';

export interface AudioConfig {
  soundMode: string | null;
  availableSoundModes: string[];
  bassBoost: number | null;
  /** 1 when a subwoofer is enabled; null when the firmware doesn't say. */
  subwooferEnable: number | null;
  rawXml: string;
}

export interface LevelSetting {
  level: number;
  supported: boolean;
}

export interface TvConfig {
  dialogue: LevelSetting | null;
  night: LevelSetting | null;
  audioDelay: number | null;
  rawXml: string;
}

// ACT out-args are XML documents embedded as text; some firmware wraps the root twice.
function innerConfig(xml: string, root: string): Record<string, unknown> {
  if (!xml.trim()) return {};
  let node: unknown = parseXml(xml)[root];
  const nested = child(node, root);
  if (nested && typeof nested === 'object') node = nested;
  return node && typeof node === 'object' ? (node as Record<string, unknown>) : {};
}

// Mixed content: <dialogueEnhance>2<level>2</level><enabled>1</enabled></dialogueEnhance>.
// The <level> child wins over the leading text; <enabled>0 marks the feature unsupported.
function levelSetting(n: unknown): LevelSetting | null {
  if (n === undefined) return null;
  const level = numOrNull(textOf(child(n, 'level')) || textOf(n));
  if (level === null) return null;
  return { level, supported: textOf(child(n, 'enabled')) !== '0' };
}

export function parseAudioConfig(xml: string): AudioConfig {
  const c = innerConfig(xml, 'AudioConfig');
  return {
    soundMode: textOf(c.soundMode) || null,
    availableSoundModes: textOf(c.availableSoundModes).split(',').map((s) => s.trim()).filter(Boolean),
    bassBoost: numOrNull(textOf(c.bassBoost)),
    subwooferEnable: numOrNull(textOf(c.subwooferEnable)),
    rawXml: xml,
  };
}

export function parseTvConfig(xml: string): TvConfig {
  const c = innerConfig(xml, 'TvConfig');
  return {
    dialogue: levelSetting(c.dialogueEnhance),
    night: levelSetting(c.nightMode),
    audioDelay: numOrNull(textOf(c.audioDelay)),
    rawXml: xml,
  };
}

export async function getAudioConfig(ep: UpnpEndpoint): Promise<AudioConfig> {
  const r = await soapCall(ep, ACT, 'GetAudioConfig');
  return parseAudioConfig(r.AudioConfig ?? '');
}

export async function getTvConfig(ep: UpnpEndpoint): Promise<TvConfig> {
  const r = await soapCall(ep, ACT, 'GetTvConfig');
  return parseTvConfig(r.TvConfig ?? '');
}

export interface AudioPatch {
  soundMode?: string;
  bassBoost?: number;
}

export interface TvPatch {
  dialogueLevel?: number;
  nightLevel?: number;
  audioDelay?: number;
}

// Probe-confirmed (docs/probe-results.md → Decisions): partial writes apply without ApplyChanges.
// Dialogue is Off/Low/Medium/High; the device stores 0-5 but only 0-3 are real levels.
export const DIALOGUE_RANGE = { min: 0, max: 3 };
export const NIGHT_RANGE = { min: 0, max: 1 };

export function audioPatchXml(p: AudioPatch): string {
  const f: string[] = [];
  if (p.soundMode !== undefined) f.push(`<soundMode>${xmlEscape(p.soundMode)}</soundMode>`);
  if (p.bassBoost !== undefined) f.push(`<bassBoost>${Math.round(p.bassBoost)}</bassBoost>`);
  return `<AudioConfig>${f.join('')}</AudioConfig>`;
}

export function tvPatchXml(p: TvPatch): string {
  const f: string[] = [];
  if (p.dialogueLevel !== undefined) f.push(`<dialogueEnhance><level>${Math.round(p.dialogueLevel)}</level></dialogueEnhance>`);
  if (p.nightLevel !== undefined) f.push(`<nightMode><level>${Math.round(p.nightLevel)}</level></nightMode>`);
  if (p.audioDelay !== undefined) f.push(`<audioDelay>${Math.round(p.audioDelay)}</audioDelay>`);
  return `<TvConfig>${f.join('')}</TvConfig>`;
}

export async function setAudioConfig(ep: UpnpEndpoint, p: AudioPatch): Promise<void> {
  await soapCall(ep, ACT, 'SetAudioConfig', { AudioConfig: audioPatchXml(p) });
}

export async function setTvConfig(ep: UpnpEndpoint, p: TvPatch): Promise<void> {
  await soapCall(ep, ACT, 'SetTvConfig', { TvConfig: tvPatchXml(p) });
}
