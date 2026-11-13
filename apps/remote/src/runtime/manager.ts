import {
  cleanName,
  createHeosStore,
  findIpByKey,
  HeosDevice,
  listPlayers,
  type Capabilities,
  type DeviceOptions,
  type FoundPlayer,
  type HttpFn,
  type InputSource,
  type SocketFactory,
} from '@zapbar/heos-core';
import { createStore } from 'zustand/vanilla';
import type { DeviceMemory, InputPref, InputPrefs, KnownDevice, QuickSettings } from './memory';

export interface UiState {
  activeKey: string | null;
  devices: KnownDevice[];
  prefs: Record<string, InputPrefs>;
  /** Last known input list per device, shown while the device is unreachable. */
  inputs: Record<string, InputSource[]>;
  onLan: boolean;
  /** Quick-access switches (volume keys, notification). */
  quick: QuickSettings;
  /** Device key whose new name is still being applied (the bar restarts its services after a rename). */
  applying: string | null;
  /** Phone is on a subnet that does not contain the active soundbar (hint only). */
  otherSubnet: boolean;
}

export interface ManagerDeps {
  socketFactory: SocketFactory;
  http: HttpFn;
  memory: DeviceMemory;
  discover: () => Promise<string[]>;
  deviceOptions?: Partial<Omit<DeviceOptions, 'socketFactory' | 'http' | 'store' | 'resolveIp'>>;
}

export class DeviceManager {
  readonly store = createHeosStore();
  readonly ui;
  private devices = new Map<string, HeosDevice>();
  private foreground = true;
  private applyingSawDrop = false;
  private applyingTimers: ReturnType<typeof setTimeout>[] = [];
  private netId: string | undefined;

  constructor(private readonly d: ManagerDeps) {
    const known = d.memory.devices();
    this.ui = createStore<UiState>()(() => ({
      activeKey: d.memory.activeKey(),
      devices: known,
      prefs: Object.fromEntries(known.map((k) => [k.key, d.memory.inputPrefs(k.key)])),
      inputs: Object.fromEntries(known.map((k) => [k.key, d.memory.cachedInputs(k.key)])),
      onLan: true,
      quick: d.memory.quickSettings(),
      applying: null,
      otherSubnet: false,
    }));
    // Persist an IP only once a connection there succeeded (re-discovery or a typed IP), so a
    // stale device object can never write its old IP back. Cache the input list for cold starts.
    this.store.subscribe((s) => {
      this.trackApplying(s.devices);
      for (const known of this.ui.getState().devices) {
        const dev = s.devices[known.key];
        if (!dev) continue;
        if (dev.status === 'ready' && dev.ip && dev.ip !== known.lastIp) this.saveKnown({ ...known, lastIp: dev.ip });
        const inputs = dev.caps?.inputs;
        if (inputs && JSON.stringify(inputs) !== JSON.stringify(this.ui.getState().inputs[known.key])) {
          this.d.memory.setCachedInputs(known.key, inputs);
          this.ui.setState((u) => ({ inputs: { ...u.inputs, [known.key]: inputs } }));
        }
      }
    });
  }

  start(): void {
    const key = this.ui.getState().activeKey;
    if (key) this.activate(key);
  }

  stopAll(): void {
    for (const dev of this.devices.values()) dev.stop();
  }

  device(key: string): HeosDevice | undefined {
    return this.devices.get(key);
  }

  get active(): HeosDevice | undefined {
    const key = this.ui.getState().activeKey;
    return key ? this.devices.get(key) : undefined;
  }

  async scan(): Promise<FoundPlayer[]> {
    return listPlayers(await this.d.discover(), this.d.socketFactory, this.d.deviceOptions?.cliPort);
  }

  probeIp(ip: string): Promise<FoundPlayer[]> {
    return listPlayers([ip], this.d.socketFactory, this.d.deviceOptions?.cliPort);
  }

  adopt(p: FoundPlayer): void {
    const existing = this.ui.getState().devices.find((d) => d.key === p.key);
    this.saveKnown({ ...existing, key: p.key, name: p.name, model: p.model, lastIp: p.ip });
    this.activate(p.key);
  }

  activate(key: string): void {
    const known = this.ui.getState().devices.find((k) => k.key === key);
    if (!known) return;
    for (const [other, dev] of this.devices) if (other !== key) dev.stop();
    let dev = this.devices.get(key);
    // A typed or rediscovered IP replaces a device object still pointing at the old address.
    if (dev && this.store.getState().devices[key]?.ip !== known.lastIp) {
      dev.stop();
      this.devices.delete(key);
      dev = undefined;
    }
    if (!dev) {
      dev = new HeosDevice(
        { ...this.d.deviceOptions, socketFactory: this.d.socketFactory, http: this.d.http, store: this.store, resolveIp: (k) => this.resolveIp(k) },
        { key, ip: known.lastIp },
      );
      this.devices.set(key, dev);
    }
    this.d.memory.setActive(key);
    this.ui.setState({ activeKey: key });
    if (this.ui.getState().onLan) dev.start();
    dev.setVisible(this.foreground);
  }

