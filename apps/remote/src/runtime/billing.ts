import { Platform } from 'react-native';

export const TIP_IDS = ['supporter_2', 'supporter_5', 'supporter_10'] as const;
export type TipId = (typeof TIP_IDS)[number];
export const isTip = (id: string): id is TipId => (TIP_IDS as readonly string[]).includes(id);

export interface TipProduct {
  id: TipId;
  price: string;
}
export interface OwnedTip {
  id: TipId;
  state: 'owned' | 'pending';
  token: string;
  acknowledged: boolean;
}
export type BuyResult = 'owned' | 'pending' | 'cancelled' | 'failed';

/** The app's only view of the store (Play Billing or StoreKit). Both are IPC to the OS store, never a fetch. */
export interface Billing {
  available(): Promise<boolean>;
  products(): Promise<TipProduct[]>;
  owned(): Promise<OwnedTip[]>;
  acknowledge(token: string): Promise<void>;
  buy(id: TipId): Promise<BuyResult>;
  /** Asks the App Store to resync this Apple ID's purchases. Play restores on its own, so it is a no-op there. */
  restore(): Promise<void>;
}

interface PurchaseLike {
  productId: string;
  purchaseState?: string;
  purchaseToken?: string | null;
  isAcknowledgedAndroid?: boolean | null;
  revocationDateIOS?: number | null;
}

/** On iOS a listed entitlement needs no acknowledgement, and a revoked one (refund) is not owned. */
export function toOwned(p: PurchaseLike, os: string): OwnedTip | null {
  if (!isTip(p.productId) || !p.purchaseToken) return null;
  if (os === 'ios' && p.revocationDateIOS) return null;
  const state = p.purchaseState === 'purchased' ? 'owned' : p.purchaseState === 'pending' ? 'pending' : null;
  if (!state) return null;
  return { id: p.productId, state, token: p.purchaseToken, acknowledged: os === 'ios' || p.isAcknowledgedAndroid === true };
}

const BUY_TIMEOUT_MS = 5 * 60_000;

export function storeBilling(os: string = Platform.OS): Billing {
  // Loaded lazily so Jest and web builds never touch the native module.
  const iap = () => require('expo-iap') as typeof import('expo-iap');
  let ready: Promise<boolean> | null = null;
  const connect = () =>
    (ready ??= iap()
      .initConnection()
      .then(Boolean, () => {
        ready = null;
        return false;
      }));
  const purchases = async (): Promise<PurchaseLike[]> => ((await iap().getAvailablePurchases()) ?? []) as unknown as PurchaseLike[];
  return {
    async available() {
      return (os === 'android' || os === 'ios') && (await connect());
    },
    async products() {
      if (!(await connect())) return [];
      const list = ((await iap().fetchProducts({ skus: [...TIP_IDS], type: 'in-app' })) ?? []) as unknown as { id: string; displayPrice: string }[];
      // StoreKit answers in no particular order; show the tiles smallest tip first.
      return list
        .filter((p) => isTip(p.id))
        .map((p) => ({ id: p.id as TipId, price: p.displayPrice }))
        .sort((a, b) => TIP_IDS.indexOf(a.id) - TIP_IDS.indexOf(b.id));
    },
    async owned() {
      if (!(await connect())) throw new Error('billing unavailable');
      return (await purchases()).map((p) => toOwned(p, os)).filter((x): x is OwnedTip => x !== null);
    },
    async acknowledge(token) {
      const p = (await purchases()).find((x) => x.purchaseToken === token);
      if (p) await iap().finishTransaction({ purchase: p as never, isConsumable: false });
    },
    buy(id) {
      return new Promise<BuyResult>((resolve) => {
        const m = iap();
        let done = false;
        const finish = (r: BuyResult) => {
          if (done) return;
          done = true;
          ok.remove();
          err.remove();
          clearTimeout(timer);
          resolve(r);
        };
        const ok = m.purchaseUpdatedListener((p) => {
          const o = toOwned(p as unknown as PurchaseLike, os);
          if (!o || o.id !== id) return;
          // StoreKit redelivers an unfinished transaction on every launch; Play's acknowledge runs in Supporter.refresh.
          if (os === 'ios' && o.state === 'owned') {
            m.finishTransaction({ purchase: p as never, isConsumable: false }).then(
              () => finish('owned'),
              () => finish('owned'),
            );
            return;
          }
          finish(o.state);
        });
        const err = m.purchaseErrorListener((e) => finish(String(e.code) === 'user-cancelled' ? 'cancelled' : 'failed'));
        const timer = setTimeout(() => finish('failed'), BUY_TIMEOUT_MS);
        connect()
          .then(async (up) => {
            if (!up) return finish('failed');
            await m.requestPurchase({ request: os === 'ios' ? { apple: { sku: id } } : { google: { skus: [id] } }, type: 'in-app' });
          })
          .catch(() => finish('failed'));
      });
    },
    async restore() {
      if (os !== 'ios' || !(await connect())) return;
      await iap().restorePurchases();
    },
  };
}
