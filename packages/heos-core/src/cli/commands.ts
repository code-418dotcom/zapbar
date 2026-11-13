import { clamp } from '../util';
import type { HeosCliClient } from './client';

export interface PlayerInfo {
  pid: number;
  name: string;
  model: string;
  version: string;
  ip: string;
  network: string;
  serial?: string;
}

export interface InputSource {
  mid: string;
  name: string;
}

export interface NowPlayingRaw {
  type: string;
  song: string;
  artist: string;
  album: string;
  image_url: string;
  mid: string;
  sid: number;
  station?: string;
}

export interface QuickSelect {
  id: number;
  name: string;
}

export type PlayState = 'play' | 'pause' | 'stop';

export interface GroupInfo {
  /** HEOS uses the leader's pid as the group id. */
  gid: number;
  name: string;
  players: Array<{ pid: number; name: string; role: 'leader' | 'member' }>;
}

export interface CliCommands {
  heartbeat(): Promise<void>;
  registerForChangeEvents(on: boolean): Promise<void>;
  getPlayers(): Promise<PlayerInfo[]>;
  getVolume(pid: number): Promise<number>;
  setVolume(pid: number, level: number): Promise<void>;
  getMute(pid: number): Promise<boolean>;
  setMute(pid: number, on: boolean): Promise<void>;
  getPlayState(pid: number): Promise<PlayState>;
  setPlayState(pid: number, state: PlayState): Promise<void>;
  playNext(pid: number): Promise<void>;
  playPrevious(pid: number): Promise<void>;
  getNowPlaying(pid: number): Promise<NowPlayingRaw | null>;
  getInputs(pid: number, playerName: string): Promise<InputSource[]>;
  /** `spid` plays an input that lives on another player (a grouped member's HDMI on the leader). */
  playInput(pid: number, mid: string, spid?: number): Promise<void>;
  getQuickSelects(pid: number): Promise<QuickSelect[]>;
  playQuickSelect(pid: number, id: number): Promise<void>;
  getGroups(): Promise<GroupInfo[]>;
  /** First pid leads. One pid alone dissolves the group that pid leads. */
  setGroup(pids: number[]): Promise<void>;
  getGroupVolume(gid: number): Promise<number>;
  setGroupVolume(gid: number, level: number): Promise<void>;
  getGroupMute(gid: number): Promise<boolean>;
  setGroupMute(gid: number, on: boolean): Promise<void>;
}

export const deviceKey = (p: { pid: number; serial?: string }): string => (p.serial ? p.serial : `pid:${p.pid}`);

type Obj = Record<string, unknown>;
const list = (payload: unknown): Obj[] => (Array.isArray(payload) ? (payload.filter((x) => x && typeof x === 'object') as Obj[]) : []);
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

export function createCliCommands(c: HeosCliClient): CliCommands {
  const ok = async (cmd: string, params?: Record<string, string | number>) => {
    await c.send(cmd, params);
  };
  return {
    heartbeat: () => ok('system/heart_beat'),
    registerForChangeEvents: (on) => ok('system/register_for_change_events', { enable: on ? 'on' : 'off' }),
    async getPlayers() {
      const r = await c.send('player/get_players');
      return list(r.payload).map((p) => ({
        pid: Number(p.pid),
        name: str(p.name),
        model: str(p.model),
        version: str(p.version),
        ip: str(p.ip),
        network: str(p.network),
        ...(p.serial ? { serial: str(p.serial) } : {}),
      }));
    },
    async getVolume(pid) {
      const r = await c.send('player/get_volume', { pid });
      return Number(r.message.level ?? 0);
    },
    setVolume: (pid, level) => ok('player/set_volume', { pid, level: clamp(Math.round(level), 0, 100) }),
    async getMute(pid) {
      const r = await c.send('player/get_mute', { pid });
      return r.message.state === 'on';
    },
    setMute: (pid, on) => ok('player/set_mute', { pid, state: on ? 'on' : 'off' }),
    async getPlayState(pid) {
      const r = await c.send('player/get_play_state', { pid });
      const s = r.message.state;
      return s === 'play' || s === 'pause' ? s : 'stop';
    },
    setPlayState: (pid, state) => ok('player/set_play_state', { pid, state }),
    playNext: (pid) => ok('player/play_next', { pid }),
    playPrevious: (pid) => ok('player/play_previous', { pid }),
    async getNowPlaying(pid) {
      const r = await c.send('player/get_now_playing_media', { pid });
      const p = r.payload;
      if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
      const o = p as Obj;
      return {
        type: str(o.type),
        song: str(o.song),
        artist: str(o.artist),
        album: str(o.album),
        image_url: str(o.image_url),
        mid: str(o.mid),
        sid: Number(o.sid ?? 0),
        ...(o.station ? { station: str(o.station) } : {}),
      };
    },
    async getInputs(pid, playerName) {
      const r = await c.send('browse/browse', { sid: pid });
      const prefix = `${playerName} - `;
      return list(r.payload)
        .filter((i) => str(i.mid).startsWith('inputs/'))
        .map((i) => {
          const name = str(i.name) || str(i.mid);
          return { mid: str(i.mid), name: name.startsWith(prefix) ? name.slice(prefix.length) : name };
        });
    },
    playInput: (pid, mid, spid) => ok('browse/play_input', spid !== undefined && spid !== pid ? { pid, spid, input: mid } : { pid, input: mid }),
    async getQuickSelects(pid) {
      const r = await c.send('player/get_quickselects', { pid });
      return list(r.payload).map((q) => ({ id: Number(q.id), name: str(q.name) }));
    },
    playQuickSelect: (pid, id) => ok('player/play_quickselect', { pid, id }),
    async getGroups() {
      const r = await c.send('group/get_groups');
      return list(r.payload).map((g) => ({
        gid: Number(g.gid),
        name: str(g.name),
        players: list(g.players).map((p) => ({ pid: Number(p.pid), name: str(p.name), role: p.role === 'leader' ? 'leader' as const : 'member' as const })),
      }));
    },
    setGroup: (pids) => ok('group/set_group', { pid: pids.join(',') }),
    async getGroupVolume(gid) {
      const r = await c.send('group/get_volume', { gid });
      return Number(r.message.level ?? 0);
    },
    setGroupVolume: (gid, level) => ok('group/set_volume', { gid, level: clamp(Math.round(level), 0, 100) }),
    async getGroupMute(gid) {
      const r = await c.send('group/get_mute', { gid });
      return r.message.state === 'on';
    },
    setGroupMute: (gid, on) => ok('group/set_mute', { gid, state: on ? 'on' : 'off' }),
  };
}
