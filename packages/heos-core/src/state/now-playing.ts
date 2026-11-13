import type { NowPlayingRaw } from '../cli/commands';
import type { DeviceSettings } from './types';

// HEOS source ids (sid) as reported by browse/get_music_sources.
const SOURCE_NAMES: Record<number, string> = {
  1: 'Pandora', 3: 'TuneIn', 4: 'Spotify', 5: 'Deezer', 9: 'SoundCloud', 10: 'Tidal', 13: 'Amazon Music', 30: 'Qobuz', 1024: 'Local Music',
};

/** Inputs light an input tile; anything else is a stream shown in the now-playing strip. */
export function toPlayback(raw: NowPlayingRaw | null): Pick<DeviceSettings, 'activeInput' | 'nowPlaying'> {
  if (!raw || (!raw.mid && !raw.song)) return { activeInput: null, nowPlaying: null };
  if (raw.mid.startsWith('inputs/')) return { activeInput: raw.mid, nowPlaying: null };
  return {
    activeInput: null,
    nowPlaying: {
      sourceId: raw.sid,
      sourceName: SOURCE_NAMES[raw.sid] ?? 'Stream',
      title: raw.song,
      artist: raw.artist,
      album: raw.album,
      artUrl: raw.image_url || null,
    },
  };
}
