import { cleanName, getGroupFriendlyName, setFriendlyName } from './upnp/name';
import { probeCapabilities } from './capabilities';
import { CLI_PORT, CliError, HeosCliClient, type CliEvent } from './cli/client';
import { createCliCommands, deviceKey, type CliCommands, type PlayState, type PlayerInfo } from './cli/commands';
import { toPlayback } from './state/now-playing';
import { patchSettings, upsertDevice, type HeosStore } from './state/store';
import type { ConnectionStatus, DeviceSettings, DeviceState, GroupMember, GroupState, PlayerSummary } from './state/types';
import type { HttpFn, SocketFactory } from './transport';
import { getAudioConfig, getTvConfig, setAudioConfig, setTvConfig } from './upnp/act';
import { getBass, getEqPreset, getSubwoofer, getTreble, selectEqPreset, setBass, setSubwoofer, setTreble, TONE_RANGE } from './upnp/rendering';
import { UPNP_PORT, UpnpFault, UpnpUnreachable, type UpnpEndpoint } from './upnp/soap';
import { clamp } from './util';


/** How long a tapped input wins over now-playing reports that still name the previous one. */
const INPUT_SETTLE_MS = 5000;
/** How long after a volume drag the bar's late echoes of in-between values are ignored. */
const VOLUME_ECHO_MS = 2000;
/** Receivers answer slower than soundbars; a tester's Marantz SR6013 failed to connect at 3 s (suspected slow HEOS module). */
const CLI_TIMEOUT_MS = 6000;
/** Pair-name lookups are cosmetic: never let a silent speaker hold up connecting. */
const PAIR_NAME_TIMEOUT_MS = 1500;
export interface DeviceOptions {
  socketFactory: SocketFactory;
  http: HttpFn;
  store: HeosStore;
  /** Re-discover the device's IP by key; called from the second failed connect onwards. */
  resolveIp?: (key: string) => Promise<string | null>;
  cliPort?: number;
  upnpPort?: number;
  timeoutMs?: number;
  backoffMs?: number[];
  heartbeatMs?: number;
  upnpPollMs?: number;
}

export interface DeviceIdent {
  key: string;
  ip: string;
}

const DEFAULT_BACKOFF = [1000, 2000, 5000, 10000];

type SliderKey = 'volume' | 'bass' | 'treble' | 'subwoofer';

export class HeosDevice {
  readonly key: string;
  protected ip: string;
  /** Input just tapped; until the bar confirms it, stale now-playing reports of the old input are ignored. */
  private pendingInput: { mid: string; until: number } | null = null;
  protected pid: number | null = null;
  /** This device is a bonded set whose shown name comes from GroupControl (see withPairNames). */
  private pairNamed = false;
  protected player: PlayerInfo | null = null;
  protected client: HeosCliClient | null = null;
  protected cmds: CliCommands | null = null;
  private stopped = true;
  /** Bumped by start() and stop(); a loop or session whose generation is stale must not touch state. */
  private gen = 0;
  private attempt = 0;
  private skipDelay = false;
  private wake: (() => void) | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private visible = false;
  private refreshing = false;
  private errorSeq = 0;
  /** Last value the device confirmed for each slider; the rollback target. */
  private confirmed: Partial<Record<SliderKey, number>> = {};
  private sliders = new Map<SliderKey, { pending: number | null }>();
  /** Values sent during the last volume drag; the bar echoes them late, after the drag ends. */
  private volumeEcho: { sent: Set<number>; final: number; until: number } | null = null;
  /** In-flight per-speaker volume sends inside a group, coalesced like the main slider. */
  private memberSliders = new Map<number, { pending: number | null }>();
  /** The running group re-read; callers that arrive meanwhile wait for its extra pass. */
  private groupRun: Promise<void> | null = null;
  private groupReread = false;

  constructor(protected readonly o: DeviceOptions, ident: DeviceIdent) {
    this.key = ident.key;
    this.ip = ident.ip;
    upsertDevice(o.store, this.key, { ip: this.ip, status: 'offline' });
  }

  get state(): DeviceState {
    return this.o.store.getState().devices[this.key]!;
  }

  protected get ep(): UpnpEndpoint {
    return { http: this.o.http, baseUrl: `http://${this.ip}:${this.o.upnpPort ?? UPNP_PORT}`, timeoutMs: this.o.timeoutMs ?? 3000 };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.loop(++this.gen);
  }

