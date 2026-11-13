import type { Billing, BuyResult, OwnedTip, TipId, TipProduct } from '../../src/runtime/billing';

export class FakeBilling implements Billing {
  isAvailable = true;
  catalog: TipProduct[] = [
    { id: 'supporter_2', price: '€2.00' },
    { id: 'supporter_5', price: '€5.00' },
    { id: 'supporter_10', price: '€10.00' },
  ];
  purchases: OwnedTip[] = [];
  acks: string[] = [];
  buyCalls: TipId[] = [];
  buyResult: BuyResult = 'owned';
  ownedError: Error | null = null;
  buyGate: Promise<void> = Promise.resolve();
  restoreCalls = 0;
  restoreError: Error | null = null;
  /** Purchases the store hands back on restore (another device, a reinstall). */
  onRestore: OwnedTip[] = [];

  async available() {
    return this.isAvailable;
  }
  async products() {
    return this.catalog;
  }
  async owned() {
    if (this.ownedError) throw this.ownedError;
    return this.purchases.map((p) => ({ ...p }));
  }
  async acknowledge(token: string) {
    this.acks.push(token);
    this.purchases = this.purchases.map((p) => (p.token === token ? { ...p, acknowledged: true } : p));
  }
  async buy(id: TipId) {
    this.buyCalls.push(id);
    await this.buyGate;
    if (this.buyResult === 'owned' || this.buyResult === 'pending') {
      this.purchases.push({ id, state: this.buyResult, token: `tok-${id}`, acknowledged: false });
    }
    return this.buyResult;
  }
  async restore() {
    this.restoreCalls++;
    if (this.restoreError) throw this.restoreError;
    this.purchases.push(...this.onRestore);
  }
}
