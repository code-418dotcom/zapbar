import type { CliCommands, InputSource, PlayerInfo, QuickSelect } from './cli/commands';
import type { DeviceSettings } from './state/types';
import { DIALOGUE_RANGE, getAudioConfig, getTvConfig, NIGHT_RANGE } from './upnp/act';
import { getBass, getEqPreset, getSubwoofer, getTreble, listEqPresets, TONE_RANGE } from './upnp/rendering';
import { UpnpUnreachable, type UpnpEndpoint } from './upnp/soap';

export interface Range {
  min: number;
  max: number;
}

export interface Capabilities {
  inputs: InputSource[];
  quickSelects: Array<QuickSelect & { used: boolean }>;
  upnpReachable: boolean;
  tone: { bass: Range; treble: Range; subwoofer: Range | null } | null;
  eqPresets: string[];
  soundModes: string[];
  dialogue: Range | null;
  night: Range | null;
}

/**
 * Soundbars: DHT-S216/S316/S416/S517/S716H, Denon Home Sound Bar 550, HEOS Bar, HEOS HomeCinema.
 * Every HEOS device reports the same generic sound-mode list and a subwoofer level over UPnP;
 * only soundbars act on them (owner's DHT-S716H; a tester's Home 150/350, NR1200 and DRA-800H don't).
 */
export const isSoundbar = (model: string): boolean => /\bDHT-|sound ?bar|heos ?bar|home ?cinema/i.test(model);

// A slot the user never stored keeps its factory name.
const UNUSED_QUICK_SELECT = /^Quick Select \d+$/;

export async function probeCapabilities(
  cmds: CliCommands,
  ep: UpnpEndpoint,
  player: PlayerInfo,
): Promise<{ caps: Capabilities; settings: Partial<DeviceSettings> }> {
  const inputs = await cmds.getInputs(player.pid, player.name).catch(() => []);
  const quickSelects = await cmds.getQuickSelects(player.pid).catch(() => []);

  // A fault means "this model lacks the feature"; unreachable means "stop probing UPnP".
  let reachable = true;
  const attempt = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    if (!reachable) return null;
    try {
      return await fn();
    } catch (e) {
      if (e instanceof UpnpUnreachable) reachable = false;
      return null;
    }
  };

  const bass = await attempt(() => getBass(ep));
  const treble = await attempt(() => getTreble(ep));
  const subwoofer = await attempt(() => getSubwoofer(ep));
  const presetList = (await attempt(() => listEqPresets(ep))) ?? [];
  const eqPreset = presetList.length ? await attempt(() => getEqPreset(ep)) : null;
  // The DHT-S716H lists presets but SelectPreset has no effect and X_GetPreset stays empty
  // (docs/probe-results.md); only offer presets on devices that report a current one.
  const eqPresets = eqPreset ? presetList : [];
  const audio = await attempt(() => getAudioConfig(ep));
  const tv = await attempt(() => getTvConfig(ep));

  const bar = isSoundbar(player.model);
  // A soundbar's subwoofer level works even with subwooferEnable 0 (DHT-S716H, built-in sub).
  const hasSub = subwoofer !== null && (bar || audio?.subwooferEnable === 1);
  const caps: Capabilities = {
    inputs,
    quickSelects: quickSelects.map((q) => ({ ...q, used: !UNUSED_QUICK_SELECT.test(q.name) })),
    upnpReachable: reachable,
    tone:
      bass !== null && treble !== null
        ? { bass: TONE_RANGE.bass, treble: TONE_RANGE.treble, subwoofer: hasSub ? TONE_RANGE.subwoofer : null }
        : null,
    eqPresets,
    soundModes: bar && audio && audio.availableSoundModes.length > 1 ? audio.availableSoundModes : [],
    dialogue: tv?.dialogue?.supported ? DIALOGUE_RANGE : null,
    night: tv?.night?.supported ? NIGHT_RANGE : null,
  };
  const settings: Partial<DeviceSettings> = {
    bass,
    treble,
    subwoofer: hasSub ? subwoofer : null,
    eqPreset,
    soundMode: bar ? (audio?.soundMode ?? null) : null,
    dialogueLevel: tv?.dialogue?.level ?? null,
    nightLevel: tv?.night?.level ?? null,
  };
  return { caps, settings };
}
