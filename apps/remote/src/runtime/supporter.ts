import { createStore, type StoreApi } from 'zustand/vanilla';
import { DEFAULT_APPEARANCE, type Appearance } from '../theme';
import type { Billing, BuyResult, OwnedTip, TipId, TipProduct } from './billing';
import type { DeviceMemory } from './memory';

export interface SupporterState {
  available: boolean;
  products: TipProduct[];
  owned: TipId[];
  pending: TipId[];
  busy: TipId | null;
  supporter: boolean;
  appearance: Appearance;
}

export const effectiveAppearance = (s: Pick<SupporterState, 'supporter' | 'appearance'>): Appearance =>
  s.supporter ? s.appearance : DEFAULT_APPEARANCE;

/** Tip-jar state. Any tier unlocks every perk. Only a successful ownership read can revoke them. */
export class Supporter {
  readonly store: StoreApi<SupporterState>;

  constructor(
    private readonly billing: Billing,
    private readonly memory: DeviceMemory,
  ) {
    this.store = createStore<SupporterState>()(() => ({
      available: false,
      products: [],
      owned: [],
      pending: [],
      busy: null,
      supporter: memory.supporter(),
      appearance: memory.appearance(),
    }));
  }

  /** Bumped by every refresh; a refresh only applies its result if no newer one has started. */
  private generation = 0;

  async refresh(): Promise<void> {
    const gen = ++this.generation;
    const current = () => gen === this.generation;
    let up = false;
    try {
      up = await this.billing.available();
    } catch {
      up = false;
    }
    if (!up) {
      if (current()) this.store.setState({ available: false });
      return;
    }
    // Ownership first: acknowledging must never depend on the product catalogue loading.
    let owned: OwnedTip[];
    try {
      owned = await this.billing.owned();
    } catch {
      if (current()) this.store.setState({ available: false });
      return;
    }
    for (const o of owned) {
      if (o.state === 'owned' && !o.acknowledged) await this.billing.acknowledge(o.token).catch(() => {});
    }
    let products: TipProduct[] | null;
    try {
      products = await this.billing.products();
    } catch {
      products = null;
    }
    if (!current()) return;
    const ownedIds = owned.filter((o) => o.state === 'owned').map((o) => o.id);
    const pending = owned.filter((o) => o.state === 'pending').map((o) => o.id);
    const supporter = ownedIds.length > 0;
    let appearance = this.store.getState().appearance;
    if (!supporter && this.store.getState().supporter) {
      appearance = DEFAULT_APPEARANCE;
      this.memory.setAppearance(appearance);
    }
    this.memory.setSupporter(supporter);
    this.store.setState({ available: products !== null, products: products ?? [], owned: ownedIds, pending, supporter, appearance });
  }

  async buy(id: TipId): Promise<BuyResult | 'busy'> {
    if (this.store.getState().busy) return 'busy';
    this.store.setState({ busy: id });
    let r: BuyResult;
    try {
      r = await this.billing.buy(id);
    } catch {
      r = 'failed';
    }
    this.store.setState({ busy: null });
    if (r === 'owned' || r === 'pending') await this.refresh();
    return r;
  }

  /** App Review's "Restore purchases": resync with the store, then re-read ownership. A failure changes nothing. */
  async restore(): Promise<'restored' | 'none' | 'failed'> {
    try {
      await this.billing.restore();
    } catch {
      return 'failed';
    }
    await this.refresh();
    return this.store.getState().supporter ? 'restored' : 'none';
  }

  setAppearance(patch: Partial<Appearance>): void {
    const st = this.store.getState();
    if (!st.supporter) return;
    const appearance = { ...st.appearance, ...patch };
    this.memory.setAppearance(appearance);
    this.store.setState({ appearance });
  }
}
