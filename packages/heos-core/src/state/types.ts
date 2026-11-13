import type { Capabilities } from '../capabilities';
import type { PlayState } from '../cli/commands';

export type ConnectionStatus = 'connecting' | 'probing' | 'ready' | 'degraded' | 'offline';

export interface NowPlaying {
  sourceId: number;
  sourceName: string;
  title: string;
  artist: string;
  album: string;
  artUrl: string | null;
}

export interface DeviceSettings {
  volume: number;
  mute: boolean;
  playState: PlayState;
  activeInput: string | null;
  nowPlaying: NowPlaying | null;
  bass: number | null;
  treble: number | null;
  subwoofer: number | null;
  eqPreset: string | null;
  soundMode: string | null;
  dialogueLevel: number | null;
  nightLevel: number | null;
}

export interface DeviceError {
  id: number;
  text: string;
}

/** Another HEOS player this bar can see on the network. */
export interface PlayerSummary {
  pid: number;
  name: string;
  model: string;
}

export interface GroupMember {
  pid: number;
  name: string;
  role: 'leader' | 'member';
  /** This speaker's own level; null until read. */
  volume: number | null;
  mute: boolean;
}

/** The HEOS group this bar plays in. While grouped, settings.volume and settings.mute are the group's. */
export interface GroupState {
  gid: number;
  name: string;
  leaderPid: number;
  members: GroupMember[];
}

export interface DeviceState {
  key: string;
  pid: number | null;
  name: string;
  model: string;
  ip: string;
  status: ConnectionStatus;
  caps: Capabilities | null;
  settings: DeviceSettings;
  lastError: DeviceError | null;
  /** Every HEOS player on the network, this bar included (empty until connected). */
  players: PlayerSummary[];
  group: GroupState | null;
}

/** A group of players. v1 creates exactly one single-member zone per device. */
export interface Zone {
  id: string;
  name: string;
  memberKeys: string[];
}

/** v2 hook for Subsonic playback; v1 ships the interface only. */
export interface PlaybackTarget {
  playUrl(zoneId: string, url: string, meta: { title: string; artist?: string; artUrl?: string }): Promise<void>;
}

export const EMPTY_SETTINGS: DeviceSettings = {
  volume: 0,
  mute: false,
  playState: 'stop',
  activeInput: null,
  nowPlaying: null,
  bass: null,
  treble: null,
  subwoofer: null,
  eqPreset: null,
  soundMode: null,
  dialogueLevel: null,
  nightLevel: null,
};
