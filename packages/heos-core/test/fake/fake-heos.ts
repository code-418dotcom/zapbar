import http from 'node:http';
import net from 'node:net';
import { encodeValue, parseMessage } from '../../src/cli/message';

export interface FakeState {
  pid: number;
  name: string;
  model: string;
  serial: string;
  volume: number;
  mute: boolean;
  playState: 'play' | 'pause' | 'stop';
  nowPlayingMid: string;
  bass: number;
  treble: number;
  subwoofer: number;
  preset: string;
  soundMode: string;
  bassBoost: number;
  dialogueLevel: number;
  nightLevel: number;
  /** AudioConfig subwooferEnable: 1 when a subwoofer is paired/enabled. */
  subwooferEnable: number;
  /** GroupControl GetGroupFriendlyName: the stereo-pair name, '' when not bonded. */
  pairName: string;
}

/** Another HEOS speaker on the same network, reachable through the bar's connection. */
export interface FakePeer {
  pid: number;
  name: string;
  model: string;
  volume: number;
  mute: boolean;
}

export interface FakeGroup {
  /** Leader first; gid = leader pid. */
  pids: number[];
  volume: number;
  mute: boolean;
}

export const FAKE_INPUTS: Array<[string, string]> = [
  ['inputs/hdmi_arc_1', 'HDMI OUT'],
  ['inputs/hdmi_in_1', 'HDMI 1'],
  ['inputs/hdmi_in_2', 'HDMI 2'],
  ['inputs/hdmi_in_3', 'HDMI 3'],
  ['inputs/hdmi_in_4', 'HDMI 4'],
  ['inputs/optical_in_1', 'Optical In'],
  ['inputs/coax_in_1', 'Coaxial In'],
  ['inputs/aux_in_1', 'AUX In'],
];

const DEFAULTS: FakeState = {
  pid: 7331878, name: 'Loving room', model: 'Denon DHT-S716H', serial: 'TESTSERIAL0001',
  volume: 49, mute: false, playState: 'play', nowPlayingMid: 'inputs/hdmi_in_1',
  bass: 5, treble: 5, subwoofer: 15, preset: '', soundMode: 'MOVIE_NORMAL', bassBoost: 0,
  dialogueLevel: 2, nightLevel: 0, subwooferEnable: 0, pairName: '',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];
// Accepts <x>3</x>, <x><level>3</level></x> and <x>3<level>3</level>…</x>; the <level> child wins.
const levelTag = (xml: string, name: string): number | null => {
  const m = xml.match(new RegExp(`<${name}>(\\d*)(?:<level>(\\d+)</level>)?`));
  if (!m) return null;
  const v = m[2] ?? m[1];
  return v ? Number(v) : null;
};

export class FakeHeos {
  state: FakeState;
  peers: FakePeer[] = [];
  groups: FakeGroup[] = [];
  received: string[] = [];
  silenced = new Set<string>();
  faultActions = new Set<string>();
  upnpDown = false;
  /** Per-action SOAP reply delay in ms. */
  soapDelay = new Map<string, number>();
  soapReceived: string[] = [];
  connections = 0;
  cliPort = 0;
  httpPort = 0;
  private failures = new Map<string, { eid: string; text: string }>();
  private clients = new Set<net.Socket>();
  private cli: net.Server;
  private web: http.Server;

  private constructor(over: Partial<FakeState>) {
    this.state = { ...DEFAULTS, ...over };
    this.cli = net.createServer((s) => this.onClient(s));
    this.web = http.createServer((req, res) => this.onSoap(req, res));
  }

