import { EMPTY_SETTINGS, type Capabilities, type DeviceSettings, type DeviceState, type GroupState, type NowPlaying } from '@zapbar/heos-core';

export const CAPS: Capabilities = {
  inputs: [
    { mid: 'inputs/hdmi_arc_1', name: 'HDMI OUT' },
    { mid: 'inputs/hdmi_in_1', name: 'HDMI 1' },
    { mid: 'inputs/hdmi_in_2', name: 'HDMI 2' },
    { mid: 'inputs/optical_in_1', name: 'Optical In' },
  ],
  quickSelects: [
    { id: 1, name: 'Watch TV', used: true },
    { id: 2, name: 'Quick Select 2', used: false },
  ],
  upnpReachable: true,
  tone: { bass: { min: 0, max: 10 }, treble: { min: 0, max: 10 }, subwoofer: { min: 0, max: 30 } },
  eqPresets: [],
  soundModes: ['MUSIC_NORMAL', 'MOVIE_NORMAL'],
  dialogue: { min: 0, max: 3 },
  night: { min: 0, max: 1 },
};

export const SPOTIFY: NowPlaying = { sourceId: 4, sourceName: 'Spotify', title: 'Golden', artist: 'Some Artist', album: 'Album', artUrl: 'https://i.scdn.co/image/x' };

export function deviceState(over: Partial<DeviceState> = {}, settings: Partial<DeviceSettings> = {}): DeviceState {
  return {
    key: 'TESTSERIAL0001',
    pid: 7331878,
    name: 'Loving room',
    model: 'Denon DHT-S716H',
    ip: '10.0.0.82',
    status: 'ready',
    caps: CAPS,
    lastError: null,
    players: [],
    group: null,
    ...over,
    settings: {
      ...EMPTY_SETTINGS,
      volume: 35,
      activeInput: 'inputs/hdmi_in_1',
      bass: 5,
      treble: 5,
      subwoofer: 15,
      soundMode: 'MOVIE_NORMAL',
      dialogueLevel: 2,
      nightLevel: 0,
      ...settings,
    },
  };
}

export const PLAYERS = [
  { pid: 7331878, name: 'Loving room', model: 'Denon DHT-S716H' },
  { pid: 101, name: 'Kitchen', model: 'Denon Home 150' },
  { pid: 202, name: 'Patio', model: 'Denon Home 250' },
];

export const GROUP: GroupState = {
  gid: 7331878,
  name: 'Loving room + Kitchen',
  leaderPid: 7331878,
  members: [
    { pid: 7331878, name: 'Loving room', role: 'leader', volume: 40, mute: false },
    { pid: 101, name: 'Kitchen', role: 'member', volume: 22, mute: false },
  ],
};
