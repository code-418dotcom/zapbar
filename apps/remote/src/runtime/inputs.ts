import type { InputSource } from '@zapbar/heos-core';
import type { InputPref, InputPrefs } from './memory';

// MaterialCommunityIcons names.
export const ICONS = {
  tv: 'television',
  decoder: 'television-box',
  playstation: 'sony-playstation',
  xbox: 'microsoft-xbox',
  switch: 'nintendo-switch',
  appletv: 'apple',
  chromecast: 'cast',
  firetv: 'fire',
  steam: 'steam',
  pc: 'desktop-tower-monitor',
  bluray: 'disc-player',
  gamepad: 'gamepad-variant',
  hdmi: 'video-input-hdmi',
  audio: 'audio-input-stereo-minijack',
} as const;
export type IconId = keyof typeof ICONS;

export interface ArrangedInput {
  mid: string;
  label: string;
  icon: IconId;
  hidden: boolean;
}

const isArc = (mid: string) => mid.startsWith('inputs/hdmi_arc');
const isHdmi = (mid: string) => mid.startsWith('inputs/hdmi');

export const defaultIcon = (mid: string): IconId => (isArc(mid) ? 'tv' : isHdmi(mid) ? 'hdmi' : 'audio');
export const defaultLabel = (input: InputSource, pirate = false): string => (isArc(input.mid) ? (pirate ? 'Arrr-C' : 'TV') : input.name);

export function arrangeInputs(inputs: InputSource[], prefs: InputPrefs, opts: { pirate?: boolean } = {}): { all: ArrangedInput[]; visible: ArrangedInput[]; hidden: ArrangedInput[] } {
  const rows = inputs.map((input, index) => {
    const p = prefs[input.mid] ?? {};
    return {
      mid: input.mid,
      label: p.label?.trim() || defaultLabel(input, opts.pirate),
      icon: p.icon && p.icon in ICONS ? p.icon : defaultIcon(input.mid),
      hidden: p.hidden ?? false,
      order: p.order ?? index,
      explicit: p.order !== undefined,
    };
  });
  // A stored order beats a default position it ties with.
  rows.sort((a, b) => a.order - b.order || Number(b.explicit) - Number(a.explicit));
  const all: ArrangedInput[] = rows.map(({ order: _order, explicit: _explicit, ...r }) => r);
  return { all, visible: all.filter((r) => !r.hidden), hidden: all.filter((r) => r.hidden) };
}

export function moveInput(mids: string[], mid: string, delta: -1 | 1): string[] {
  const i = mids.indexOf(mid);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= mids.length) return mids;
  const next = [...mids];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export const SETUP_CHOICES = [
  { id: 'tv', label: 'TV', icon: 'tv' },
  { id: 'decoder', label: 'TV decoder', icon: 'decoder' },
  { id: 'playstation', label: 'PS5', icon: 'playstation' },
  { id: 'ps4', label: 'PS4', icon: 'playstation' },
  { id: 'xbox', label: 'Xbox Series X|S', icon: 'xbox' },
  { id: 'xboxone', label: 'Xbox One', icon: 'xbox' },
  { id: 'switch2', label: 'Switch 2', icon: 'switch' },
  { id: 'switch', label: 'Switch', icon: 'switch' },
  { id: 'steamdeck', label: 'Steam Deck', icon: 'steam' },
  { id: 'pc', label: 'PC', icon: 'pc' },
  { id: 'appletv', label: 'Apple TV', icon: 'appletv' },
  { id: 'chromecast', label: 'Chromecast', icon: 'chromecast' },
  { id: 'firetv', label: 'Fire TV', icon: 'firetv' },
  { id: 'bluray', label: 'Blu-ray', icon: 'bluray' },
  { id: 'other', label: 'Other', icon: 'hdmi' },
  { id: 'unused', label: 'Not used', icon: 'hdmi' },
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: IconId }>;
export type ChoiceId = (typeof SETUP_CHOICES)[number]['id'];

export const labelQueue = (inputs: InputSource[]) => inputs.filter((i) => isHdmi(i.mid));
export const extraInputs = (inputs: InputSource[]) => inputs.filter((i) => !isHdmi(i.mid));

export const questionFor = (input: InputSource): string =>
  isArc(input.mid) ? `Is your TV connected to ${input.name} (ARC)?` : `What's on ${input.name}?`;

export const choicesFor = (input: InputSource) =>
  SETUP_CHOICES.filter((c) => (isArc(input.mid) ? c.id === 'tv' || c.id === 'unused' : c.id !== 'tv'));

export function prefFromChoice(id: ChoiceId): InputPref {
  if (id === 'unused') return { hidden: true };
  if (id === 'other') return { icon: 'hdmi', hidden: false };
  const c = SETUP_CHOICES.find((x) => x.id === id)!;
  return { label: c.label, icon: c.icon, hidden: false };
}