  stop(): void {
    this.stopped = true;
    this.gen++;
    this.stopPoll();
    this.client?.close();
    this.wake?.();
    this.setStatus('offline');
  }

  /** App resume or Wi-Fi change: drop the connection and reconnect without backoff. */
  reconnectNow(): void {
    this.attempt = 0;
    this.skipDelay = true;
    this.client?.close();
    this.wake?.();
  }

  /** While visible, UPnP-side settings are polled; HEOS sends no events for them. */
  setVisible(v: boolean): void {
    this.visible = v;
    if (v && this.client && !this.client.isClosed) this.startPoll();
    else this.stopPoll();
  }

  private live(gen: number): boolean {
    return !this.stopped && gen === this.gen;
  }

  /** True while `c` is still this device's open connection. */
  private current(c: HeosCliClient | null): boolean {
    return c !== null && this.client === c && !c.isClosed;
  }

  protected setStatus(status: ConnectionStatus): void {
    if (this.state.status !== status) upsertDevice(this.o.store, this.key, { status });
  }

  protected patch(p: Partial<DeviceSettings>): void {
    patchSettings(this.o.store, this.key, p);
  }

  private async loop(gen: number): Promise<void> {
    while (this.live(gen)) {
      try {
        await this.session(gen);
      } catch {
        // connect or probe failed; fall through to backoff
      }
      if (!this.live(gen)) break;
      this.setStatus('offline');
      if (this.skipDelay) {
        this.skipDelay = false;
        continue;
      }
      const backoff = this.o.backoffMs ?? DEFAULT_BACKOFF;
      const delay = backoff[Math.min(this.attempt, backoff.length - 1)]!;
      this.attempt++;
      if (this.attempt >= 2 && this.o.resolveIp) {
        const ip = await this.o.resolveIp(this.key).catch(() => null);
        if (!this.live(gen)) break;
        if (ip && ip !== this.ip) {
          this.ip = ip;
          upsertDevice(this.o.store, this.key, { ip });
        }
      }
      // reconnectNow() may have landed while resolveIp was running, before the sleep existed.
      if (this.skipDelay) {
        this.skipDelay = false;
        continue;
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, delay);
        this.wake = () => {
          clearTimeout(t);
          resolve();
        };
      });
      this.wake = null;
    }
  }

  /** Connects, probes, goes ready, then resolves when the connection closes. */
  private async session(gen: number): Promise<void> {
    this.setStatus('connecting');
    const client = await HeosCliClient.connect(this.o.socketFactory, this.ip, { port: this.o.cliPort ?? CLI_PORT, timeoutMs: this.o.timeoutMs ?? CLI_TIMEOUT_MS });
    if (!this.live(gen)) {
      client.close();
      return;
    }
    const closed = new Promise<void>((r) => client.onClose(() => r()));
    this.client = client;
    const cmds = createCliCommands(client);
    this.cmds = cmds;
    client.onEvent((e) => {
      if (this.current(client)) void this.onEvent(e);
    });
    // Every await below can outlive this session (stop, reconnectNow, drop); re-check before writing state.
    const stillMine = () => {
      if (!this.live(gen) || !this.current(client)) throw new Error('session superseded');
    };
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    try {
      this.setStatus('probing');
      const all = await this.withPairNames(await cmds.getPlayers());
      const me = all.find((p) => deviceKey(p) === this.key);
      stillMine();
      if (!me) throw new Error(`device ${this.key} not found at ${this.ip}`);
      this.player = me;
      this.pid = me.pid;
      await cmds.registerForChangeEvents(true);
      const probe = await probeCapabilities(cmds, this.ep, me);
      // Grouping is a bonus: a bar that refuses group commands still gets its remote.
      const group = await readGroup(cmds, me.pid).catch(() => null);
      const volume = group ? await cmds.getGroupVolume(group.gid) : await cmds.getVolume(me.pid);
      // Receivers (Marantz SR6013) can be slow or refuse these; the remote still works without them.
      const mute = await (group ? cmds.getGroupMute(group.gid) : cmds.getMute(me.pid)).catch(() => false);
      const playState = await cmds.getPlayState(group?.leaderPid ?? me.pid).catch(() => 'stop' as const);
      const np = await cmds.getNowPlaying(me.pid).catch(() => null);
      stillMine();
      this.confirmed = { volume };
      for (const k of ['bass', 'treble', 'subwoofer'] as const) {
        const v = probe.settings[k];
        if (typeof v === 'number') this.confirmed[k] = v;
      }
      upsertDevice(this.o.store, this.key, { pid: me.pid, name: me.name, model: me.model, ip: this.ip, caps: probe.caps, players: all.map(summary), group });
      this.patch({ ...probe.settings, volume, mute, playState, ...toPlayback(np) });
      this.setStatus(probe.caps.upnpReachable ? 'ready' : 'degraded');
      this.attempt = 0;
      this.skipDelay = false;
      heartbeat = setInterval(() => {
        cmds.heartbeat().catch(() => client.close());
      }, this.o.heartbeatMs ?? 30_000);
      if (this.visible) this.startPoll();
      await closed;
    } catch (e) {
      client.close();
      throw e;
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      if (this.client === client) {
        this.stopPoll();
        this.client = null;
        this.cmds = null;
      }
    }
  }

  /** Bonded sets (stereo pairs) get the name the HEOS app shows instead of the left speaker's. Best effort, in parallel. */
  private async withPairNames(players: PlayerInfo[]): Promise<PlayerInfo[]> {
    return Promise.all(
      players.map(async (p) => {
        if (!p.ip) return p;
        const ep: UpnpEndpoint = { http: this.o.http, baseUrl: `http://${p.ip}:${this.o.upnpPort ?? UPNP_PORT}`, timeoutMs: PAIR_NAME_TIMEOUT_MS };
        const pair = cleanName(await getGroupFriendlyName(ep).catch(() => ''));
        if (deviceKey(p) === this.key) this.pairNamed = !!pair;
        return pair ? { ...p, name: pair } : p;
      }),
    );
  }

  private startPoll(): void {
    this.stopPoll();
    void this.refreshUpnp();
    this.poll = setInterval(() => void this.refreshUpnp(), this.o.upnpPollMs ?? 10_000);
  }

  private stopPoll(): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  /** Re-reads UPnP-side settings; re-probes capabilities if UPnP was unreachable at connect. */
  async refreshUpnp(): Promise<void> {
    const caps = this.state.caps;
    const client = this.client;
    if (!caps || !this.cmds || !this.player || this.refreshing) return;
    this.refreshing = true;
    try {
      if (!caps.upnpReachable) {
        const probe = await probeCapabilities(this.cmds, this.ep, this.player);
        if (probe.caps.upnpReachable && this.current(client)) {
          upsertDevice(this.o.store, this.key, { caps: probe.caps });
          this.patch(probe.settings);
          this.setStatus('ready');
        }
        return;
      }
      const p: Partial<DeviceSettings> = {};
      if (caps.tone) {
        p.bass = await getBass(this.ep);
        p.treble = await getTreble(this.ep);
        if (caps.tone.subwoofer) p.subwoofer = await getSubwoofer(this.ep);
      }
      if (caps.eqPresets.length) p.eqPreset = await getEqPreset(this.ep);
      if (caps.soundModes.length) p.soundMode = (await getAudioConfig(this.ep)).soundMode;
      if (caps.dialogue || caps.night) {
        const tv = await getTvConfig(this.ep);
        if (caps.dialogue) p.dialogueLevel = tv.dialogue?.level ?? null;
        if (caps.night) p.nightLevel = tv.night?.level ?? null;
      }
      if (!this.current(client)) return;
      // Don't yank a slider the user is dragging; its own send settles the value.
      for (const k of ['bass', 'treble', 'subwoofer'] as const) {
        const v = p[k];
        if (this.sliders.has(k)) delete p[k];
        else if (typeof v === 'number') this.confirmed[k] = v;
      }
      this.patch(p);
      if (this.state.status === 'degraded') this.setStatus('ready');
    } catch (e) {
      if (e instanceof UpnpUnreachable && this.state.status === 'ready' && this.current(client)) this.setStatus('degraded');
    } finally {
      this.refreshing = false;
    }
  }

  protected async onEvent(e: CliEvent): Promise<void> {
    const pid = this.pid;
    const cmds = this.cmds;
    if (pid === null || !cmds) return;
    const group = this.state.group;
    // Events are system-wide on every HEOS connection; keep this player's, plus what a group shares.
    if (e.message.pid !== undefined && Number(e.message.pid) !== pid) {
      const other = Number(e.message.pid);
      if (e.event === 'player_volume_changed') return this.onMemberVolume(other, e.message);
      // A member plays what its leader plays; the leader reports the changes.
      if (!group || other !== group.leaderPid || (e.event !== 'player_state_changed' && e.event !== 'player_now_playing_changed')) return;
    }
    switch (e.event) {
      case 'player_volume_changed': {
        // Grouped, the main volume is the group's; this bar's own level lives in the member list.
        if (group) return this.onMemberVolume(pid, e.message);
        const level = Number(e.message.level);
        if (Number.isFinite(level)) {
          const echo = this.volumeEcho;
          const staleEcho = !!echo && Date.now() < echo.until && level !== echo.final && echo.sent.has(level);
          if (!staleEcho) {
            this.confirmed.volume = level;
            if (!this.sliders.has('volume')) this.patch({ volume: level });
          }
        }
        this.patch({ mute: e.message.mute === 'on' });
        break;
      }
      case 'player_state_changed': {
        const s = e.message.state;
        this.patch({ playState: s === 'play' || s === 'pause' ? s : 'stop' });
        break;
      }
      case 'player_now_playing_changed': {
        const np = await cmds.getNowPlaying(pid).catch(() => undefined);
        if (np !== undefined) {
          const pb = toPlayback(np);
          const pending = this.pendingInput;
          if (pending && (pb.activeInput === pending.mid || Date.now() > pending.until)) this.pendingInput = null;
          // An input switch re-reports the old input once before it lands; don't bounce the tile back.
          if (!this.pendingInput) this.patch(pb);
        }
        // Sound settings follow the source on the DHT-S716H (docs/probe-results.md); re-read them.
        if (this.state.status === 'ready') void this.refreshUpnp();
        break;
      }
      case 'group_volume_changed': {
        if (!group || Number(e.message.gid) !== group.gid) break;
        this.onMainVolume(e.message);
        break;
      }
      case 'players_changed': {
        const raw = await cmds.getPlayers().catch(() => null);
        const all = raw && (await this.withPairNames(raw));
        const me = all?.find((p) => deviceKey(p) === this.key);
        if (all && this.cmds === cmds) upsertDevice(this.o.store, this.key, { players: all.map(summary), ...(me ? { name: me.name } : {}) });
        void this.refreshGroup();
        break;
      }
      case 'groups_changed':
        void this.refreshGroup();
        break;
    }
  }

  /** A volume report for the main slider: the bar's own while alone, the group's while grouped. */
  private onMainVolume(m: Record<string, string>): void {
    const level = Number(m.level);
    if (Number.isFinite(level)) {
      const echo = this.volumeEcho;
      const staleEcho = !!echo && Date.now() < echo.until && level !== echo.final && echo.sent.has(level);
      if (!staleEcho) {
        this.confirmed.volume = level;
        if (!this.sliders.has('volume')) this.patch({ volume: level });
      }
    }
    if (m.mute !== undefined) this.patch({ mute: m.mute === 'on' });
  }

  private onMemberVolume(pid: number, m: Record<string, string>): void {
    if (!this.state.group?.members.some((x) => x.pid === pid)) return;
    const level = Number(m.level);
    const p: Partial<GroupMember> = {};
    if (Number.isFinite(level) && !this.memberSliders.has(pid)) p.volume = level;
    if (m.mute !== undefined) p.mute = m.mute === 'on';
    this.patchMember(pid, p);
  }

  private patchMember(pid: number, p: Partial<GroupMember>): void {
    const g = this.state.group;
    if (!g) return;
    upsertDevice(this.o.store, this.key, { group: { ...g, members: g.members.map((x) => (x.pid === pid ? { ...x, ...p } : x)) } });
  }

  /** Re-reads the group (after groups_changed, players_changed or our own change); overlapping calls run once more at the end. */
  refreshGroup(): Promise<void> {
    if (this.groupRun) {
      this.groupReread = true;
      return this.groupRun;
    }
    this.groupRun = this.readGroupLoop().finally(() => {
      this.groupRun = null;
    });
    return this.groupRun;
  }

  private async readGroupLoop(): Promise<void> {
    do {
      this.groupReread = false;
      const cmds = this.cmds;
      const pid = this.pid;
      const client = this.client;
      if (!cmds || pid === null) return;
      const group = await readGroup(cmds, pid).catch(() => undefined);
      if (group === undefined || !this.current(client)) return;
      const volume = group ? await cmds.getGroupVolume(group.gid).catch(() => null) : await cmds.getVolume(pid).catch(() => null);
      const mute = group ? await cmds.getGroupMute(group.gid).catch(() => null) : await cmds.getMute(pid).catch(() => null);
      if (!this.current(client)) return;
      upsertDevice(this.o.store, this.key, { group });
      if (volume !== null && !this.sliders.has('volume')) {
        this.confirmed.volume = volume;
        this.volumeEcho = null;
        this.patch({ volume });
      }
      if (mute !== null) this.patch({ mute });
    } while (this.groupReread);
  }

  private report(text: string): void {
    upsertDevice(this.o.store, this.key, { lastError: { id: ++this.errorSeq, text } });
  }

  private failText(base: string, e: unknown): string {
    return e instanceof CliError && e.text ? `${base}: ${e.text}` : `${base}, soundbar didn't respond`;
  }

  private cli(): CliCommands | null {
    const s = this.state.status;
    return (s === 'ready' || s === 'degraded') && this.cmds && this.pid !== null ? this.cmds : null;
  }

  private upnpAllowed(): boolean {
    if (this.state.status === 'ready') return true;
    if (this.state.status === 'degraded') this.report('Soundbar settings unavailable');
    return false;
  }

  /** Patch the store now; roll back on failure unless something newer already replaced the value. */
  private async optimistic<K extends keyof DeviceSettings>(
    key: K,
    value: DeviceSettings[K],
    kind: 'cli' | 'upnp',
    action: () => Promise<unknown>,
    failBase: string,
  ): Promise<boolean> {
    if (kind === 'cli' ? !this.cli() : !this.upnpAllowed()) return false;
    const client = this.client;
    const prev = this.state.settings[key];
    this.patch({ [key]: value } as Partial<DeviceSettings>);
    try {
      await action();
      return true;
    } catch (e) {
      if (this.state.settings[key] === value) this.patch({ [key]: prev } as Partial<DeviceSettings>);
      if (e instanceof UpnpUnreachable && this.current(client)) this.setStatus('degraded');
      this.report(this.failText(failBase, e));
      return false;
    }
  }

  private async run(kind: 'cli' | 'upnp', action: () => Promise<unknown>, failBase: string): Promise<boolean> {
    if (kind === 'cli' ? !this.cli() : !this.upnpAllowed()) return false;
    const client = this.client;
    try {
      await action();
      return true;
    } catch (e) {
      if (e instanceof UpnpUnreachable && this.current(client)) this.setStatus('degraded');
      this.report(this.failText(failBase, e));
      return false;
    }
  }

  /**
   * Slider-safe send: while one value is in flight, later calls only replace the pending value,
   * so a drag sends at most two requests in order and lands on the last value. On failure the
   * store returns to the last value the device confirmed.
   */
  private async slide(key: SliderKey, target: number, kind: 'cli' | 'upnp', send: (v: number) => Promise<unknown>, failBase: string): Promise<boolean> {
    if (kind === 'cli' ? !this.cli() : !this.upnpAllowed()) return false;
    this.patch({ [key]: target } as Partial<DeviceSettings>);
    const slot = this.sliders.get(key);
    if (slot) {
      slot.pending = target;
      return true;
    }
    const mine = { pending: null as number | null };
    this.sliders.set(key, mine);
    const client = this.client;
    let next: number | null = target;
    try {
      const sent = new Set<number>();
      while (next !== null) {
        mine.pending = null;
        await send(next);
        sent.add(next);
        this.confirmed[key] = next;
        next = mine.pending;
      }
      if (key === 'volume') this.volumeEcho = { sent, final: this.confirmed.volume!, until: Date.now() + VOLUME_ECHO_MS };
      return true;
    } catch (e) {
      const back = this.confirmed[key];
      if (back !== undefined) this.patch({ [key]: back } as Partial<DeviceSettings>);
      if (e instanceof UpnpUnreachable && this.current(client)) this.setStatus('degraded');
      this.report(this.failText(failBase, e));
      return false;
    } finally {
      this.sliders.delete(key);
    }
  }

  /** The pid that owns playback: the group leader while grouped. */
  private get ctlPid(): number {
    return this.state.group?.leaderPid ?? this.pid!;
  }

  /** The main volume: the whole group's while grouped (HEOS keeps each speaker's balance). */
  setVolume(level: number): Promise<boolean> {
    return this.slide('volume', clamp(Math.round(level), 0, 100), 'cli', (v) => {
      const g = this.state.group;
      return g ? this.cmds!.setGroupVolume(g.gid, v) : this.cmds!.setVolume(this.pid!, v);
    }, "Couldn't change volume");
  }

  volumeStep(delta: number): Promise<boolean> {
    return this.setVolume(this.state.settings.volume + delta);
  }

  setMute(on: boolean): Promise<boolean> {
    return this.optimistic('mute', on, 'cli', () => {
      const g = this.state.group;
      return g ? this.cmds!.setGroupMute(g.gid, on) : this.cmds!.setMute(this.pid!, on);
    }, "Couldn't change mute");
  }

  async playInput(mid: string): Promise<boolean> {
    this.pendingInput = { mid, until: Date.now() + INPUT_SETTLE_MS };
    const ok = await this.optimistic('activeInput', mid, 'cli', async () => {
      // In a group the leader plays; a member's own HDMI or optical is passed to it as the source.
      await this.cmds!.playInput(this.ctlPid, mid, this.pid!);
      this.patch({ nowPlaying: null });
    }, "Couldn't change input");
    if (!ok && this.pendingInput?.mid === mid) this.pendingInput = null;
    return ok;
  }

  setPlayState(s: PlayState): Promise<boolean> {
    return this.optimistic('playState', s, 'cli', () => this.cmds!.setPlayState(this.ctlPid, s), "Couldn't change playback");
  }

  next(): Promise<boolean> {
    return this.run('cli', () => this.cmds!.playNext(this.ctlPid), "Couldn't skip");
  }

  previous(): Promise<boolean> {
    return this.run('cli', () => this.cmds!.playPrevious(this.ctlPid), "Couldn't go back");
  }

  recallQuickSelect(id: number): Promise<boolean> {
    return this.run('cli', () => this.cmds!.playQuickSelect(this.pid!, id), "Couldn't recall Quick Select");
  }

  /**
   * Makes `pids` (this bar is always kept) play together. The current leader stays leader when it
   * remains; HEOS can't hand leadership over, so dropping the leader dissolves the group first and
   * this bar leads the new one. One pid left ungroups.
   */
  async setGroupMembers(pids: number[]): Promise<boolean> {
    const cmds = this.cli();
    const me = this.pid;
    if (!cmds || me === null) return false;
    const set = [me, ...new Set(pids.filter((p) => p !== me))];
    const g = this.state.group;
    try {
      if (set.length < 2) {
        if (g) await cmds.setGroup([g.leaderPid]);
      } else {
        const keepLeader = g && set.includes(g.leaderPid);
        if (g && !keepLeader) await cmds.setGroup([g.leaderPid]);
        const leader = keepLeader ? g.leaderPid : me;
        await cmds.setGroup([leader, ...set.filter((p) => p !== leader)]);
      }
      await this.refreshGroup();
      return true;
    } catch (e) {
      this.report(this.failText("Couldn't change the group", e));
      void this.refreshGroup();
      return false;
    }
  }

  ungroup(): Promise<boolean> {
    return this.pid === null ? Promise.resolve(false) : this.setGroupMembers([this.pid]);
  }

  /** One speaker's own level inside the group; a drag is coalesced like the main slider. */
  async setMemberVolume(pid: number, level: number): Promise<boolean> {
    const cmds = this.cli();
    const before = this.state.group?.members.find((m) => m.pid === pid);
    if (!cmds || !before) return false;
    const target = clamp(Math.round(level), 0, 100);
    this.patchMember(pid, { volume: target });
    const slot = this.memberSliders.get(pid);
    if (slot) {
      slot.pending = target;
      return true;
    }
    const mine = { pending: null as number | null };
    this.memberSliders.set(pid, mine);
    let next: number | null = target;
    let last = before.volume;
    try {
      while (next !== null) {
        mine.pending = null;
        await cmds.setVolume(pid, next);
        last = next;
        next = mine.pending;
      }
      return true;
    } catch (e) {
      this.patchMember(pid, { volume: last });
      this.report(this.failText("Couldn't change that speaker's volume", e));
      return false;
    } finally {
      this.memberSliders.delete(pid);
    }
  }

  setBass(v: number): Promise<boolean> {
    const n = clamp(Math.round(v), TONE_RANGE.bass.min, TONE_RANGE.bass.max);
    return this.slide('bass', n, 'upnp', (x) => setBass(this.ep, x), "Couldn't change bass");
  }

  setTreble(v: number): Promise<boolean> {
    const n = clamp(Math.round(v), TONE_RANGE.treble.min, TONE_RANGE.treble.max);
    return this.slide('treble', n, 'upnp', (x) => setTreble(this.ep, x), "Couldn't change treble");
  }

  setSubwoofer(v: number): Promise<boolean> {
    const n = clamp(Math.round(v), TONE_RANGE.subwoofer.min, TONE_RANGE.subwoofer.max);
    return this.slide('subwoofer', n, 'upnp', (x) => setSubwoofer(this.ep, x), "Couldn't change subwoofer");
  }

  async resetTone(): Promise<boolean> {
    const bass = await this.setBass(TONE_RANGE.bass.neutral);
    const treble = await this.setTreble(TONE_RANGE.treble.neutral);
    return bass && treble;
  }

  selectEqPreset(id: string): Promise<boolean> {
    return this.optimistic('eqPreset', id, 'upnp', async () => {
      await selectEqPreset(this.ep, id);
      await this.refreshUpnp();
    }, "Couldn't change EQ preset");
  }

  setSoundMode(mode: string): Promise<boolean> {
    return this.optimistic('soundMode', mode, 'upnp', () => setAudioConfig(this.ep, { soundMode: mode }), "Couldn't change sound mode");
  }

  setDialogue(level: number): Promise<boolean> {
    const r = this.state.caps?.dialogue;
    if (!r) return Promise.resolve(false);
    const n = clamp(Math.round(level), r.min, r.max);
    return this.optimistic('dialogueLevel', n, 'upnp', () => setTvConfig(this.ep, { dialogueLevel: n }), "Couldn't change dialogue enhancer");
  }

  /** Renames the bar itself (HEOS app, Spotify Connect, TV all follow). 'unsupported' = the bar refused the action. */
  async setName(raw: string): Promise<'ok' | 'unsupported' | 'failed'> {
    const name = cleanName(raw);
    if (!name || !this.upnpAllowed()) return 'failed';
    // Renaming a stereo pair would only rename its left speaker; the caller keeps it as a nickname instead.
    if (this.pairNamed) return 'unsupported';
    try {
      await setFriendlyName(this.ep, name);
    } catch (e) {
      if (e instanceof UpnpFault) return 'unsupported';
      this.report(this.failText("Couldn't rename the soundbar", e));
      return 'failed';
    }
    upsertDevice(this.o.store, this.key, { name });
    return 'ok';
  }

  setNight(level: number): Promise<boolean> {
    const r = this.state.caps?.night;
    if (!r) return Promise.resolve(false);
    const n = clamp(Math.round(level), r.min, r.max);
    return this.optimistic('nightLevel', n, 'upnp', () => setTvConfig(this.ep, { nightLevel: n }), "Couldn't change night mode");
  }
}

const summary = (p: PlayerInfo): PlayerSummary => ({ pid: p.pid, name: p.name, model: p.model });

/** The group `pid` plays in, with each speaker's own level; null when it plays alone. */
async function readGroup(cmds: CliCommands, pid: number): Promise<GroupState | null> {
  const g = (await cmds.getGroups()).find((x) => x.players.some((p) => p.pid === pid));
  if (!g || g.players.length < 2) return null;
  const members: GroupMember[] = [];
  for (const p of g.players) {
    const volume = await cmds.getVolume(p.pid).catch(() => null);
    const mute = await cmds.getMute(p.pid).catch(() => false);
    members.push({ pid: p.pid, name: p.name, role: p.role, volume, mute });
  }
  members.sort((a, b) => (a.role === b.role ? 0 : a.role === 'leader' ? -1 : 1));
  return { gid: g.gid, name: g.name, leaderPid: g.players.find((p) => p.role === 'leader')?.pid ?? g.gid, members };
}
