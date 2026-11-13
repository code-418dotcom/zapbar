import type { FoundPlayer, InputSource } from '@zapbar/heos-core';
import { createStore } from 'zustand/vanilla';
import { extraInputs, labelQueue, prefFromChoice, type ChoiceId } from '../runtime/inputs';
import { LocalNetworkDenied } from '../runtime/discovery';
import type { DeviceManager } from '../runtime/manager';

export type SetupStep =
  | { kind: 'scanning' }
  | { kind: 'pick'; players: FoundPlayer[] }
  | { kind: 'manual'; error: string | null; denied?: boolean }
  | { kind: 'connecting'; name: string }
  | { kind: 'label'; input: InputSource; index: number; total: number }
  | { kind: 'extras'; inputs: InputSource[] }
  | { kind: 'done' };

export type SetupManager = Pick<DeviceManager, 'scan' | 'probeIp' | 'adopt' | 'waitForCaps' | 'setInputPref' | 'markSetupDone' | 'isSetupDone'>;

export const DENIED_TEXT = "Zapbar isn't allowed on your local network. Turn on Settings › Zapbar › Local Network, then search again.";

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export class SetupFlow {
  readonly state = createStore<{ step: SetupStep }>()(() => ({ step: { kind: 'scanning' } as SetupStep }));
  private key: string | null = null;
  private queue: InputSource[] = [];
  private extras: InputSource[] = [];
  private index = 0;

  constructor(private readonly m: SetupManager) {}

  private set(step: SetupStep): void {
    this.state.setState({ step });
  }

  async scan(): Promise<void> {
    this.set({ kind: 'scanning' });
    let found: FoundPlayer[];
    try {
      found = await this.m.scan();
    } catch (e) {
      if (e instanceof LocalNetworkDenied || (e as { name?: string } | null)?.name === 'LocalNetworkDenied') return this.set({ kind: 'manual', error: DENIED_TEXT, denied: true });
      found = [];
    }
    // Adding a soundbar must not re-run the questions for one that is already set up.
    const players = found.filter((p) => !this.m.isSetupDone(p.key));
    const error = players.length < found.length ? 'No new soundbar found. Enter its IP address if it is not listed.' : null;
    await this.offer(players, { kind: 'manual', error });
  }

  async manual(raw: string): Promise<void> {
    const ip = raw.trim();
    if (!IPV4.test(ip)) return this.set({ kind: 'manual', error: 'Enter an IP address like 192.168.1.20' });
    this.set({ kind: 'scanning' });
    const players = await this.m.probeIp(ip).catch(() => [] as FoundPlayer[]);
    await this.offer(players, { kind: 'manual', error: `No soundbar answered at ${ip}` });
  }

  private async offer(players: FoundPlayer[], none: SetupStep): Promise<void> {
    if (players.length === 0) return this.set(none);
    if (players.length === 1) return this.choose(players[0]!);
    this.set({ kind: 'pick', players });
  }

  async choose(p: FoundPlayer): Promise<void> {
    this.set({ kind: 'connecting', name: p.name });
    this.m.adopt(p);
    const caps = await this.m.waitForCaps(p.key, 30_000);
    if (!caps) return this.set({ kind: 'manual', error: `Couldn't connect to ${p.name}` });
    // A typed IP for a known soundbar only fixes its address; its labels stay.
    if (this.m.isSetupDone(p.key)) return this.set({ kind: 'done' });
    this.key = p.key;
    this.queue = labelQueue(caps.inputs);
    this.extras = extraInputs(caps.inputs);
    this.index = 0;
    this.next();
  }

  answer(id: ChoiceId): void {
    const input = this.queue[this.index];
    if (!input) return;
    this.m.setInputPref(input.mid, prefFromChoice(id));
    this.index++;
    this.next();
  }

  finishExtras(usedMids: string[]): void {
    for (const i of this.extras) this.m.setInputPref(i.mid, { hidden: !usedMids.includes(i.mid) });
    if (this.key) this.m.markSetupDone(this.key);
    this.set({ kind: 'done' });
  }

  private next(): void {
    const input = this.queue[this.index];
    if (input) return this.set({ kind: 'label', input, index: this.index, total: this.queue.length });
    if (this.extras.length) return this.set({ kind: 'extras', inputs: this.extras });
    this.finishExtras([]);
  }
}
