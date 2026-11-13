import { useTheme } from '../theme';

export type CopyKey = 'pickInput' | 'reconnecting' | 'offLan' | 'volume' | 'mute' | 'unmute' | 'soundbars';

const COPY: Record<CopyKey, { plain: string; pirate: string }> = {
  pickInput: { plain: 'Pick an input below', pirate: 'Pick yer port below' },
  reconnecting: { plain: 'Reconnecting…', pirate: 'Hoisting the anchor…' },
  offLan: { plain: 'Connect to your home Wi-Fi', pirate: 'Sail back to home waters (Wi-Fi)' },
  volume: { plain: 'Volume', pirate: 'Hoist the volume' },
  mute: { plain: 'Mute', pirate: 'Silence the parrot' },
  unmute: { plain: 'Unmute', pirate: 'Free the parrot' },
  soundbars: { plain: 'Soundbars', pirate: 'Ships' },
};

export const copy = (key: CopyKey, pirate: boolean): string => COPY[key][pirate ? 'pirate' : 'plain'];

/** Copy for the current appearance; the context is already gated to supporters. */
export function useCopy(): (key: CopyKey) => string {
  const { pirate } = useTheme().appearance;
  return (key) => copy(key, pirate);
}
