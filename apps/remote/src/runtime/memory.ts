import type { DeviceState, InputSource } from '@zapbar/heos-core';
import type { IconId } from './inputs';
import { ACCENT_IDS, DEFAULT_APPEARANCE, FONT_IDS, type Appearance } from '../theme';

export interface KeyValue {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync(key: string): void;
}

export interface KnownDevice {
  key: string;
  name: string;
  model: string;
  lastIp: string;
  /** Set only when the bar refused a rename; wins over the reported name. */
  nickname?: string;
}

export interface InputPref {
  label?: string;
  icon?: IconId;
  hidden?: boolean;
  order?: number;
}
export type InputPrefs = Record<string, InputPref>;

/** A bar that was never renamed reports its brand/model ("Denon DHT-S716H"); Zapbar never shows that as a name. */
export function isFactoryName(name: string, model?: string): boolean {
  return name === model || /^(denon|marantz|heos)\b/i.test(name.trim());
}

/** A Zapbar nickname wins; otherwise the bar's reported name, then the name remembered at setup; a factory name shows as "Soundbar". */
export function displayName(known: KnownDevice | undefined, state: DeviceState | null | undefined): string {
  if (known?.nickname) return known.nickname;
  const name = state?.name || known?.name || '';
  if (!name) return '';
  return isFactoryName(name, known?.model ?? state?.model ?? undefined) ? 'Soundbar' : name;
}

export interface QuickSettings {
  volumeKeys: boolean;
  notification: boolean;
}

const K = {
  devices: 'devices',
  active: 'active',
  prefs: (key: string) => `prefs:${key}`,
  setup: (key: string) => `setup:${key}`,
  quick: 'quick',
  inputs: (key: string) => `inputs:${key}`,
  supporter: 'supporter',
  appearance: 'appearance',
};

/** Device memory keyed by serial, so labels survive IP changes. */
export class DeviceMemory {
  constructor(private readonly kv: KeyValue) {}

  private read<T>(key: string, fallback: T): T {
    const raw = this.kv.getItemSync(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown): void {
    this.kv.setItemSync(key, JSON.stringify(value));
  }

  devices(): KnownDevice[] {
    const list = this.read<KnownDevice[]>(K.devices, []);
    return Array.isArray(list) ? list : [];
  }

  saveDevice(d: KnownDevice): void {
    const list = this.devices();
    const i = list.findIndex((x) => x.key === d.key);
    if (i === -1) list.push(d);
    else list[i] = d;
    this.write(K.devices, list);
  }

  forgetDevice(key: string): void {
    this.write(K.devices, this.devices().filter((d) => d.key !== key));
    this.kv.removeItemSync(K.prefs(key));
    this.kv.removeItemSync(K.setup(key));
    this.kv.removeItemSync(K.inputs(key));
    if (this.read<string | null>(K.active, null) === key) this.kv.removeItemSync(K.active);
  }

  activeKey(): string | null {
    const list = this.devices();
    const stored = this.read<string | null>(K.active, null);
    if (stored && list.some((d) => d.key === stored)) return stored;
    return list[0]?.key ?? null;
  }

  setActive(key: string): void {
    this.write(K.active, key);
  }

  inputPrefs(key: string): InputPrefs {
    return this.read<InputPrefs>(K.prefs(key), {});
  }

  setInputPref(key: string, mid: string, patch: InputPref): InputPrefs {
    const all = this.inputPrefs(key);
    const next = { ...all, [mid]: { ...all[mid], ...patch } };
    this.write(K.prefs(key), next);
    return next;
  }

  setInputOrder(key: string, mids: string[]): InputPrefs {
    const all = this.inputPrefs(key);
    const next: InputPrefs = { ...all };
    mids.forEach((mid, order) => {
      next[mid] = { ...next[mid], order };
    });
    this.write(K.prefs(key), next);
    return next;
  }

  /** The last input list the device reported, so the remote can draw tiles before it connects. */
  cachedInputs(key: string): InputSource[] {
    const list = this.read<InputSource[]>(K.inputs(key), []);
    return Array.isArray(list) ? list : [];
  }

  setCachedInputs(key: string, inputs: InputSource[]): void {
    this.write(K.inputs(key), inputs);
  }

  quickSettings(): QuickSettings {
    return { volumeKeys: true, notification: true, ...this.read<Partial<QuickSettings>>(K.quick, {}) };
  }

  setQuickSettings(patch: Partial<QuickSettings>): QuickSettings {
    const next = { ...this.quickSettings(), ...patch };
    this.write(K.quick, next);
    return next;
  }

  supporter(): boolean {
    return this.read<boolean>(K.supporter, false) === true;
  }

  setSupporter(v: boolean): void {
    this.write(K.supporter, v);
  }

  appearance(): Appearance {
    const a = this.read<Partial<Appearance>>(K.appearance, {});
    return {
      accent: a.accent && ACCENT_IDS.includes(a.accent) ? a.accent : DEFAULT_APPEARANCE.accent,
      font: a.font && FONT_IDS.includes(a.font) ? a.font : DEFAULT_APPEARANCE.font,
      eleven: a.eleven === true,
      pirate: a.pirate === true,
      confetti: a.confetti === true,
      dad: a.dad === true,
    };
  }

  setAppearance(a: Appearance): void {
    this.write(K.appearance, a);
  }

  /** One-off flags, e.g. "already asked for the notification permission". */
  flag(name: string): boolean {
    return this.read<boolean>(`flag:${name}`, false) === true;
  }

  setFlag(name: string): void {
    this.write(`flag:${name}`, true);
  }

  isSetupDone(key: string): boolean {
    return this.read<boolean>(K.setup(key), false) === true;
  }

  markSetupDone(key: string): void {
    this.write(K.setup(key), true);
  }
}

export function memoryKv(): KeyValue {
  const m = new Map<string, string>();
  return {
    getItemSync: (k) => m.get(k) ?? null,
    setItemSync: (k, v) => {
      m.set(k, v);
    },
    removeItemSync: (k) => {
      m.delete(k);
    },
  };
}

/** expo-sqlite's synchronous key-value store; loaded lazily so tests never touch native code. */
export function sqliteKv(): KeyValue {
  return require('expo-sqlite/kv-store').default as KeyValue;
}