  static async start(over: Partial<FakeState> = {}): Promise<FakeHeos> {
    const f = new FakeHeos(over);
    await new Promise<void>((r) => f.cli.listen(0, '127.0.0.1', () => r()));
    await new Promise<void>((r) => f.web.listen(0, '127.0.0.1', () => r()));
    f.cliPort = (f.cli.address() as net.AddressInfo).port;
    f.httpPort = (f.web.address() as net.AddressInfo).port;
    return f;
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.httpPort}`;
  }

  failNext(command: string, eid: string, text: string): void {
    this.failures.set(command, { eid, text });
  }

  count(command: string): number {
    return this.received.filter((l) => l.startsWith(`heos://${command}`)).length;
  }

  emit(event: string, msg: Record<string, string | number>): void {
    const message = Object.entries(msg).map(([k, v]) => `${k}=${encodeValue(String(v))}`).join('&');
    const line = JSON.stringify({ heos: { command: `event/${event}`, message } }) + '\r\n';
    this.clients.forEach((s) => s.write(line));
  }

  get openConnections(): number {
    return this.clients.size;
  }

  dropConnections(): void {
    this.clients.forEach((s) => s.destroy());
    this.clients.clear();
  }

  async stop(): Promise<void> {
    this.dropConnections();
    this.web.closeAllConnections();
    await new Promise<void>((r) => this.cli.close(() => r()));
    await new Promise<void>((r) => this.web.close(() => r()));
  }

  private onClient(sock: net.Socket): void {
    this.connections++;
    this.clients.add(sock);
    sock.setEncoding('utf8');
    let buf = '';
    sock.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        this.handleCli(sock, line);
      }
    });
    sock.on('close', () => this.clients.delete(sock));
    sock.on('error', () => this.clients.delete(sock));
  }

  private reply(sock: net.Socket, command: string, result: string, message: string, payload?: unknown): void {
    sock.write(JSON.stringify({ heos: { command, result, message }, ...(payload !== undefined ? { payload } : {}) }) + '\r\n');
  }

  private nameOf(pid: number): string {
    return pid === this.state.pid ? this.state.name : this.peers.find((p) => p.pid === pid)?.name ?? String(pid);
  }

  private nowPlaying(): Record<string, unknown> {
    const s = this.state;
    const input = FAKE_INPUTS.find(([mid]) => mid === s.nowPlayingMid);
    if (input) {
      const name = `${s.name} - ${input[1]}`;
      return { type: 'station', song: name, station: name, album: '', artist: '', image_url: '', album_id: 'inputs/', mid: s.nowPlayingMid, qid: 1, sid: 1027 };
    }
    return { type: 'song', song: 'Fake Song', album: 'Fake Album', artist: 'Fake Artist', image_url: 'https://i.scdn.co/image/fake', mid: s.nowPlayingMid, qid: 1, sid: 4 };
  }

  private handleCli(sock: net.Socket, line: string): void {
    this.received.push(line);
    const m = line.match(/^heos:\/\/([^?]+)\??(.*)$/);
    if (!m) return;
    const command = m[1]!;
    const q = parseMessage(m[2] ?? '');
    if (this.silenced.has(command)) return;
    const failure = this.failures.get(command);
    if (failure) {
      this.failures.delete(command);
      return this.reply(sock, command, 'fail', `eid=${failure.eid}&text=${encodeValue(failure.text)}`);
    }
    const s = this.state;
    const pid = s.pid;
    const volumeEvent = () => this.emit('player_volume_changed', { pid, level: s.volume, mute: s.mute ? 'on' : 'off' });
    const peer = q.pid !== undefined && Number(q.pid) !== pid ? this.peers.find((p) => p.pid === Number(q.pid)) : undefined;
    if (peer && (command === 'player/get_volume' || command === 'player/set_volume' || command === 'player/get_mute')) {
      if (command === 'player/set_volume') {
        peer.volume = Number(q.level);
        this.reply(sock, command, 'success', `pid=${peer.pid}&level=${peer.volume}`);
        return this.emit('player_volume_changed', { pid: peer.pid, level: peer.volume, mute: peer.mute ? 'on' : 'off' });
      }
      if (command === 'player/get_mute') return this.reply(sock, command, 'success', `pid=${peer.pid}&state=${peer.mute ? 'on' : 'off'}`);
      return this.reply(sock, command, 'success', `pid=${peer.pid}&level=${peer.volume}`);
    }
    const group = (gid: unknown) => this.groups.find((g) => g.pids[0] === Number(gid));
    switch (command) {
      case 'group/get_groups':
        return this.reply(sock, command, 'success', '', this.groups.map((g) => ({
          name: g.pids.map((x) => this.nameOf(x)).join(' + '),
          gid: String(g.pids[0]),
          players: g.pids.map((x, i) => ({ name: this.nameOf(x), pid: String(x), role: i === 0 ? 'leader' : 'member' })),
        })));
      case 'group/set_group': {
        const pids = String(q.pid ?? '').split(',').map(Number).filter((x) => x === pid || this.peers.some((p) => p.pid === x));
        if (!pids.length) return this.reply(sock, command, 'fail', 'eid=2&text=Invalid pid');
        if (pids.length === 1) {
          this.groups = this.groups.filter((g) => g.pids[0] !== pids[0]);
          this.reply(sock, command, 'success', `pid=${pids[0]}`);
        } else {
          const prev = this.groups.find((g) => g.pids[0] === pids[0]);
          if (!prev && this.groups.some((g) => g.pids.includes(pids[0]!))) return this.reply(sock, command, 'fail', 'eid=9&text=Leader is a member elsewhere');
          this.groups = this.groups.filter((g) => g !== prev).map((g) => ({ ...g, pids: g.pids.filter((x) => !pids.includes(x)) })).filter((g) => g.pids.length > 1);
          this.groups.push({ pids, volume: prev?.volume ?? s.volume, mute: prev?.mute ?? false });
          this.reply(sock, command, 'success', `gid=${pids[0]}&name=${encodeValue(pids.map((x) => this.nameOf(x)).join(' + '))}&pid=${pids.join(',')}`);
        }
        return this.emit('groups_changed', {});
      }
      case 'group/get_volume': {
        const g = group(q.gid);
        return g ? this.reply(sock, command, 'success', `gid=${q.gid}&level=${g.volume}`) : this.reply(sock, command, 'fail', 'eid=2&text=Invalid gid');
      }
      case 'group/set_volume': {
        const g = group(q.gid);
        if (!g) return this.reply(sock, command, 'fail', 'eid=2&text=Invalid gid');
        g.volume = Number(q.level);
        this.reply(sock, command, 'success', `gid=${q.gid}&level=${g.volume}`);
        return this.emit('group_volume_changed', { gid: g.pids[0]!, level: g.volume, mute: g.mute ? 'on' : 'off' });
      }
      case 'group/get_mute': {
        const g = group(q.gid);
        return g ? this.reply(sock, command, 'success', `gid=${q.gid}&state=${g.mute ? 'on' : 'off'}`) : this.reply(sock, command, 'fail', 'eid=2&text=Invalid gid');
      }
      case 'group/set_mute': {
        const g = group(q.gid);
        if (!g) return this.reply(sock, command, 'fail', 'eid=2&text=Invalid gid');
        g.mute = q.state === 'on';
        this.reply(sock, command, 'success', `gid=${q.gid}&state=${q.state}`);
        return this.emit('group_volume_changed', { gid: g.pids[0]!, level: g.volume, mute: g.mute ? 'on' : 'off' });
      }
      case 'system/heart_beat':
        return this.reply(sock, command, 'success', '');
      case 'system/register_for_change_events':
        return this.reply(sock, command, 'success', `enable=${q.enable ?? ''}`);
      case 'player/get_players':
        return this.reply(sock, command, 'success', '', [
          { name: s.name, pid, model: s.model, version: '3.139.170', ip: '127.0.0.1', network: 'wired', lineout: 0, serial: s.serial },
          ...this.peers.map((p) => ({ name: p.name, pid: p.pid, model: p.model, version: '3.139.170', ip: '127.0.0.2', network: 'wifi', lineout: 0 })),
        ]);
      case 'player/get_volume':
        return this.reply(sock, command, 'success', `pid=${pid}&level=${s.volume}`);
      case 'player/set_volume':
        s.volume = Number(q.level);
        this.reply(sock, command, 'success', `pid=${pid}&level=${s.volume}`);
        return volumeEvent();
      case 'player/get_mute':
        return this.reply(sock, command, 'success', `pid=${pid}&state=${s.mute ? 'on' : 'off'}`);
      case 'player/set_mute':
        s.mute = q.state === 'on';
        this.reply(sock, command, 'success', `pid=${pid}&state=${q.state}`);
        return volumeEvent();
      case 'player/get_play_state':
        return this.reply(sock, command, 'success', `pid=${pid}&state=${s.playState}`);
      case 'player/set_play_state':
        if (Number(q.pid) !== pid) return this.reply(sock, command, 'success', `pid=${q.pid}&state=${q.state}`);
        s.playState = (q.state as FakeState['playState']) ?? 'stop';
        this.reply(sock, command, 'success', `pid=${pid}&state=${s.playState}`);
        return this.emit('player_state_changed', { pid, state: s.playState });
      case 'player/play_next':
      case 'player/play_previous':
        return this.reply(sock, command, 'success', `pid=${pid}`);
      case 'player/get_now_playing_media':
        return this.reply(sock, command, 'success', `pid=${pid}`, this.nowPlaying());
      case 'browse/browse':
        return this.reply(sock, command, 'success', `sid=${q.sid}&returned=8&count=8`,
          FAKE_INPUTS.map(([mid, label]) => ({ container: 'no', mid, type: 'station', playable: 'yes', name: `${s.name} - ${label}`, image_url: '' })));
      case 'browse/play_input':
        this.reply(sock, command, 'success', `command under process&pid=${pid}&input=${q.input}`);
        s.nowPlayingMid = q.input ?? '';
        this.reply(sock, command, 'success', `pid=${pid}&input=${q.input}`);
        return this.emit('player_now_playing_changed', { pid });
      case 'player/get_quickselects':
        return this.reply(sock, command, 'success', `pid=${pid}`, [
          { id: 1, name: 'Watch TV' }, { id: 2, name: 'Quick Select 2' }, { id: 3, name: 'Quick Select 3' },
          { id: 4, name: 'Quick Select 4' }, { id: 5, name: 'Quick Select 5' }, { id: 6, name: 'Quick Select 6' },
        ]);
      case 'player/play_quickselect':
        return this.reply(sock, command, 'success', `pid=${pid}&id=${q.id}`);
      default:
        return this.reply(sock, command, 'fail', 'eid=1&text=Unrecognized Command');
    }
  }

  private audioXml(): string {
    const s = this.state;
    return `<AudioConfig><highpass>0</highpass><lowpass>80</lowpass><subwooferEnable>${s.subwooferEnable}</subwooferEnable><outputMode>STEREO</outputMode><ampBridged>0</ampBridged><soundMode>${s.soundMode}</soundMode><impedance></impedance><ampPower>1</ampPower><availableSoundModes>MUSIC_NORMAL,MOVIE_NORMAL</availableSoundModes><sourceDirect>0</sourceDirect><bassBoost>${s.bassBoost}</bassBoost><speakerOption></speakerOption><toneControlOption></toneControlOption><tilt>0</tilt><phase>0</phase></AudioConfig>`;
  }

  private tvXml(): string {
    const { dialogueLevel: d, nightLevel: n } = this.state;
    return `<TvConfig><input>HDMI-ARC</input><hdmiConnection>ARC</hdmiConnection><dialogueEnhance>${d}<level>${d}</level><enabled>1</enabled></dialogueEnhance><nightMode>${n}<level>${n}</level><enabled>1</enabled></nightMode><audioDelay>0</audioDelay><syncMode>VIDEO</syncMode><irCodeHdmi1>1</irCodeHdmi1></TvConfig>`;
  }

  private onSoap(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => (body += c));
    req.on('end', () => {
      const act = String(req.headers['soapaction'] ?? '').replace(/"/g, '').split('#')[1] ?? '';
      this.soapReceived.push(act);
      const delay = this.soapDelay.get(act) ?? 0;
      if (delay) setTimeout(() => this.answerSoap(req, res, body), delay);
      else this.answerSoap(req, res, body);
    });
  }

  private answerSoap(req: http.IncomingMessage, res: http.ServerResponse, body: string): void {
    {
      if (this.upnpDown) {
        res.writeHead(503);
        res.end('unavailable');
        return;
      }
      const action = String(req.headers['soapaction'] ?? '').replace(/"/g, '').split('#')[1] ?? '';
      const arg = (name: string) => unesc(body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? '');
      const ok = (inner: string) => {
        res.writeHead(200, { 'Content-Type': 'text/xml; charset="utf-8"' });
        res.end(`<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:${action}Response xmlns:u="urn:fake">${inner}</u:${action}Response></s:Body></s:Envelope>`);
      };
      const fault = (code: number, text: string) => {
        res.writeHead(500, { 'Content-Type': 'text/xml; charset="utf-8"' });
        res.end(`<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>${code}</errorCode><errorDescription>${text}</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>`);
      };
      if (this.faultActions.has(action)) return fault(401, 'Invalid Action');
      const s = this.state;
      switch (action) {
        // Name: read via ACT (GroupControl's getter returns "" on the real bar), written via GroupControl.
        case 'GetFriendlyName': return ok(`<friendlyName>${esc(s.name)}</friendlyName>`);
        case 'GetDeviceFriendlyName': return ok('<DeviceFriendlyName></DeviceFriendlyName>');
        case 'GetGroupFriendlyName': return ok(`<GroupFriendlyName>${esc(s.pairName)}</GroupFriendlyName>`);
        case 'SetDeviceFriendlyName': s.name = arg('DeviceFriendlyName'); return ok('');
        case 'GetAudioConfig':
          return ok(`<AudioConfig>${esc(this.audioXml())}</AudioConfig>`);
        case 'SetAudioConfig': {
          const x = arg('AudioConfig');
          const mode = tag(x, 'soundMode');
          if (mode) s.soundMode = mode;
          const boost = tag(x, 'bassBoost');
          if (boost) s.bassBoost = Number(boost);
          return ok('');
        }
        case 'GetTvConfig':
          return ok(`<TvConfig>${esc(this.tvXml())}</TvConfig>`);
        case 'SetTvConfig': {
          const x = arg('TvConfig');
          const d = levelTag(x, 'dialogueEnhance');
          if (d !== null) s.dialogueLevel = d;
          const n = levelTag(x, 'nightMode');
          if (n !== null) s.nightLevel = n;
          return ok('');
        }
        case 'X_GetBass': return ok(`<CurrentBass>${s.bass}</CurrentBass>`);
        case 'X_SetBass': s.bass = Number(arg('DesiredBass')); return ok('');
        case 'X_GetTreble': return ok(`<CurrentTreble>${s.treble}</CurrentTreble>`);
        case 'X_SetTreble': s.treble = Number(arg('DesiredTreble')); return ok('');
        case 'X_GetSubwoofer': return ok(`<CurrentLevel>${s.subwoofer}</CurrentLevel>`);
        case 'X_SetSubwoofer': s.subwoofer = Number(arg('DesiredLevel')); return ok('');
        case 'ListPresets':
          return ok('<CurrentPresetNameList>FactoryDefaults,InstallationDefaults,Disabled,Accoustic,Classical,Jazz,Pop,Rock</CurrentPresetNameList>');
        case 'X_GetPreset': return ok(`<CurrentPreset>${s.preset}</CurrentPreset>`);
        case 'SelectPreset': s.preset = arg('PresetName'); return ok('');
        default:
          return fault(401, 'Invalid Action');
      }
    }
  }
}