  forget(key: string): void {
    this.devices.get(key)?.stop();
    this.devices.delete(key);
    this.d.memory.forgetDevice(key);
    const { [key]: _gone, ...prefs } = this.ui.getState().prefs;
    const { [key]: _goneInputs, ...inputs } = this.ui.getState().inputs;
    this.ui.setState({ devices: this.d.memory.devices(), prefs, inputs, activeKey: this.d.memory.activeKey() });
    const next = this.ui.getState().activeKey;
    if (next) this.activate(next);
  }

  waitForCaps(key: string, timeoutMs: number): Promise<Capabilities | null> {
    const check = () => {
      const s = this.store.getState().devices[key];
      return s && (s.status === 'ready' || s.status === 'degraded') && s.caps ? s.caps : null;
    };
    return new Promise((resolve) => {
      const now = check();
      if (now) return resolve(now);
      const timer = setTimeout(() => {
        unsub();
        resolve(null);
      }, timeoutMs);
      const unsub = this.store.subscribe(() => {
        const caps = check();
        if (!caps) return;
        clearTimeout(timer);
        unsub();
        resolve(caps);
      });
    });
  }

  setInputPref(mid: string, patch: InputPref): void {
    const key = this.ui.getState().activeKey;
    if (!key) return;
    const next = this.d.memory.setInputPref(key, mid, patch);
    this.ui.setState((s) => ({ prefs: { ...s.prefs, [key]: next } }));
  }

  setInputOrder(mids: string[]): void {
    const key = this.ui.getState().activeKey;
    if (!key) return;
    const next = this.d.memory.setInputOrder(key, mids);
    this.ui.setState((s) => ({ prefs: { ...s.prefs, [key]: next } }));
  }

  /** Renames the bar itself when it accepts; otherwise keeps the name as a Zapbar nickname. */
  async renameDevice(key: string, raw: string): Promise<'device' | 'nickname' | 'invalid' | 'failed'> {
    const name = cleanName(raw);
    const known = this.ui.getState().devices.find((d) => d.key === key);
    if (!name || !known) return 'invalid';
    const result = (await this.devices.get(key)?.setName(name)) ?? 'unsupported';
    if (result === 'failed') return 'failed';
    if (result === 'ok') {
      const { nickname: _old, ...rest } = known;
      this.saveKnown({ ...rest, name });
      this.startApplying(key);
      return 'device';
    }
    this.saveKnown({ ...known, nickname: name });
    return 'nickname';
  }

  setQuickSettings(patch: Partial<QuickSettings>): void {
    this.ui.setState({ quick: this.d.memory.setQuickSettings(patch) });
  }

  /** The device memory, for one-off flags such as permission prompts. */
  get memory(): DeviceMemory {
    return this.d.memory;
  }

  /** After a rename the bar briefly drops its services; show "applying" until it is ready again (8 s if it never drops, 30 s at most). */
  private startApplying(key: string): void {
    this.applyingTimers.forEach(clearTimeout);
    this.applyingSawDrop = false;
    this.ui.setState({ applying: key });
    const later = (ms: number, fn: () => void) => {
      const t = setTimeout(fn, ms);
      (t as { unref?: () => void }).unref?.();
      this.applyingTimers.push(t);
    };
    later(8_000, () => { if (!this.applyingSawDrop) this.ui.setState({ applying: null }); });
    later(30_000, () => this.ui.setState({ applying: null }));
  }

  private trackApplying(devices: Record<string, { status: string } | undefined>): void {
    const key = this.ui.getState().applying;
    if (!key) return;
    const status = devices[key]?.status;
    if (status && status !== 'ready') this.applyingSawDrop = true;
    else if (status === 'ready' && this.applyingSawDrop) {
      this.applyingTimers.forEach(clearTimeout);
      this.ui.setState({ applying: null });
    }
  }

  isSetupDone(key: string): boolean {
    return this.d.memory.isSetupDone(key);
  }

  markSetupDone(key: string): void {
    this.d.memory.markSetupDone(key);
  }

  /** App to the foreground: poll UPnP settings and force a fresh connection (spec §5). */
  setForeground(fg: boolean): void {
    this.foreground = fg;
    const dev = this.active;
    if (!dev) return;
    dev.setVisible(fg);
    if (fg && this.ui.getState().onLan) dev.reconnectNow();
  }

  /**
   * Off the LAN nothing can connect, so the device is stopped (no retries, no SSDP). It restarts when
   * the LAN comes back, and reconnects when the phone moves to another Wi-Fi network (`netId` changes).
   */
  setNetwork(onLan: boolean, netId?: string): void {
    const was = this.ui.getState().onLan;
    const prevNet = this.netId;
    if (netId !== undefined) this.netId = netId;
    this.ui.setState({ onLan });
    const dev = this.active;
    if (!dev) return;
    if (!onLan) {
      if (was) dev.stop();
    } else if (!was) {
      dev.start();
    } else if (netId !== undefined && prevNet !== undefined && netId !== prevNet) {
      dev.reconnectNow();
    }
  }

  private async resolveIp(key: string): Promise<string | null> {
    return findIpByKey(await this.d.discover(), key, this.d.socketFactory, this.d.deviceOptions?.cliPort);
  }

  private saveKnown(k: KnownDevice): void {
    this.d.memory.saveDevice(k);
    this.ui.setState((s) => ({
      devices: this.d.memory.devices(),
      prefs: { ...s.prefs, [k.key]: s.prefs[k.key] ?? this.d.memory.inputPrefs(k.key) },
    }));
  }
}
