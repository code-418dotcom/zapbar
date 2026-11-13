# Zapbar Play Store Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Zapbar 1.0.0 to Google Play (internal → production) with a tip jar that unlocks silly perks, a zapbar.app site with a privacy policy enforced by tests, and a launch kit.

**Architecture:**
- **Billing:** behind a small `Billing` interface (`src/runtime/billing.ts`), with an `expo-iap` adapter and a Jest fake. A `Supporter` store (zustand vanilla, like `DeviceManager.ui`) owns ownership, acknowledgement, pending and refund logic, and persists `supporter` + `appearance` in `DeviceMemory`.
- **Theme:** gains runtime accent and font. `useTheme()` reads an `AppearanceContext` and returns `type` (text styles) alongside `c`; `makeStyles` caches per scheme + accent + font.
- **Release:** a config plugin adds release signing to the prebuilt `android/` (gitignored). Node scripts handle versioning and an AAB release check; Python scripts ported from sonora talk to the Play Developer API.
- **Site:** static pages in `apps/site`, served by an nginx container on .210 behind nginx-pm + the Cloudflare tunnel.

**Tech Stack:**
- Expo SDK 58 / RN 0.88, TypeScript 6, Jest (jest-expo) + RNTL 14 (async), zustand, `expo-iap`.
- `@expo-google-fonts/comic-neue`.
- Node 22 scripts (`node:test` for the site).
- Python 3 with `google-api-python-client` + `google-auth` (already installed on the dev machine).
- nginx:alpine.

**Spec:** `docs/specs/2026-10-17-zapbar-release-design.md` (parent `docs/specs/2026-10-16-zapbar-design.md` §7).

## Global Constraints

- **Package and listing:**
  - Package id `app.zapbar.remote`.
  - Title "Zapbar: Remote for HEOS".
  - Short description "The remote HEOS forgot to build. Designed for function, no bloat."
- **Products:** `supporter_2`, `supporter_5`, `supporter_10` are one-time, non-consumable, at €2/€5/€10. **Any tier unlocks every perk.**
- **Perks are app-only:**
  - badge;
  - four alternate accents: `coral #FF9B85`, `sky #7FD3FF`, `amber #FFC857`, `lilac #C9A7FF`;
  - font "Comic Neue — for the lulz".
  - Widgets and the notification stay lime / Plus Jakarta Sans. Comic Sans MS itself is never bundled.
- **Prices:** always Play's localised strings. Never hard-code "€2" in UI.
- **Billing unavailable** → the Support card's tiles are hidden silently. **A failed ownership check never revokes cached perks.** Only a successful `owned()` without a tip revokes them, and revocation resets the accent and font to the defaults.
- **Acknowledge** every owned, unacknowledged purchase, after a buy and during a refresh.
- **Privacy:**
  - The app makes no network calls beyond RFC1918 / link-local / multicast / localhost.
  - No analytics or crash SDKs.
  - Play Billing is IPC, not a fetch.
  - The site has no JavaScript, no cookies, no third-party requests (fonts self-hosted).
- **Permissions (merged, release):** exactly `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `CHANGE_WIFI_MULTICAST_STATE`, `CHANGE_NETWORK_STATE`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CONNECTED_DEVICE`, `POST_NOTIFICATIONS`, `com.android.vending.BILLING`, plus toolchain extras ruled on in Task 5 (expected: `app.zapbar.remote.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE` if a library adds it, which must then be blocked).
- **targetSdk** = 36.
- **versionCode** = major·10000 + minor·100 + patch.
- **Signing:**
  - Upload key `zapbar-upload.jks`, alias `zapbar`, vault scope `zapbar`.
  - A `bundleRelease` without the `ZAPBAR_UPLOAD_*` env **fails**. Never fall back to debug.
  - Debug-signed APK test builds need `-PzapbarDebugSigned=true`.
- **Secrets:**
  - Never print them: use `${VAR:+SET}` for presence checks.
  - Never pipe a password on stdin to a shell that also reads stdin.
  - After every `claudify-secret set`, commit and push `~/projects/vault`.
- **Ask the owner first** (outward-facing):
  - site going live on zapbar.app;
  - enabling email routing;
  - creating products in Play;
  - promoting to production;
  - any public post.
- **Owner-only steps:**
  - Console app creation and first upload;
  - license testers;
  - YouTube upload;
  - device checklist sign-off.
- **Builds:**
  - Container images build on .210, never on janusvps.
  - Android builds on the dev machine. After a failed build, run `~/projects/zapbar/.superpowers/bin/fix-gradle-cache`, then `./gradlew --stop`, and retry, up to 3 times.
  - Environment: `JAVA_HOME=~/tools/jdk-17.0.13+11`, `ANDROID_HOME=~/android-sdk`.
- **Live soundbar 10.0.0.82:**
  - Screenshots use app-side nicknames only.
  - Never write the bar's name.
  - Never call `system/check_account`.
- **Branch:** `feat/release` from `main`.
- **Commits** end with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F
  ```
- **Library versions** are newer than the plan author's training data. If `expo-iap`, Expo or a Play API differs from this plan, adapt with the smallest change and ledger a ruling.
- **Test commands:**
  - App: `cd apps/remote && npx jest` and `npx tsc --noEmit`.
  - heos-core: `cd packages/heos-core && npx vitest run`.
  - Site: `cd apps/site && node --test`.
  - Kotlin: `cd apps/remote/android && ./gradlew :zapbar-quick:testDebugUnitTest`.

## Review Focus

1. **The app is killed mid-purchase**, so the purchase lands but is never acknowledged. On the next launch, refresh acknowledges it and unlocks the perks (otherwise Play refunds it after 3 days). Task 2 test: "acknowledges an owned purchase found at launch".
2. **Offline launch or Play Store hiccup:** `owned()` throws. Cached perks stay on; only the purchase tiles hide. Task 2 test: "a failed ownership check keeps cached perks".
3. **Double-tap on a tip tile.** Only one purchase flow starts. Task 2 test: "a second buy while one is in flight is ignored".
4. **Refund while Comic Neue and coral are selected.** Font and accent revert, and no stale style cache shows the old font. Task 2 test: "revocation resets appearance". Task 3 test: "switching appearance re-renders with the new font".
5. **The privacy page and the code drift apart** (someone adds a fetch to a public host or an analytics SDK). The claims test fails. Task 6 tests: "every host literal is local" and "no analytics or crash SDKs".

---

### Task 1: Billing interface and expo-iap adapter

**Files:**
- Create: `apps/remote/src/runtime/billing.ts`
- Create: `apps/remote/__tests__/billing.test.ts`
- Create: `apps/remote/__tests__/fakes/fake-billing.ts`
- Modify: `apps/remote/package.json` (dependency `expo-iap`), `apps/remote/app.json` (plugin `expo-iap` if its README requires one)

**Interfaces:**
- Produces:
  ```ts
  export const TIP_IDS = ['supporter_2', 'supporter_5', 'supporter_10'] as const;
  export type TipId = (typeof TIP_IDS)[number];
  export const isTip = (id: string): id is TipId;
  export interface TipProduct { id: TipId; price: string }
  export interface OwnedTip { id: TipId; state: 'owned' | 'pending'; token: string; acknowledged: boolean }
  export type BuyResult = 'owned' | 'pending' | 'cancelled' | 'failed';
  export interface Billing {
    available(): Promise<boolean>;
    products(): Promise<TipProduct[]>;
    owned(): Promise<OwnedTip[]>;
    acknowledge(token: string): Promise<void>;
    buy(id: TipId): Promise<BuyResult>;
  }
  export function toOwned(p: { productId: string; purchaseState?: string; purchaseToken?: string | null; isAcknowledgedAndroid?: boolean | null }): OwnedTip | null;
  export function playBilling(): Billing; // expo-iap adapter
  ```
- `FakeBilling` (test util) implements `Billing` with public fields: `isAvailable`, `catalog`, `purchases`, `acks: string[]`, `buyResult`, `buyCalls`, `ownedError`, `buyGate` (a Promise the fake awaits inside `buy`).

- [ ] **Step 1: Install and confirm the library builds**

```bash
cd ~/projects/zapbar && git checkout -b feat/release
cd apps/remote && npx expo install expo-iap
```

Read `node_modules/expo-iap/README.md` (and its CHANGELOG head) for:
- SDK 58 / RN 0.88 support;
- whether a config plugin entry is needed;
- the exact names of `initConnection`, `fetchProducts`, `getAvailablePurchases`, `requestPurchase`, `finishTransaction`, `purchaseUpdatedListener`, `purchaseErrorListener`, the user-cancel error code, and the Purchase fields (`productId`, `purchaseState`, `purchaseToken`, `isAcknowledgedAndroid`).

If it does not support SDK 58, switch to `react-native-iap` behind the same interface and ledger it.

Run: `npx expo prebuild --platform android --clean && cd android && ./gradlew :app:assembleDebug -PreactNativeArchitectures=x86_64 > ../../../.superpowers/iap-build.log 2>&1; echo $?`
Expected: `0`, and `grep -c "com.android.vending.BILLING" app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml` (or the equivalent merged manifest path) prints ≥1.

- [ ] **Step 2: Write the failing test**

`apps/remote/__tests__/billing.test.ts`:

```ts
import { isTip, toOwned } from '../src/runtime/billing';

it('recognises only the three tip products', () => {
  expect(isTip('supporter_2')).toBe(true);
  expect(isTip('supporter_10')).toBe(true);
  expect(isTip('premium')).toBe(false);
});

it('maps a purchased, unacknowledged Play purchase', () => {
  expect(toOwned({ productId: 'supporter_5', purchaseState: 'purchased', purchaseToken: 'tok', isAcknowledgedAndroid: false })).toEqual({
    id: 'supporter_5', state: 'owned', token: 'tok', acknowledged: false,
  });
});

it('maps a pending purchase and ignores foreign products', () => {
  expect(toOwned({ productId: 'supporter_2', purchaseState: 'pending', purchaseToken: 't2' })?.state).toBe('pending');
  expect(toOwned({ productId: 'something_else', purchaseState: 'purchased', purchaseToken: 't' })).toBeNull();
});

it('drops purchases without a token', () => {
  expect(toOwned({ productId: 'supporter_2', purchaseState: 'purchased', purchaseToken: null })).toBeNull();
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/remote && npx jest __tests__/billing.test.ts`
Expected: FAIL, "Cannot find module '../src/runtime/billing'".

- [ ] **Step 4: Implement**

`apps/remote/src/runtime/billing.ts`:

```ts
import { Platform } from 'react-native';

export const TIP_IDS = ['supporter_2', 'supporter_5', 'supporter_10'] as const;
export type TipId = (typeof TIP_IDS)[number];
export const isTip = (id: string): id is TipId => (TIP_IDS as readonly string[]).includes(id);

export interface TipProduct { id: TipId; price: string }
export interface OwnedTip { id: TipId; state: 'owned' | 'pending'; token: string; acknowledged: boolean }
export type BuyResult = 'owned' | 'pending' | 'cancelled' | 'failed';

/** The app's only view of Play Billing. Play Billing is IPC to the Play Store app, never a fetch. */
export interface Billing {
  available(): Promise<boolean>;
  products(): Promise<TipProduct[]>;
  owned(): Promise<OwnedTip[]>;
  acknowledge(token: string): Promise<void>;
  buy(id: TipId): Promise<BuyResult>;
}

interface PurchaseLike { productId: string; purchaseState?: string; purchaseToken?: string | null; isAcknowledgedAndroid?: boolean | null }

export function toOwned(p: PurchaseLike): OwnedTip | null {
  if (!isTip(p.productId) || !p.purchaseToken) return null;
  return { id: p.productId, state: p.purchaseState === 'pending' ? 'pending' : 'owned', token: p.purchaseToken, acknowledged: p.isAcknowledgedAndroid === true };
}

const BUY_TIMEOUT_MS = 5 * 60_000;

export function playBilling(): Billing {
  // Loaded lazily so Jest and non-Android builds never touch the native module.
  const iap = () => require('expo-iap') as typeof import('expo-iap');
  let ready: Promise<boolean> | null = null;
  const connect = () => (ready ??= iap().initConnection().then(Boolean, () => { ready = null; return false; }));
  const purchases = async (): Promise<PurchaseLike[]> => (await iap().getAvailablePurchases()) as unknown as PurchaseLike[];
  return {
    async available() {
      return Platform.OS === 'android' && (await connect());
    },
    async products() {
      if (!(await connect())) return [];
      const list = ((await iap().fetchProducts({ skus: [...TIP_IDS], type: 'in-app' })) ?? []) as unknown as { id: string; displayPrice: string }[];
      return list.filter((p) => isTip(p.id)).map((p) => ({ id: p.id as TipId, price: p.displayPrice }));
    },
    async owned() {
      if (!(await connect())) throw new Error('billing unavailable');
      return (await purchases()).map(toOwned).filter((x): x is OwnedTip => x !== null);
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
        const ok = m.purchaseUpdatedListener((p: unknown) => {
          const o = toOwned(p as PurchaseLike);
          if (o && o.id === id) finish(o.state);
        });
        const err = m.purchaseErrorListener((e: { code?: string }) => finish(String(e.code).toLowerCase().includes('cancel') ? 'cancelled' : 'failed'));
        const timer = setTimeout(() => finish('failed'), BUY_TIMEOUT_MS);
        connect()
          .then((up) => (up ? m.requestPurchase({ request: { google: { skus: [id] } }, type: 'in-app' } as never) : finish('failed')))
          .catch(() => finish('failed'));
      });
    },
  };
}
```

If Step 1's reading showed different names or fields, adapt only the adapter body, keep the interface, and ledger it.

`apps/remote/__tests__/fakes/fake-billing.ts`:

```ts
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

  async available() { return this.isAvailable; }
  async products() { return this.catalog; }
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
}
```

Jest picks up files under `__tests__/fakes/` as tests unless excluded. Add `"testPathIgnorePatterns": ["/node_modules/", "/__tests__/fakes/"]` to the jest config in `apps/remote/package.json`, keeping the existing entries.

- [ ] **Step 5: Run tests**

Run: `npx jest __tests__/billing.test.ts && npx jest && npx tsc --noEmit`
Expected: billing 4/4 PASS; full suite green; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add apps/remote && git commit -m "feat(remote): Billing interface with an expo-iap adapter and a fake"
```

---

### Task 2: Supporter store and persisted perks

**Files:**
- Create: `apps/remote/src/runtime/supporter.ts`
- Modify: `apps/remote/src/runtime/memory.ts` (supporter + appearance)
- Modify: `apps/remote/src/theme.ts` (only the `Appearance` types and defaults; Task 3 does the rest)
- Test: `apps/remote/__tests__/supporter.test.ts`, `apps/remote/__tests__/memory.test.ts`

**Interfaces:**
- Consumes: `Billing`, `TipId`, `TipProduct`, `OwnedTip` (Task 1); `DeviceMemory`, `memoryKv` (memory.ts).
- Produces:
  ```ts
  // theme.ts
  export type AccentId = 'lime' | 'coral' | 'sky' | 'amber' | 'lilac';
  export type FontId = 'jakarta' | 'comic';
  export interface Appearance { accent: AccentId; font: FontId }
  export const DEFAULT_APPEARANCE: Appearance; // { accent: 'lime', font: 'jakarta' }
  // memory.ts (DeviceMemory)
  supporter(): boolean; setSupporter(v: boolean): void;
  appearance(): Appearance; setAppearance(a: Appearance): void;
  // supporter.ts
  export interface SupporterState { available: boolean; products: TipProduct[]; owned: TipId[]; pending: TipId[]; busy: TipId | null; supporter: boolean; appearance: Appearance }
  export class Supporter {
    constructor(billing: Billing, memory: DeviceMemory);
    readonly store: StoreApi<SupporterState>;
    refresh(): Promise<void>;
    buy(id: TipId): Promise<BuyResult | 'busy'>;
    setAppearance(patch: Partial<Appearance>): void;
  }
  export const effectiveAppearance: (s: Pick<SupporterState, 'supporter' | 'appearance'>) => Appearance;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `apps/remote/__tests__/memory.test.ts`:

```ts
it('persists the supporter flag and appearance, with safe defaults', () => {
  const m = new DeviceMemory(memoryKv());
  expect(m.supporter()).toBe(false);
  expect(m.appearance()).toEqual({ accent: 'lime', font: 'jakarta' });
  m.setSupporter(true);
  m.setAppearance({ accent: 'coral', font: 'comic' });
  expect(m.supporter()).toBe(true);
  expect(m.appearance()).toEqual({ accent: 'coral', font: 'comic' });
});

it('ignores an unknown stored accent or font', () => {
  const kv = memoryKv();
  kv.setItemSync('appearance', JSON.stringify({ accent: 'hotpink', font: 'papyrus' }));
  expect(new DeviceMemory(kv).appearance()).toEqual({ accent: 'lime', font: 'jakarta' });
});
```

(If `memory.test.ts` does not import `memoryKv` yet, add it to the import line.)

`apps/remote/__tests__/supporter.test.ts`:

```ts
import { DeviceMemory, memoryKv } from '../src/runtime/memory';
import { effectiveAppearance, Supporter } from '../src/runtime/supporter';
import { FakeBilling } from './fakes/fake-billing';

const setup = () => {
  const billing = new FakeBilling();
  const memory = new DeviceMemory(memoryKv());
  return { billing, memory, s: new Supporter(billing, memory) };
};

it('loads products and marks a buyer of any tier as a supporter', async () => {
  const { billing, s, memory } = setup();
  billing.purchases = [{ id: 'supporter_2', state: 'owned', token: 't', acknowledged: true }];
  await s.refresh();
  const st = s.store.getState();
  expect(st.available).toBe(true);
  expect(st.products.map((p) => p.price)).toEqual(['€2.00', '€5.00', '€10.00']);
  expect(st.owned).toEqual(['supporter_2']);
  expect(st.supporter).toBe(true);
  expect(memory.supporter()).toBe(true);
});

it('acknowledges an owned purchase found at launch', async () => {
  const { billing, s } = setup();
  billing.purchases = [{ id: 'supporter_5', state: 'owned', token: 'late', acknowledged: false }];
  await s.refresh();
  expect(billing.acks).toEqual(['late']);
  expect(s.store.getState().supporter).toBe(true);
});

it('shows pending without unlocking, then unlocks once it completes', async () => {
  const { billing, s } = setup();
  billing.purchases = [{ id: 'supporter_10', state: 'pending', token: 'p', acknowledged: false }];
  await s.refresh();
  expect(s.store.getState()).toMatchObject({ pending: ['supporter_10'], owned: [], supporter: false });
  expect(billing.acks).toEqual([]);
  billing.purchases = [{ id: 'supporter_10', state: 'owned', token: 'p', acknowledged: false }];
  await s.refresh();
  expect(s.store.getState()).toMatchObject({ pending: [], owned: ['supporter_10'], supporter: true });
});

it('hides the tiles when billing is unavailable', async () => {
  const { billing, s } = setup();
  billing.isAvailable = false;
  await s.refresh();
  expect(s.store.getState().available).toBe(false);
});

it('a failed ownership check keeps cached perks', async () => {
  const { billing, s, memory } = setup();
  memory.setSupporter(true);
  memory.setAppearance({ accent: 'sky', font: 'comic' });
  const fresh = new Supporter(billing, memory);
  billing.ownedError = new Error('offline');
  await fresh.refresh();
  expect(fresh.store.getState()).toMatchObject({ available: false, supporter: true, appearance: { accent: 'sky', font: 'comic' } });
  expect(memory.supporter()).toBe(true);
});

it('revocation resets appearance', async () => {
  const { billing, s, memory } = setup();
  billing.purchases = [{ id: 'supporter_2', state: 'owned', token: 't', acknowledged: true }];
  await s.refresh();
  s.setAppearance({ accent: 'coral', font: 'comic' });
  billing.purchases = []; // refunded
  await s.refresh();
  expect(s.store.getState()).toMatchObject({ supporter: false, appearance: { accent: 'lime', font: 'jakarta' } });
  expect(memory.appearance()).toEqual({ accent: 'lime', font: 'jakarta' });
});

it('buys, acknowledges and unlocks', async () => {
  const { billing, s } = setup();
  await s.refresh();
  expect(await s.buy('supporter_5')).toBe('owned');
  expect(billing.acks).toEqual(['tok-supporter_5']);
  expect(s.store.getState()).toMatchObject({ owned: ['supporter_5'], supporter: true, busy: null });
});

it('a cancelled buy changes nothing', async () => {
  const { billing, s } = setup();
  await s.refresh();
  billing.buyResult = 'cancelled';
  expect(await s.buy('supporter_2')).toBe('cancelled');
  expect(s.store.getState()).toMatchObject({ supporter: false, busy: null });
});

it('a second buy while one is in flight is ignored', async () => {
  const { billing, s } = setup();
  await s.refresh();
  let open!: () => void;
  billing.buyGate = new Promise((r) => (open = r));
  const first = s.buy('supporter_2');
  expect(s.store.getState().busy).toBe('supporter_2');
  expect(await s.buy('supporter_10')).toBe('busy');
  open();
  await first;
  expect(billing.buyCalls).toEqual(['supporter_2']);
});

it('only supporters can change appearance, and non-supporters render the defaults', async () => {
  const { billing, s } = setup();
  await s.refresh();
  s.setAppearance({ font: 'comic' });
  expect(s.store.getState().appearance.font).toBe('jakarta');
  expect(effectiveAppearance({ supporter: false, appearance: { accent: 'coral', font: 'comic' } })).toEqual({ accent: 'lime', font: 'jakarta' });
  billing.purchases = [{ id: 'supporter_2', state: 'owned', token: 't', acknowledged: true }];
  await s.refresh();
  s.setAppearance({ font: 'comic' });
  expect(s.store.getState().appearance).toEqual({ accent: 'lime', font: 'comic' });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest __tests__/supporter.test.ts __tests__/memory.test.ts`
Expected: FAIL. The supporter module isn't found and `m.supporter is not a function`.

- [ ] **Step 3: Implement**

In `apps/remote/src/theme.ts`, add below `FOREST`:

```ts
export type AccentId = 'lime' | 'coral' | 'sky' | 'amber' | 'lilac';
export type FontId = 'jakarta' | 'comic';
export interface Appearance { accent: AccentId; font: FontId }
export const DEFAULT_APPEARANCE: Appearance = { accent: 'lime', font: 'jakarta' };
export const ACCENT_IDS: readonly AccentId[] = ['lime', 'coral', 'sky', 'amber', 'lilac'];
export const FONT_IDS: readonly FontId[] = ['jakarta', 'comic'];
```

In `memory.ts`:
- add `supporter: 'supporter'` and `appearance: 'appearance'` to `K`;
- import `ACCENT_IDS, DEFAULT_APPEARANCE, FONT_IDS, type Appearance` from `'../theme'`;
- add to `DeviceMemory`:

```ts
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
    };
  }

  setAppearance(a: Appearance): void {
    this.write(K.appearance, a);
  }
```

`apps/remote/src/runtime/supporter.ts`:

```ts
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

  constructor(private readonly billing: Billing, private readonly memory: DeviceMemory) {
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

  async refresh(): Promise<void> {
    let up = false;
    try {
      up = await this.billing.available();
    } catch {
      up = false;
    }
    if (!up) {
      this.store.setState({ available: false });
      return;
    }
    let products: TipProduct[];
    let owned: OwnedTip[];
    try {
      [products, owned] = await Promise.all([this.billing.products(), this.billing.owned()]);
    } catch {
      this.store.setState({ available: false });
      return;
    }
    for (const o of owned) {
      if (o.state === 'owned' && !o.acknowledged) await this.billing.acknowledge(o.token).catch(() => {});
    }
    const ownedIds = owned.filter((o) => o.state === 'owned').map((o) => o.id);
    const pending = owned.filter((o) => o.state === 'pending').map((o) => o.id);
    const supporter = ownedIds.length > 0;
    let appearance = this.store.getState().appearance;
    if (!supporter && this.store.getState().supporter) {
      appearance = DEFAULT_APPEARANCE;
      this.memory.setAppearance(appearance);
    }
    this.memory.setSupporter(supporter);
    this.store.setState({ available: true, products, owned: ownedIds, pending, supporter, appearance });
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

  setAppearance(patch: Partial<Appearance>): void {
    const st = this.store.getState();
    if (!st.supporter) return;
    const appearance = { ...st.appearance, ...patch };
    this.memory.setAppearance(appearance);
    this.store.setState({ appearance });
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/supporter.test.ts __tests__/memory.test.ts && npx jest && npx tsc --noEmit`
Expected: supporter 10/10 and memory PASS; full suite green; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add apps/remote && git commit -m "feat(remote): Supporter store (any tier unlocks, ack on refresh, pending, refund revokes, offline keeps perks)"
```

---

### Task 3: Runtime accent and font in the theme

**Files:**
- Modify: `apps/remote/src/theme.ts`
- Modify: `apps/remote/src/ui/FontGate.tsx` (load Comic Neue)
- Modify, mechanical sweep (`textStyle.` → `type.`, `({ c })` → `({ c, type })` in `makeStyles`): `EqSheet.tsx`, `InputGrid.tsx`, `InputsEditor.tsx`, `Pill.tsx`, `RemoteView.tsx`, `SettingsView.tsx`, `SetupView.tsx`, `SoundRow.tsx`, `Toast.tsx`, `TopCard.tsx`, `VolumeBar.tsx` under `apps/remote/src/ui/`
- Modify: `apps/remote/package.json` (`@expo-google-fonts/comic-neue`)
- Test: `apps/remote/__tests__/theme.test.ts` (create, or append if it exists)

**Interfaces:**
- Consumes: `AccentId`, `FontId`, `Appearance`, `DEFAULT_APPEARANCE` (Task 2).
- Produces:
  ```ts
  export const ACCENTS: Record<AccentId, { label: string; dark: { accent: string; onAccent: string }; light: { accent: string; onAccent: string } }>;
  export const FONTS: Record<FontId, { label: string; medium: string; bold: string; extraBold: string }>;
  export const typeFor: (f: { medium: string; bold: string; extraBold: string }) => TextStyles;
  export const AppearanceContext: React.Context<Appearance>;
  export interface Theme { scheme: Scheme; c: Palette; type: TextStyles; appearance: Appearance }
  ```
  `textStyle` stays exported as `typeFor(FONTS.jakarta)` for any non-hook use.

- [ ] **Step 1: Write the failing tests**

`apps/remote/__tests__/theme.test.ts` (append if the file exists; keep its imports):

```tsx
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ACCENTS, AppearanceContext, contrast, FONTS, makeStyles, palettes, ThemeOverride, useTheme } from '../src/theme';

it('every accent keeps AA contrast for its on-accent text in both schemes, and stands out on the dark background', () => {
  for (const [id, a] of Object.entries(ACCENTS)) {
    for (const scheme of ['dark', 'light'] as const) {
      expect([id, scheme, contrast(a[scheme].accent, a[scheme].onAccent) >= 4.5]).toEqual([id, scheme, true]);
    }
    expect([id, contrast(a.dark.accent, palettes.dark.bg) >= 3]).toEqual([id, true]);
  }
});

it('lime is exactly the Plan 3 palette', () => {
  expect(ACCENTS.lime.dark).toEqual({ accent: palettes.dark.accent, onAccent: palettes.dark.onAccent });
  expect(ACCENTS.lime.light).toEqual({ accent: palettes.light.accent, onAccent: palettes.light.onAccent });
});

const useS = makeStyles(({ c, type }) => ({ t: { ...type.body, color: c.accent } }));
function Probe() {
  const s = useS();
  const { c } = useTheme();
  return <Text testID="probe" style={s.t}>{c.onAccent}</Text>;
}

it('switching appearance re-renders with the new font and accent', async () => {
  const tree = (font: 'jakarta' | 'comic', accent: 'lime' | 'coral') => (
    <ThemeOverride.Provider value="dark">
      <AppearanceContext.Provider value={{ font, accent }}>
        <Probe />
      </AppearanceContext.Provider>
    </ThemeOverride.Provider>
  );
  const r = await render(tree('jakarta', 'lime'));
  expect(screen.getByTestId('probe')).toHaveStyle({ fontFamily: FONTS.jakarta.medium, color: ACCENTS.lime.dark.accent });
  await r.rerender(tree('comic', 'coral'));
  expect(screen.getByTestId('probe')).toHaveStyle({ fontFamily: FONTS.comic.medium, color: ACCENTS.coral.dark.accent });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest __tests__/theme.test.ts`
Expected: FAIL. `ACCENTS`, `AppearanceContext` and `FONTS` are not exported.

- [ ] **Step 3: Implement theme changes**

Install: `npx expo install @expo-google-fonts/comic-neue`.

In `theme.ts`:
- Replace `export const font = {...}` and `export const textStyle = {...} as const;` with:

```ts
export const FONTS: Record<FontId, { label: string; medium: string; bold: string; extraBold: string }> = {
  jakarta: { label: 'Plus Jakarta Sans', medium: 'PlusJakartaSans_500Medium', bold: 'PlusJakartaSans_700Bold', extraBold: 'PlusJakartaSans_800ExtraBold' },
  // Comic Neue (SIL OFL) is the bundleable stand-in for Comic Sans MS, which is Microsoft-licensed.
  comic: { label: 'Comic Neue — for the lulz', medium: 'ComicNeue_400Regular', bold: 'ComicNeue_700Bold', extraBold: 'ComicNeue_700Bold' },
};
export const font = FONTS.jakarta;

export const typeFor = (f: { medium: string; bold: string; extraBold: string }) =>
  ({
    display: { fontFamily: f.extraBold, fontSize: 28 },
    room: { fontFamily: f.extraBold, fontSize: 22 },
    cardTitle: { fontFamily: f.extraBold, fontSize: 18 },
    tile: { fontFamily: f.bold, fontSize: 13 },
    body: { fontFamily: f.medium, fontSize: 15 },
    secondary: { fontFamily: f.medium, fontSize: 13 },
    chip: { fontFamily: f.bold, fontSize: 14 },
  }) as const;
export type TextStyles = ReturnType<typeof typeFor>;
export const textStyle = typeFor(FONTS.jakarta);

export const ACCENTS: Record<AccentId, { label: string; dark: { accent: string; onAccent: string }; light: { accent: string; onAccent: string } }> = {
  lime: { label: 'Lime', dark: { accent: LIME, onAccent: FOREST }, light: { accent: FOREST, onAccent: LIME } },
  coral: { label: 'Coral', dark: { accent: '#FF9B85', onAccent: FOREST }, light: { accent: FOREST, onAccent: '#FF9B85' } },
  sky: { label: 'Sky', dark: { accent: '#7FD3FF', onAccent: FOREST }, light: { accent: FOREST, onAccent: '#7FD3FF' } },
  amber: { label: 'Amber', dark: { accent: '#FFC857', onAccent: FOREST }, light: { accent: FOREST, onAccent: '#FFC857' } },
  lilac: { label: 'Lilac', dark: { accent: '#C9A7FF', onAccent: FOREST }, light: { accent: FOREST, onAccent: '#C9A7FF' } },
};

export const AppearanceContext = createContext<Appearance>(DEFAULT_APPEARANCE);
```

- Change `Theme`, `useTheme` and `makeStyles`:

```ts
export interface Theme {
  scheme: Scheme;
  c: Palette;
  type: TextStyles;
  appearance: Appearance;
}

const themes = new Map<string, Theme>();
const themeKey = (scheme: Scheme, a: Appearance) => `${scheme}|${a.accent}|${a.font}`;

export function themeFor(scheme: Scheme, a: Appearance): Theme {
  const key = themeKey(scheme, a);
  let t = themes.get(key);
  if (!t) {
    t = { scheme, c: { ...palettes[scheme], ...ACCENTS[a.accent][scheme] }, type: typeFor(FONTS[a.font]), appearance: a };
    themes.set(key, t);
  }
  return t;
}

export function useTheme(): Theme {
  const scheme = schemeFrom(useColorScheme(), useContext(ThemeOverride));
  return themeFor(scheme, useContext(AppearanceContext));
}

export function makeStyles<T extends StyleInput>(fn: (t: Theme) => T): () => Readonly<T> {
  const cache = new Map<string, Readonly<T>>();
  return function useStyles(): Readonly<T> {
    const t = useTheme();
    const key = themeKey(t.scheme, t.appearance);
    let styles = cache.get(key);
    if (!styles) {
      styles = StyleSheet.create(fn(t));
      cache.set(key, styles);
    }
    return styles;
  };
}
```

`FontGate.tsx`: import `ComicNeue_400Regular, ComicNeue_700Bold` from `@expo-google-fonts/comic-neue` and add both to the `useFonts({...})` object.

- [ ] **Step 4: Sweep the UI files**

```bash
cd apps/remote/src/ui
sed -i 's/makeStyles((\({ c }\)) =>/makeStyles(({ c, type }) =>/; s/\btextStyle\./type./g' EqSheet.tsx InputGrid.tsx InputsEditor.tsx Pill.tsx RemoteView.tsx SettingsView.tsx SetupView.tsx SoundRow.tsx Toast.tsx TopCard.tsx VolumeBar.tsx
grep -n "textStyle" *.tsx
```

Expected: only import lines remain. Remove `textStyle` from each file's `../theme` import. If a file uses `type.` outside a `makeStyles` callback (tsc will say `Cannot find name 'type'`), take `type` from `useTheme()` there instead.

- [ ] **Step 5: Run tests**

Run: `cd apps/remote && npx tsc --noEmit && npx jest`
Expected: tsc clean; theme tests PASS; full suite green with no snapshot or style regressions.

- [ ] **Step 6: Commit**

```bash
git add apps/remote && git commit -m "feat(remote): runtime accent and font (Comic Neue) in the theme"
```

---

### Task 4: Support card, pickers and the badge

**Files:**
- Create: `apps/remote/src/ui/SupportCard.tsx`
- Modify: `apps/remote/src/ui/SettingsView.tsx` (render the card; the About line)
- Modify: `apps/remote/src/ui/RemoteView.tsx` (`supporter` prop → heart next to the Z)
- Modify: `apps/remote/src/runtime/RuntimeProvider.tsx` (create `Supporter`, `useSupporter`, `useSupporterState`, provide `AppearanceContext`, refresh on launch and foreground)
- Modify: `apps/remote/app/settings/index.tsx`, `apps/remote/app/remote.tsx`
- Test: `apps/remote/__tests__/support-card.test.tsx`, `apps/remote/__tests__/remote.test.tsx`, `apps/remote/__tests__/runtime.test.tsx`

**Interfaces:**
- Consumes: `Supporter`, `SupporterState`, `effectiveAppearance` (Task 2); `ACCENTS`, `FONTS`, `ACCENT_IDS`, `FONT_IDS`, `AppearanceContext` (Tasks 2–3); `playBilling` (Task 1).
- Produces:
  ```ts
  // SupportCard.tsx
  export function SupportCard(props: { state: SupporterState; onBuy(id: TipId): void; onAppearance(p: Partial<Appearance>): void }): JSX.Element | null;
  // RuntimeProvider.tsx
  export function useSupporter(): Supporter;
  export function useSupporterState<T>(sel: (s: SupporterState) => T): T;
  // RuntimeProvider props gain: supporter?: Supporter (tests inject one built on FakeBilling)
  // RemoteView props gain: supporter?: boolean
  ```

**Ruling carried from planning:** the spec puts the badge "next to the Z in Settings", but Settings has no Z. The badge goes next to the Z on the remote header (RemoteView line ~66), where the Z is, and the Support card shows "♥ Supporter, thank you". Ledger this.

- [ ] **Step 1: Write the failing tests**

`apps/remote/__tests__/support-card.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { SupporterState } from '../src/runtime/supporter';
import { SupportCard } from '../src/ui/SupportCard';

const base: SupporterState = {
  available: true,
  products: [
    { id: 'supporter_2', price: '€2.00' },
    { id: 'supporter_5', price: '€5.00' },
    { id: 'supporter_10', price: '€10.00' },
  ],
  owned: [],
  pending: [],
  busy: null,
  supporter: false,
  appearance: { accent: 'lime', font: 'jakarta' },
};
const h = () => ({ onBuy: jest.fn(), onAppearance: jest.fn() });

it("shows Play's prices and the honest line, and buys a tier", async () => {
  const x = h();
  await render(<SupportCard state={base} {...x} />);
  expect(screen.getByText('Zapbar is free and stays free. Tips unlock a badge and extra colours, nothing else.')).toBeTruthy();
  await fireEvent.press(screen.getByText('€5.00'));
  expect(x.onBuy).toHaveBeenCalledWith('supporter_5');
  expect(screen.queryByText('Accent colour')).toBeNull();
});

it('renders nothing when billing is unavailable and the user is not a supporter', async () => {
  await render(<SupportCard state={{ ...base, available: false, products: [] }} {...h()} />);
  expect(screen.queryByText(/free and stays free/)).toBeNull();
});

it('marks owned and pending tiers', async () => {
  await render(<SupportCard state={{ ...base, owned: ['supporter_2'], pending: ['supporter_10'], supporter: true }} {...h()} />);
  expect(screen.getByLabelText('€2.00, owned')).toBeTruthy();
  expect(screen.getByText('Pending')).toBeTruthy();
});

it('a supporter picks an accent and the Comic Neue font, even offline', async () => {
  const x = h();
  await render(<SupportCard state={{ ...base, available: false, products: [], supporter: true }} {...x} />);
  expect(screen.getByText('♥ Supporter, thank you')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Coral'));
  expect(x.onAppearance).toHaveBeenCalledWith({ accent: 'coral' });
  await fireEvent.press(screen.getByText('Comic Neue — for the lulz'));
  expect(x.onAppearance).toHaveBeenCalledWith({ font: 'comic' });
});

it('disables the tiles while a purchase runs', async () => {
  const x = h();
  await render(<SupportCard state={{ ...base, busy: 'supporter_2' }} {...x} />);
  await fireEvent.press(screen.getByText('€10.00'));
  expect(x.onBuy).not.toHaveBeenCalled();
});
```

In `__tests__/remote.test.tsx`, add a test using the file's existing render helper/props:

```tsx
it('shows the supporter heart next to the Z', async () => {
  await renderRemote({ supporter: true }); // use the file's existing helper; pass supporter through to RemoteView
  expect(screen.getByLabelText('Supporter')).toBeTruthy();
});
```

If `remote.test.tsx` has no helper, render `RemoteView` with the same props its first test uses, plus `supporter`.

In `__tests__/runtime.test.tsx`, add a test that a `RuntimeProvider` given `supporter={new Supporter(fake, memory)}` calls `refresh()` once on mount. Spy with `jest.spyOn(supporter, 'refresh')`. Use the file's existing provider-rendering pattern for the manager and quick props.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest __tests__/support-card.test.tsx __tests__/remote.test.tsx __tests__/runtime.test.tsx`
Expected: FAIL. `SupportCard` doesn't exist, the "Supporter" label is not found, and refresh is never called.

- [ ] **Step 3: Implement**

`apps/remote/src/ui/SupportCard.tsx`:

```tsx
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { TipId } from '../runtime/billing';
import type { SupporterState } from '../runtime/supporter';
import { ACCENT_IDS, ACCENTS, FONT_IDS, FONTS, makeStyles, radii, space, useTheme, type Appearance } from '../theme';

interface Props {
  state: SupporterState;
  onBuy(id: TipId): void;
  onAppearance(p: Partial<Appearance>): void;
}

export function SupportCard({ state, onBuy, onAppearance }: Props) {
  const { c, scheme } = useTheme();
  const s = useStyles();
  if (!state.available && !state.supporter) return null;
  return (
    <>
      <Text style={s.section}>Support Zapbar</Text>
      <View style={s.card}>
        {state.supporter && <Text style={s.badge}>♥ Supporter, thank you</Text>}
        <Text style={s.sub}>Zapbar is free and stays free. Tips unlock a badge and extra colours, nothing else.</Text>
        {state.available && (
          <View style={s.tiles}>
            {state.products.map((p) => {
              const owned = state.owned.includes(p.id);
              const pending = state.pending.includes(p.id);
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={owned ? `${p.price}, owned` : p.price}
                  disabled={owned || pending || state.busy !== null}
                  onPress={() => onBuy(p.id)}
                  style={[s.tile, owned && s.tileOwned]}
                >
                  <Text style={[s.price, owned && s.priceOwned]}>{p.price}</Text>
                  {owned && <MaterialCommunityIcons name="check" size={18} color={c.onAccent} />}
                  {pending && <Text style={s.sub}>Pending</Text>}
                </Pressable>
              );
            })}
          </View>
        )}
        {state.supporter && (
          <>
            <Text style={s.label}>Accent colour</Text>
            <View style={s.swatches}>
              {ACCENT_IDS.map((id) => (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={ACCENTS[id].label}
                  accessibilityState={{ selected: state.appearance.accent === id }}
                  onPress={() => onAppearance({ accent: id })}
                  style={[s.swatch, { backgroundColor: scheme === 'dark' ? ACCENTS[id].dark.accent : ACCENTS[id].light.onAccent }, state.appearance.accent === id && s.swatchOn]}
                />
              ))}
            </View>
            <Text style={s.label}>Font</Text>
            {FONT_IDS.map((id) => (
              <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: state.appearance.font === id }} onPress={() => onAppearance({ font: id })} style={s.fontRow}>
                <Text style={[s.fontName, { fontFamily: FONTS[id].bold }]}>{FONTS[id].label}</Text>
                {state.appearance.font === id && <MaterialCommunityIcons name="check" size={20} color={c.text} />}
              </Pressable>
            ))}
          </>
        )}
      </View>
    </>
  );
}

const useStyles = makeStyles(({ c, type }) => ({
  section: { ...type.chip, color: c.muted, paddingHorizontal: space(1), paddingTop: space(4) },
  card: { backgroundColor: c.surface, borderRadius: radii.card, padding: space(4), gap: space(3) },
  badge: { ...type.cardTitle, color: c.text },
  sub: { ...type.secondary, color: c.muted },
  label: { ...type.chip, color: c.text, paddingTop: space(2) },
  tiles: { flexDirection: 'row', gap: space(2) },
  tile: { flex: 1, minHeight: 56, borderRadius: radii.tile, backgroundColor: c.surfaceHi, alignItems: 'center', justifyContent: 'center', gap: space(1) },
  tileOwned: { backgroundColor: c.accent },
  price: { ...type.cardTitle, color: c.text },
  priceOwned: { color: c.onAccent },
  swatches: { flexDirection: 'row', gap: space(3) },
  swatch: { width: 40, height: 40, borderRadius: radii.pill, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: c.text },
  fontRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  fontName: { fontSize: 16, color: c.text },
}));
```

Match `section` and `card` to SettingsView's existing `s.section` / `s.card` values: copy them from SettingsView's `useStyles` so the card looks identical to its neighbours.

`SettingsView.tsx`:
- Props gain `support?: { state: SupporterState; onBuy(id: TipId): void; onAppearance(p: Partial<Appearance>): void }`.
- Render `{support && <SupportCard {...support} />}` between the Remote and About sections.
- Change the About line to "Zapbar talks only to devices on your own network and collects no data. Purchases are handled by Google Play."

`RemoteView.tsx`:
- Prop `supporter?: boolean`.
- Right after `<ZMark size={26} color={c.accent} />`:

```tsx
{supporter && <MaterialCommunityIcons accessibilityLabel="Supporter" name="heart" size={14} color={c.accent} />}
```

`RuntimeProvider.tsx`:
- Create a second context `SupCtx`.
- The prop `supporter?: Supporter` defaults to `new Supporter(playBilling(), manager.memory)`, created once with `useState`.
- On mount, `void supporter.refresh()`. Also call it in the existing AppState listener whenever the state becomes `'active'`.
- Wrap the children in:

```tsx
<AppearanceContext.Provider value={appearance}>{children}</AppearanceContext.Provider>
```

  where `const appearance = useStore(supporter.store, (s) => effectiveAppearance(s))`. Because `effectiveAppearance` returns a new object for supporters, select `s.supporter`, `s.appearance.accent` and `s.appearance.font` separately and rebuild the object with `useMemo`, so the context value stays stable.
- Export the hooks:

```ts
export const useSupporter = () => useContext(SupCtx)!;
export const useSupporterState = <T,>(sel: (s: SupporterState) => T) => useStore(useSupporter().store, sel);
```

`app/_layout.tsx`: `RootLayout` calls `useTheme()` above the provider, which is fine because the status bar and background don't depend on the accent. No change needed.

`app/settings/index.tsx`:

```tsx
const sup = useSupporter();
const supState = useSupporterState((s) => s);
// ...
support={{ state: supState, onBuy: (id) => void sup.buy(id), onAppearance: (p) => sup.setAppearance(p) }}
```

Also add `useEffect(() => { void sup.refresh(); }, [sup]);` so opening Settings re-checks ownership (spec §5).

`app/remote.tsx`: pass `supporter={useSupporterState((s) => s.supporter)}`.

- [ ] **Step 4: Run tests**

Run: `npx jest && npx tsc --noEmit`
Expected: the new tests PASS; full suite green; tsc clean. Existing settings and runtime tests must not need weakening. If they render without a provider, `support` is optional and the hooks are only used in `app/`.

- [ ] **Step 5: Emulator check**

Build an x86_64 debug-signed APK:

```bash
cd apps/remote/android && ./gradlew assembleRelease -PzapbarDebugSigned=true -PreactNativeArchitectures=x86_64 -Pexpo.useLegacyPackaging=true
```

Before Task 5 the flag is a no-op and the build is debug-signed by default. Install it on `Zapbar_Phone`.

Expected: Settings shows no Support card, because a sideloaded build has no Play products and `fetchProducts` returns nothing (the emulator image has Play but the app isn't on Play yet). Note what the card does in the ledger.

Temporarily set `supporter=true` with a local test build: `adb shell` can't edit SQLite, so render a dev-only override instead. Skip this if it isn't available and rely on the Jest test. Screenshot Comic Neue + coral only after the internal-track build (Task 11).

- [ ] **Step 6: Commit**

```bash
git add apps/remote && git commit -m "feat(remote): Support Zapbar card, accent and Comic Neue pickers, supporter heart"
```

---

### Task 5: Release signing, permissions, versioning and the release check

**Files:**
- Create: `apps/remote/plugins/with-release-signing.js`
- Create: `apps/remote/scripts/version.mjs`, `apps/remote/scripts/release-check.mjs`, `apps/remote/scripts/release-lib.mjs`
- Create: `apps/remote/__tests__/release.test.ts`, `apps/remote/__tests__/fixtures/merged-manifest.xml`
- Modify: `apps/remote/app.json` (`plugins` += `./plugins/with-release-signing`; `android.blockedPermissions`; `android.versionCode`)

**Interfaces:**
- Produces:
  ```js
  // release-lib.mjs
  export const ALLOWED_PERMISSIONS: string[];
  export function versionCodeFor(semver: string): number;          // '1.0.0' -> 10000
  export function setVersion(appJson: object, semver: string): object;
  export function permissionsIn(manifestXml: string): string[];    // sorted, unique
  export function checkPermissions(found: string[]): { extra: string[]; missing: string[] };
  ```
- The CLI `node scripts/release-check.mjs <aab> [--min-version-code N]` exits 0 or 1 and prints one line per check.

- [ ] **Step 1: Write the failing tests**

`apps/remote/__tests__/release.test.ts`:

```ts
/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error plain ESM script without types
import { ALLOWED_PERMISSIONS, checkPermissions, permissionsIn, setVersion, versionCodeFor } from '../scripts/release-lib.mjs';

it('maps semver to an always-increasing versionCode', () => {
  expect(versionCodeFor('1.0.0')).toBe(10000);
  expect(versionCodeFor('1.0.1')).toBe(10001);
  expect(versionCodeFor('1.2.3')).toBe(10203);
  expect(versionCodeFor('2.0.0')).toBeGreaterThan(versionCodeFor('1.99.99'));
  expect(() => versionCodeFor('1.0')).toThrow();
  expect(() => versionCodeFor('1.100.0')).toThrow();
});

it('sets version and versionCode together', () => {
  const next = setVersion({ expo: { version: '0.3.5', android: { package: 'app.zapbar.remote' } } }, '1.0.0') as { expo: { version: string; android: { versionCode: number; package: string } } };
  expect(next.expo.version).toBe('1.0.0');
  expect(next.expo.android).toEqual({ package: 'app.zapbar.remote', versionCode: 10000 });
});

it('reads permissions from a merged manifest and flags extras and missing ones', () => {
  const xml = readFileSync(join(__dirname, 'fixtures/merged-manifest.xml'), 'utf8');
  const found = permissionsIn(xml);
  expect(found).toContain('android.permission.SYSTEM_ALERT_WINDOW');
  const r = checkPermissions(found);
  expect(r.extra).toEqual(['android.permission.SYSTEM_ALERT_WINDOW']);
  expect(r.missing).toEqual(['com.android.vending.BILLING']);
  expect(checkPermissions(ALLOWED_PERMISSIONS)).toEqual({ extra: [], missing: [] });
});

it('app.json blocks the permissions Expo adds that Zapbar does not use', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '../app.json'), 'utf8'));
  expect(app.expo.android.blockedPermissions).toEqual(
    expect.arrayContaining(['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.VIBRATE']),
  );
  expect(app.expo.plugins).toContain('./plugins/with-release-signing');
});

it('the signing plugin refuses a release build without the upload key', () => {
  const plugin = readFileSync(join(__dirname, '../plugins/with-release-signing.js'), 'utf8');
  expect(plugin).toContain('ZAPBAR_UPLOAD_STORE_FILE');
  expect(plugin).toContain('zapbarDebugSigned');
  expect(plugin).toMatch(/throw new GradleException/);
});
```

`apps/remote/__tests__/fixtures/merged-manifest.xml`: a minimal manifest with `<uses-permission android:name="…"/>` for every `ALLOWED_PERMISSIONS` entry **except** `com.android.vending.BILLING`, plus `android.permission.SYSTEM_ALERT_WINDOW`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest __tests__/release.test.ts`
Expected: FAIL, "Cannot find module '../scripts/release-lib.mjs'".

- [ ] **Step 3: Implement**

`apps/remote/scripts/release-lib.mjs`:

```js
export const ALLOWED_PERMISSIONS = [
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.CHANGE_NETWORK_STATE',
  'android.permission.CHANGE_WIFI_MULTICAST_STATE',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
  'android.permission.INTERNET',
  'android.permission.POST_NOTIFICATIONS',
  'app.zapbar.remote.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
  'com.android.vending.BILLING',
].sort();

export function versionCodeFor(semver) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver);
  if (!m) throw new Error(`not x.y.z: ${semver}`);
  const [maj, min, pat] = m.slice(1).map(Number);
  if (min > 99 || pat > 99) throw new Error(`minor and patch must be 0-99: ${semver}`);
  return maj * 10000 + min * 100 + pat;
}

export function setVersion(appJson, semver) {
  const expo = appJson.expo;
  return { ...appJson, expo: { ...expo, version: semver, android: { ...expo.android, versionCode: versionCodeFor(semver) } } };
}

export function permissionsIn(xml) {
  return [...new Set([...xml.matchAll(/<uses-permission(?:-sdk-23)?\b[^>]*android:name="([^"]+)"/g)].map((m) => m[1]))].sort();
}

export function checkPermissions(found) {
  return {
    extra: found.filter((p) => !ALLOWED_PERMISSIONS.includes(p)),
    missing: ALLOWED_PERMISSIONS.filter((p) => !found.includes(p)),
  };
}
```

`apps/remote/scripts/version.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { setVersion } from './release-lib.mjs';
const [semver] = process.argv.slice(2);
if (!semver) throw new Error('usage: node scripts/version.mjs <x.y.z>');
const path = new URL('../app.json', import.meta.url);
const next = setVersion(JSON.parse(readFileSync(path, 'utf8')), semver);
writeFileSync(path, JSON.stringify(next, null, 2) + '\n');
console.log(`version ${next.expo.version}, versionCode ${next.expo.android.versionCode}`);
```

`apps/remote/scripts/release-check.mjs` reads the AAB with `bundletool`. If bundletool is missing, download the pinned `bundletool-all-1.18.1.jar` (or the current release) from github.com/google/bundletool/releases into `~/tools/` and ledger the version.

```js
import { execFileSync } from 'node:child_process';
import { checkPermissions, permissionsIn } from './release-lib.mjs';
const [aab, ...rest] = process.argv.slice(2);
const minCode = Number(rest[rest.indexOf('--min-version-code') + 1] ?? 0);
const BUNDLETOOL = process.env.BUNDLETOOL_JAR ?? `${process.env.HOME}/tools/bundletool-all.jar`;
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' });
let failed = false;
const report = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${line}`); if (!ok) failed = true; };

const manifest = run('java', ['-jar', BUNDLETOOL, 'dump', 'manifest', `--bundle=${aab}`]);
const target = Number(/android:targetSdkVersion="(\d+)"/.exec(manifest)?.[1]);
report(target === 36, `targetSdk ${target}`);
const code = Number(/android:versionCode="(\d+)"/.exec(manifest)?.[1]);
report(code > minCode, `versionCode ${code} > ${minCode}`);
const perms = checkPermissions(permissionsIn(manifest));
report(perms.extra.length === 0 && perms.missing.length === 0, `permissions extra=[${perms.extra}] missing=[${perms.missing}]`);

const fp = (out) => /SHA256: ([0-9A-F:]+)/i.exec(out)?.[1]?.toUpperCase() ?? '';
const aabFp = fp(run('keytool', ['-printcert', '-jarfile', aab]));
const keyFp = fp(run('keytool', ['-list', '-v', '-keystore', process.env.ZAPBAR_UPLOAD_STORE_FILE ?? '', '-alias', 'zapbar', '-storepass:env', 'ZAPBAR_UPLOAD_STORE_PASSWORD']));
report(aabFp !== '' && aabFp === keyFp, `signed with the upload key (${aabFp ? aabFp.slice(0, 11) + '…' : 'no fingerprint'})`);
process.exit(failed ? 1 : 0);
```

`apps/remote/plugins/with-release-signing.js`:

```js
const { withAppBuildGradle } = require('expo/config-plugins');

const BLOCK = `
// zapbar: release signing from the environment. A release without the upload key fails;
// -PzapbarDebugSigned=true is the only way to get a debug-signed release APK for testing.
def zapbarStore = System.getenv('ZAPBAR_UPLOAD_STORE_FILE')
android {
    signingConfigs {
        zapbarUpload {
            if (zapbarStore) {
                storeFile file(zapbarStore)
                storePassword System.getenv('ZAPBAR_UPLOAD_STORE_PASSWORD')
                keyAlias 'zapbar'
                keyPassword System.getenv('ZAPBAR_UPLOAD_KEY_PASSWORD')
            }
        }
    }
    buildTypes {
        release {
            signingConfig findProperty('zapbarDebugSigned') == 'true' ? signingConfigs.debug : signingConfigs.zapbarUpload
        }
    }
}
gradle.taskGraph.whenReady { graph ->
    def releasing = graph.allTasks.any { it.name in ['bundleRelease', 'assembleRelease', 'packageRelease'] }
    if (releasing && findProperty('zapbarDebugSigned') != 'true' &&
        !(zapbarStore && System.getenv('ZAPBAR_UPLOAD_STORE_PASSWORD') && System.getenv('ZAPBAR_UPLOAD_KEY_PASSWORD'))) {
        throw new GradleException('zapbar: release build needs ZAPBAR_UPLOAD_STORE_FILE, ZAPBAR_UPLOAD_STORE_PASSWORD and ZAPBAR_UPLOAD_KEY_PASSWORD (or -PzapbarDebugSigned=true for a test APK)')
    }
}
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    if (!c.modResults.contents.includes('zapbar: release signing')) c.modResults.contents += BLOCK;
    return c;
  });
};
```

`app.json`:
- add `"./plugins/with-release-signing"` to `plugins`;
- add `"blockedPermissions": ["android.permission.SYSTEM_ALERT_WINDOW", "android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE", "android.permission.VIBRATE"]` under `android`;
- run `node scripts/version.mjs 1.0.0`.

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/release.test.ts && npx jest && npx tsc --noEmit`
Expected: release 5/5 PASS; suite green.

- [ ] **Step 5: Create the upload key (side effect outside the repo; no owner gate, it is reversible through Play's upload-key reset)**

Generate the passwords without printing them:

```bash
P="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
claudify-secret set ZAPBAR_UPLOAD_PASSWORD zapbar <<<"$P"
```

If `claudify-secret set` reads the value from an argument instead of stdin, use its documented form. Never `echo` the value.

```bash
mkdir -p /mnt/e/projects/keystores
keytool -genkeypair -v -keystore /mnt/e/projects/keystores/zapbar-upload.jks -alias zapbar -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass:env P -keypass:env P -dname "CN=Code 418, O=Aardvark Hosting, C=NL"
```

(`export P` before keytool, and `unset P` after.) Copy the keystore to `/mnt/c/projects/keystores/` and `.210:~/keystores/`, matching the sonora locations, and confirm `~/projects` backups cover `/mnt/e/projects/keystores` or add a restic path. Then commit and push `~/projects/vault`.

Expected:
- `keytool -list -keystore /mnt/e/projects/keystores/zapbar-upload.jks -storepass:env P` prints one `PrivateKeyEntry`;
- a wrong-password control fails;
- `claudify-secret get ZAPBAR_UPLOAD_PASSWORD zapbar | wc -c` prints 25 (24 characters plus the newline).

- [ ] **Step 6: Build and check the AAB**

```bash
export ZAPBAR_UPLOAD_STORE_FILE=/mnt/e/projects/keystores/zapbar-upload.jks
ZAPBAR_UPLOAD_STORE_PASSWORD="$(claudify-secret get ZAPBAR_UPLOAD_PASSWORD zapbar)"; export ZAPBAR_UPLOAD_STORE_PASSWORD
export ZAPBAR_UPLOAD_KEY_PASSWORD="$ZAPBAR_UPLOAD_STORE_PASSWORD"
cd apps/remote && npx expo prebuild --platform android --clean && cd android && ./gradlew :app:bundleRelease > ../../../.superpowers/aab.log 2>&1; echo $?
cd .. && node scripts/release-check.mjs android/app/build/outputs/bundle/release/app-release.aab
```

Expected:
- the build prints `0`;
- release-check prints four `ok` lines: targetSdk 36, versionCode 10000 > 0, permissions, signed with the upload key.

Control: `env -u ZAPBAR_UPLOAD_STORE_FILE ./gradlew :app:bundleRelease` must FAIL with the "zapbar: release build needs" message.

If the permissions line FAILs with extras, rule on each one in the ledger: either block it in `blockedPermissions`, or, if it is a toolchain internal that carries no user data, add it to `ALLOWED_PERMISSIONS` together with a test-fixture update. Then rebuild.

- [ ] **Step 7: Commit**

```bash
git add apps/remote && git commit -m "feat(release): upload-key signing plugin (no debug fallback), blocked permissions, versionCode scheme, AAB release check; 1.0.0"
```

---

### Task 6: Privacy claims and the network tripwire

**Files:**
- Create: `apps/remote/__tests__/privacy-claims.test.ts`
- Create: `apps/site/privacy.html` (the claim strings, final copy in Task 8; created here so the test has its source)

**Interfaces:**
- Consumes: `ALLOWED_PERMISSIONS`, `permissionsIn` (Task 5).
- Produces: `CLAIMS` in the test file. Each claim string must appear verbatim in `apps/site/privacy.html`.

- [ ] **Step 1: Write the failing test**

`apps/remote/__tests__/privacy-claims.test.ts`:

```ts
/** @jest-environment node */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error plain ESM script without types
import { ALLOWED_PERMISSIONS } from '../scripts/release-lib.mjs';

const ROOT = join(__dirname, '../../..');
const policy = () => readFileSync(join(ROOT, 'apps/site/privacy.html'), 'utf8').replace(/\s+/g, ' ');

const walk = (dir: string, exts: string[]): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' || n === 'build' ? [] : walk(p, exts);
    return exts.some((e) => n.endsWith(e)) ? [p] : [];
  });

const SOURCES = [
  ...walk(join(ROOT, 'apps/remote/src'), ['.ts', '.tsx']),
  ...walk(join(ROOT, 'apps/remote/app'), ['.ts', '.tsx']),
  ...walk(join(ROOT, 'packages/heos-core/src'), ['.ts']),
  ...walk(join(ROOT, 'apps/remote/modules'), ['.kt', '.ts']),
];

const LOCAL = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.|localhost$|239\.255\.255\.250$)/;
// Literals that are not network calls from the app: XML namespaces, UPnP/HEOS schema URNs, store links opened in a browser.
const NOT_FETCHED = /^(schemas\.xmlsoap\.org|schemas\.android\.com|schemas\.upnp\.org|www\.w3\.org|play\.google\.com|zapbar\.app)$/;

const CLAIMS = {
  local: 'Zapbar only talks to devices on your own network.',
  noAnalytics: 'Zapbar has no analytics, no crash reporting and no ads.',
  noAccount: 'There is no account and nothing to sign in to.',
  onPhone: 'Your settings stay on your phone.',
  purchases: 'Tips are processed by Google Play; Zapbar never sees your payment details.',
};

it('the policy states every claim', () => {
  for (const c of Object.values(CLAIMS)) expect(policy()).toContain(c);
});

it('every host literal is local (claim: local)', () => {
  const offenders: string[] = [];
  for (const f of SOURCES) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(?:https?|wss?):\/\/([^/:'"`\s)]+)/g)) {
      const host = m[1]!;
      if (host.includes('${') || LOCAL.test(host) || NOT_FETCHED.test(host)) continue;
      offenders.push(`${f.replace(ROOT, '')}: ${host}`);
    }
  }
  expect(offenders).toEqual([]);
});

it('no analytics or crash SDKs (claim: noAnalytics)', () => {
  const deny = /firebase|sentry|bugsnag|amplitude|segment|mixpanel|posthog|datadog|appcenter|crashlytics|instabug|newrelic/i;
  const deps = (p: string) => {
    const j = JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
    return Object.keys({ ...j.dependencies, ...j.devDependencies });
  };
  const all = [...deps('apps/remote/package.json'), ...deps('packages/heos-core/package.json')];
  expect(all.filter((d) => deny.test(d))).toEqual([]);
  const gradle = readFileSync(join(ROOT, 'apps/remote/modules/zapbar-quick/android/build.gradle'), 'utf8');
  expect(deny.test(gradle)).toBe(false);
});

it('no account or sign-in code (claim: noAccount)', () => {
  const offenders = SOURCES.filter((f) => /\b(signIn|login|oauth|password)\b/i.test(readFileSync(f, 'utf8')) && !f.endsWith('privacy-claims.test.ts'));
  expect(offenders.map((f) => f.replace(ROOT, ''))).toEqual([]);
});

it('permissions stay the audited set (claims: local, onPhone)', () => {
  expect(ALLOWED_PERMISSIONS.filter((p: string) => /LOCATION|CONTACTS|STORAGE|MEDIA|CAMERA|RECORD_AUDIO|ACCOUNTS|ACCESSIBILITY/.test(p))).toEqual([]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/privacy-claims.test.ts`
Expected: FAIL, because `apps/site/privacy.html` doesn't exist (ENOENT).

- [ ] **Step 3: Create the policy source with the claim strings**

`apps/site/privacy.html`: a minimal valid page. Task 8 styles it; the claims and effective date are final here.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy · Zapbar</title>
<meta name="description" content="Zapbar's privacy policy: no data collected, no analytics, no accounts.">
<link rel="stylesheet" href="/site.css">
</head>
<body>
<main>
<h1>Privacy</h1>
<p>Effective 2026-10-17.</p>
<p>Zapbar only talks to devices on your own network. It finds your soundbar on your Wi-Fi and sends commands straight to it.</p>
<p>Zapbar has no analytics, no crash reporting and no ads.</p>
<p>There is no account and nothing to sign in to.</p>
<p>Your settings stay on your phone. Uninstalling Zapbar removes them.</p>
<p>Tips are processed by Google Play; Zapbar never sees your payment details. Google's privacy policy covers that purchase.</p>
<p>Questions: <a href="mailto:support@zapbar.app">support@zapbar.app</a>. Zapbar is made by Code 418 (Aardvark Hosting), the Netherlands.</p>
</main>
</body>
</html>
```

- [ ] **Step 4: Run tests, then prove the guard can fire**

Run: `npx jest __tests__/privacy-claims.test.ts`
Expected: 5/5 PASS. If the host test lists offenders, each one is either a real outbound call (that's a finding: stop and report it) or a non-fetched literal. A non-fetched literal goes on `NOT_FETCHED` with a ledgered ruling naming the file.

Control 1: temporarily add `const x = 'https://api.example.com/x';` to `src/runtime/quick.ts`.
Expected: "every host literal is local" FAILS and names the file. Revert.

Control 2: temporarily add `"@sentry/react-native": "1.0.0"` to the dependencies in `apps/remote/package.json`.
Expected: the SDK test FAILS. Revert.

- [ ] **Step 5: Commit**

```bash
git add apps/remote/__tests__/privacy-claims.test.ts apps/site/privacy.html && git commit -m "test: privacy claims paired with code predicates (network tripwire, no analytics, no account, permissions)"
```

---

### Task 7: Play API scripts

**Files:**
- Create: `scripts/play/playlib.py`, `scripts/play/check.py`, `scripts/play/status.py`, `scripts/play/upload.py`, `scripts/play/promote.py`, `scripts/play/products.py`, `scripts/play/test_playlib.py`
- Reference (read, don't modify): `~/projects/sonora/scripts/play-api-check.py`, `play-track-status.py`, `publish-internal.sh`

**Interfaces:**
- Produces:
  ```python
  # playlib.py
  PACKAGE = "app.zapbar.remote"
  def service(): ...                              # androidpublisher v3 client from vault PLAY_SERVICE_ACCOUNT_JSON (scope <vault-scope>) or $ANDROID_PUBLISHER_CREDENTIALS
  def track_release(svc, package, track) -> dict  # {"versionCodes": [...], "status": ...} read in a throwaway edit
  def max_version_code(svc, package) -> int       # highest code on any track, 0 if none
  def tip_products() -> list[dict]                # the three product bodies, prices in EUR micros
  ```
- CLIs:
  - `python3 scripts/play/upload.py <aab> --track internal`;
  - `python3 scripts/play/status.py --track internal`;
  - `python3 scripts/play/promote.py --from internal --to production --version-code N`;
  - `python3 scripts/play/products.py [--apply]` (dry run by default);
  - `python3 scripts/play/check.py`.

- [ ] **Step 1: Write the failing test**

`scripts/play/test_playlib.py`:

```python
import unittest
from playlib import tip_products, max_version_code


class FakeEdits:
    def __init__(self, tracks):
        self._tracks = tracks
        self.deleted = False

    def insert(self, packageName, body):
        return _Exec({"id": "e1"})

    def tracks(self):
        return _Tracks(self._tracks)

    def delete(self, packageName, editId):
        self.deleted = True
        return _Exec({})


class _Tracks:
    def __init__(self, tracks):
        self._t = tracks

    def list(self, packageName, editId):
        return _Exec({"tracks": self._t})


class _Exec:
    def __init__(self, v):
        self.v = v

    def execute(self):
        return self.v


class FakeService:
    def __init__(self, tracks):
        self.e = FakeEdits(tracks)

    def edits(self):
        return self.e


class PlayLibTest(unittest.TestCase):
    def test_tip_products_are_three_one_time_eur_products(self):
        p = {x["sku"]: x for x in tip_products()}
        self.assertEqual(sorted(p), ["supporter_10", "supporter_2", "supporter_5"])
        self.assertEqual(p["supporter_5"]["defaultPrice"], {"priceMicros": "5000000", "currency": "EUR"})
        self.assertEqual(p["supporter_2"]["purchaseType"], "managedUser")
        self.assertTrue(all(x["status"] == "active" for x in p.values()))
        self.assertIn("en-US", p["supporter_10"]["listings"])

    def test_max_version_code_reads_all_tracks_and_discards_the_edit(self):
        svc = FakeService([
            {"track": "internal", "releases": [{"versionCodes": ["10001"]}]},
            {"track": "production", "releases": [{"versionCodes": ["10000"]}]},
        ])
        self.assertEqual(max_version_code(svc, "app.zapbar.remote"), 10001)
        self.assertTrue(svc.e.deleted)

    def test_max_version_code_is_zero_without_releases(self):
        self.assertEqual(max_version_code(FakeService([]), "app.zapbar.remote"), 0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd scripts/play && python3 -m unittest test_playlib -v`
Expected: FAIL, "No module named 'playlib'".

- [ ] **Step 3: Implement**

`scripts/play/playlib.py`:

```python
"""Shared Play Developer API helpers for Zapbar. Every read happens in a throwaway edit that is deleted."""
import json
import os
import subprocess

PACKAGE = "app.zapbar.remote"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"
TIPS = [("supporter_2", 2, "Small tip"), ("supporter_5", 5, "Medium tip"), ("supporter_10", 10, "Big tip")]


def credentials_json():
    env = os.environ.get("ANDROID_PUBLISHER_CREDENTIALS")
    if env:
        return env
    out = subprocess.run(["claudify-secret", "get", "PLAY_SERVICE_ACCOUNT_JSON", "sonora"], capture_output=True, text=True, timeout=30)
    if out.returncode != 0 or not out.stdout.strip():
        raise SystemExit("no Play credentials available")
    return out.stdout


def service():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    creds = service_account.Credentials.from_service_account_info(json.loads(credentials_json()), scopes=[SCOPE])
    return build("androidpublisher", "v3", credentials=creds, cache_discovery=False)


def _with_edit(svc, package, fn):
    edit = svc.edits().insert(packageName=package, body={}).execute()
    try:
        return fn(edit["id"])
    finally:
        svc.edits().delete(packageName=package, editId=edit["id"]).execute()


def track_release(svc, package, track):
    def read(edit_id):
        t = svc.edits().tracks().get(packageName=package, editId=edit_id, track=track).execute()
        return {"versionCodes": [c for r in t.get("releases", []) for c in r.get("versionCodes", [])],
                "status": [r.get("status") for r in t.get("releases", [])]}
    return _with_edit(svc, package, read)


def max_version_code(svc, package):
    def read(edit_id):
        tracks = svc.edits().tracks().list(packageName=package, editId=edit_id).execute().get("tracks", [])
        codes = [int(c) for t in tracks for r in t.get("releases", []) for c in r.get("versionCodes", [])]
        return max(codes, default=0)
    return _with_edit(svc, package, read)


def tip_products():
    return [{
        "packageName": PACKAGE,
        "sku": sku,
        "status": "active",
        "purchaseType": "managedUser",
        "defaultPrice": {"priceMicros": str(eur * 1_000_000), "currency": "EUR"},
        "listings": {"en-US": {"title": f"{title} (€{eur})", "description": "Thanks for supporting Zapbar. Unlocks the supporter badge, accent colours and Comic Neue."}},
    } for sku, eur, title in TIPS]
```

`check.py`: port `play-api-check.py` with `--package` defaulting to `PACKAGE`.

`status.py`: port `play-track-status.py`, using `track_release`.

`upload.py`:

```python
"""Upload an AAB to a track, then read the track back. The log is intent; the read-back is the outcome."""
import argparse
from googleapiclient.http import MediaFileUpload
from playlib import PACKAGE, service, track_release

ap = argparse.ArgumentParser()
ap.add_argument("aab")
ap.add_argument("--track", default="internal")
ap.add_argument("--notes", default="Bug fixes and improvements.")
a = ap.parse_args()
svc = service()
edit = svc.edits().insert(packageName=PACKAGE, body={}).execute()["id"]
bundle = svc.edits().bundles().upload(packageName=PACKAGE, editId=edit, media_body=MediaFileUpload(a.aab, mimetype="application/octet-stream")).execute()
code = str(bundle["versionCode"])
svc.edits().tracks().update(packageName=PACKAGE, editId=edit, track=a.track, body={"releases": [{"versionCodes": [code], "status": "completed", "releaseNotes": [{"language": "en-US", "text": a.notes}]}]}).execute()
svc.edits().commit(packageName=PACKAGE, editId=edit).execute()
after = track_release(svc, PACKAGE, a.track)
print(f"{a.track}: {after}")
raise SystemExit(0 if code in after["versionCodes"] else 1)
```

`promote.py`: the same edit flow. It reads `--from`, requires `--version-code` to be present on that track, sets `--to` to that code with status `completed`, commits, reads back, and exits non-zero if the code is missing.

`products.py`:
- prints each body from `tip_products()`;
- with `--apply`, calls `svc.inappproducts().insert(packageName=PACKAGE, body=p, autoConvertMissingPrices=True)` for each SKU not yet listed by `svc.inappproducts().list(...)`.
- If the API answers that this app must use `monetization.onetimeproducts`, switch to that API with the same SKUs and prices, and ledger the ruling.
- Then list the products and exit non-zero unless all three are present and active.

- [ ] **Step 4: Run tests**

Run: `cd scripts/play && python3 -m unittest test_playlib -v && python3 products.py`
Expected: 3/3 PASS. The dry run prints three bodies and makes no API calls.

- [ ] **Step 5: Commit**

```bash
git add scripts/play && git commit -m "feat(release): Play API scripts (upload with read-back, status, promote, tip products) ported from sonora"
```

---

### Task 8: zapbar.app site

**Files:**
- Create: `apps/site/index.html`, `apps/site/support.html`, `apps/site/site.css`, `apps/site/fonts/*.woff2` (Plus Jakarta Sans 500/700/800, from `@expo-google-fonts/plus-jakarta-sans` → convert the TTFs, or the fontsource woff2 files), `apps/site/img/` (three screenshots from Task 9, plus the Z mark SVG and favicon), `apps/site/nginx.conf`, `apps/site/Dockerfile`, `apps/site/docker-compose.yml`, `apps/site/site.test.mjs`, `apps/site/package.json`
- Modify: `apps/site/privacy.html` (styling only; claim sentences unchanged)

**Interfaces:**
- Consumes: claim strings (Task 6, unchanged); screenshots (Task 9; until then use `docs/quick-check/*.png` and swap them in Task 9).
- Produces: a container serving `/`, `/privacy`, `/support` on `HOST_IP:<port>` from `claudify-port`.

**Ruling carried from planning:** `new.sh` scaffolds a separate project and repo. The site lives inside the zapbar repo, so the privacy test (Task 6) can read the policy, and that makes a separate scaffold wrong. The sanctioned tooling is used for each piece instead:
- `claudify-port claim` for the port;
- the compose file copies `new.sh`'s template (`restart: unless-stopped`, `HOST_IP:<port>`);
- the build runs on .210;
- `claudify-publish` handles publishing.

Ledger this.

- [ ] **Step 1: Write the failing test**

`apps/site/package.json`: `{ "name": "@zapbar/site", "private": true, "type": "module", "scripts": { "test": "node --test" } }`

`apps/site/site.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('.', import.meta.url).pathname;
const pages = ['index.html', 'privacy.html', 'support.html'];
const read = (f) => readFileSync(join(DIR, f), 'utf8');

test('every page has a title, a description and the stylesheet', () => {
  for (const p of pages) {
    const h = read(p);
    assert.match(h, /<title>[^<]+· Zapbar<\/title>|<title>Zapbar[^<]*<\/title>/, p);
    assert.match(h, /<meta name="description" content="[^"]{20,}">/, p);
    assert.match(h, /<link rel="stylesheet" href="\/site.css">/, p);
  }
});

test('no scripts, no third-party requests', () => {
  for (const f of [...pages, 'site.css']) {
    const h = read(f);
    assert.doesNotMatch(h, /<script/i, f);
    for (const m of h.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"|url\((https?:\/\/[^)]+)\)/g)) {
      const url = m[1] ?? m[2];
      assert.match(url, /^https:\/\/play\.google\.com\/store\/apps\/details\?id=app\.zapbar\.remote$/, `${f}: ${url}`);
    }
  }
});

test('internal links and assets resolve', () => {
  const routes = { '/': 'index.html', '/privacy': 'privacy.html', '/support': 'support.html' };
  for (const p of pages) {
    for (const m of read(p).matchAll(/(?:src|href)="(\/[^"#]*)"/g)) {
      const target = routes[m[1]] ?? m[1].slice(1);
      assert.ok(existsSync(join(DIR, target)), `${p} -> ${m[1]}`);
    }
  }
});

test('fonts are self-hosted', () => {
  assert.ok(readdirSync(join(DIR, 'fonts')).some((f) => f.endsWith('.woff2')));
  assert.match(read('site.css'), /@font-face[^}]*url\(\/fonts\//);
});

test('support page names the contact and the requirement', () => {
  const h = read('support.html');
  assert.match(h, /support@zapbar\.app/);
  assert.match(h, /same Wi-Fi/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/site && node --test`
Expected: FAIL, ENOENT for `index.html`.

- [ ] **Step 3: Build the pages**

- `site.css`:
  - `@font-face` blocks for `/fonts/plus-jakarta-sans-{500,700,800}.woff2`.
  - `:root` tokens forest `#17301B`, lime `#C8F552`, sage `#F3F6EC`. Light by default, with `@media (prefers-color-scheme: dark)` switching to the dark palette from `src/theme.ts`.
  - Mobile-first single column, max-width 720px, 16px gutters.
- `index.html`:
  - Z mark (inline SVG copied from `scripts/brand-assets.mjs`'s path), "Zapbar", the tagline "The remote HEOS forgot to build.", the line "Designed for function, no bloat.";
  - Play badge link `https://play.google.com/store/apps/details?id=app.zapbar.remote` as a text button (no Google badge image, so no third-party asset);
  - three screenshots;
  - feature list: inputs with real device icons, volume and mute, EQ / dialogue / night, widgets, volume keys, notification, Quick Settings tile, rename your soundbar;
  - "Free. Tips unlock silly perks.";
  - footer links to /privacy and /support, and "Not affiliated with Denon or HEOS."
- `support.html`:
  - requirements: "A HEOS device on the same Wi-Fi as your phone";
  - tested on Denon DHT-S716H;
  - FAQ:
    - no soundbar found → same Wi-Fi, not a guest network, try the IP;
    - volume keys stop on Samsung → Settings → Remote → battery line;
    - restore a tip → reinstall from Play with the same Google account, then open Settings;
  - contact `support@zapbar.app`.
- `privacy.html`: add the shared header and footer, keeping every claim sentence unchanged.
- `nginx.conf`: `server { listen 80; root /usr/share/nginx/html; location = / { try_files /index.html =404; } location / { try_files $uri $uri.html =404; } add_header Content-Security-Policy "default-src 'self'; img-src 'self'; style-src 'self'; font-src 'self'; script-src 'none'" always; add_header Referrer-Policy no-referrer always; }`. Mount the **directory** (`./nginx` → `/etc/nginx/conf.d`), never a single file; see the "Docker single-file mount pins inode" memory.
- `Dockerfile`: `FROM nginx:1.27-alpine`, copying the pages, `site.css`, `fonts/` and `img/` into `/usr/share/nginx/html/`, and `nginx.conf` into `/etc/nginx/conf.d/default.conf` (baked into the image, so there is no single-file mount at all).
- `docker-compose.yml`:

```yaml
services:
  zapbar-site:
    build: .
    container_name: zapbar-site
    restart: unless-stopped
    ports:
      - "${HOST_IP}:${PORT}:80"
```

  plus an `.env.example` with `HOST_IP=<host-ip>` and `PORT=`.

- [ ] **Step 4: Run tests and view the pages**

Run: `cd apps/site && node --test`
Expected: 5/5 PASS.

Open each page with Playwright at 390×844 and at 1280×800, in light and dark, and check:
- no horizontal scroll;
- fonts load (no fallback);
- the CSP doesn't block anything: the Playwright console must show no errors.

- [ ] **Step 5: Claim the port and run locally on .210 (not yet public)**

```bash
claudify-port free web          # read the number, then:
claudify-port claim zapbar-site <port>
```

On .210 (one-line heads-up to the owner first: a new container, no live service touched):
1. `git clone`/`pull` zapbar from Gitea into `~/projects/zapbar`.
2. `cd apps/site && printf 'HOST_IP=<host-ip>\nPORT=<port>\n' > .env && docker compose up -d --build`.
3. `curl -s -o /dev/null -w '%{http_code}' http://<host-ip>:<port>/privacy`.

Expected: `200`, and `curl -sI http://<host-ip>:<port>/ | grep -i content-security-policy` prints the header.

- [ ] **Step 6: Commit**

```bash
git add apps/site && git commit -m "feat(site): zapbar.app landing, privacy and support pages (static, no JS, self-hosted fonts) + nginx container"
```

- [ ] **Step 7: OWNER GATE — publish zapbar.app**

Ask: "Publish zapbar.app (and www) publicly now?" Only after a yes:

```bash
claudify-publish @ <port> --host <host-ip> --public --zone zapbar.app --zone-id 9544fcdb703efae5d321114afd266fac --description "Zapbar site"
claudify-publish www <port> --host <host-ip> --public --zone zapbar.app --zone-id 9544fcdb703efae5d321114afd266fac --description "Zapbar site (www)"
```

If `claudify-publish` does not accept `@` for the apex, use its documented apex form, or create the apex CNAME through the CF API with the same tunnel target and ledger it. `www` should redirect to the apex: add a `server_name www.zapbar.app; return 301 https://zapbar.app$request_uri;` block in `nginx.conf` before publishing `www`.

Expected:
- `curl -s -o /dev/null -w '%{http_code}' https://zapbar.app/privacy` → `200`;
- `curl -sI https://www.zapbar.app/ | grep -i location` → `https://zapbar.app/`.

- [ ] **Step 8: OWNER GATE — support@zapbar.app**

Ask before enabling. Enable Cloudflare Email Routing on the zapbar.app zone, using a token with Zone Settings:Edit (see the "CF Email Routing perms" memory), and add a rule `support@zapbar.app` → the owner's mailbox. The owner confirms the verification e-mail.

Expected: a test mail to support@zapbar.app arrives (the owner confirms).

---

### Task 9: Store graphics, listing text and declarations pack

**Files:**
- Create: `docs/release/listing.md`, `docs/release/declarations.md`, `docs/release/first-upload.md`, `docs/release/checklist.md`
- Create: `docs/release/graphics/` (captioned screenshots, `feature-graphic.png`, `icon-512.png`), `apps/remote/scripts/store-graphics.mjs`
- Create: `docs/release/fgs-demo.mp4`
- Modify: `apps/site/img/` (swap in the final screenshots)

**Interfaces:**
- Consumes: the APK from Task 4/5 (x86_64, debug-signed via `-PzapbarDebugSigned=true` for the emulator).
- Produces: the files the owner pastes and uploads in Task 11.

- [ ] **Step 1: Write the failing test**

Append to `apps/remote/__tests__/release.test.ts`:

```ts
it('the listing text fits Play limits and carries the agreed lines', () => {
  const md = readFileSync(join(__dirname, '../../../docs/release/listing.md'), 'utf8');
  const field = (name: string) => new RegExp(`## ${name}\\n\\n([\\s\\S]*?)\\n\\n## `).exec(md + '\n\n## ')![1]!.trim();
  expect(field('Title')).toBe('Zapbar: Remote for HEOS');
  expect(field('Title').length).toBeLessThanOrEqual(30);
  expect(field('Short description')).toBe('The remote HEOS forgot to build. Designed for function, no bloat.');
  expect(field('Short description').length).toBeLessThanOrEqual(80);
  expect(field('Full description').length).toBeLessThanOrEqual(4000);
  expect(field('Full description')).toContain('Not affiliated with Denon or HEOS; trademarks belong to their owners.');
});

it('store graphics exist at Play sizes', async () => {
  const sharp = (await import('sharp')).default;
  const dir = join(__dirname, '../../../docs/release/graphics');
  expect(await sharp(join(dir, 'feature-graphic.png')).metadata()).toMatchObject({ width: 1024, height: 500 });
  expect(await sharp(join(dir, 'icon-512.png')).metadata()).toMatchObject({ width: 512, height: 512 });
  for (const n of ['1-remote', '2-eq', '3-inputs', '4-widgets', '5-notification', '6-slider']) {
    const m = await sharp(join(dir, `${n}.png`)).metadata();
    expect(m.height! / m.width!).toBeCloseTo(2400 / 1080, 1);
  }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest __tests__/release.test.ts`
Expected: FAIL with ENOENT for `listing.md`.

- [ ] **Step 3: Write the listing and declarations**

`docs/release/listing.md` has these sections in order: `## Title`, `## Short description`, `## Full description`, `## Category` (Music & Audio), `## Contact` (support@zapbar.app, https://zapbar.app), `## Privacy policy` (https://zapbar.app/privacy). The full description covers:
- the tagline;
- a features list (as on the site);
- "Needs a HEOS device on the same Wi-Fi. Tested on Denon DHT-S716H; other HEOS models work for the basics and gain features as they're tested.";
- "Free. Tips unlock a badge, accent colours and Comic Neue. Nothing else, ever.";
- the privacy summary;
- the last line, "Not affiliated with Denon or HEOS; trademarks belong to their owners."

`docs/release/declarations.md`:
- **Content rating answers:** no violence/sexual content/gambling/user content/sharing location, plus a digital purchases yes.
- **Target audience:** 13+.
- **Ads:** no.
- **App access:** "Zapbar controls a HEOS device on the user's local network and needs one to show its main screen. Demo video: <YouTube URL>."
- **Foreground service, connectedDevice:** "Keeps the media session and notification connected to the user's own soundbar on the local network so the phone's volume keys and the notification control the soundbar while it plays; stops when the soundbar is idle for 5 minutes or the phone leaves Wi-Fi." Plus the video URL.
- **Data Safety:** the answer and its evidence.

Research for the Data Safety answer: read Google's current Data Safety help ("Provide information for Google Play's Data safety section"), the part on data collected by Google Play services or billing. Record the quote and URL in `declarations.md`, along with the resulting answer ("No data collected" unless the guidance says purchase history handled by Play Billing must be declared). Ledger the ruling.

Also run the **EUIPO name check** here. Search EUIPO eSearch / TMview for "ZAPBAR" and for Zap-prefixed class-9 marks such as ZAP, ZAPIER and ZAPP. Record the findings (marks, owners, classes, status) in `declarations.md` under "Name check". Raise any identical or near-identical class-9 mark to the owner before Task 11.

- [ ] **Step 4: Capture and render the graphics**

On `Zapbar_Phone` (1080×2400), with the release APK installed and the real bar connected:
1. Use the bar's current name as it is. The owner renamed it to "living room" on 2026-10-17. If it reads as something unsuitable for the store, ask the owner rather than renaming it. Never write the bar's name from this task.
2. Capture with `adb exec-out screencap -p`:
   1. remote (dark);
   2. EQ sheet (dark);
   3. inputs editor (light);
   4. home screen with both widgets (light);
   5. notification expanded (dark);
   6. slider (dark).

`apps/remote/scripts/store-graphics.mjs` uses Playwright, per the HTML→PDF memory: chromium plus an HTML template.
- Each screenshot gets a top caption band of 1080×300 in forest, with lime Plus Jakarta Sans 800 at 64 px. Captions:
  1. "Every input, one tap";
  2. "EQ that remembers";
  3. "Name your inputs";
  4. "Widgets that work";
  5. "Volume from the notification";
  6. "A slider anywhere".
- The screenshot is scaled into the remaining area, and the output is 1080×2400 PNG.
- Feature graphic 1024×500: forest background, the lime Z, "Zapbar", the tagline.
- `icon-512.png`: a 512×512 resize of `assets/icon.png`.

Run: `node apps/remote/scripts/store-graphics.mjs`. Then copy `1-remote`, `4-widgets` and `5-notification` (resized to 720 wide, WebP or PNG under 200 KB each) into `apps/site/img/`, updating `index.html`.

- [ ] **Step 5: Record the FGS demo video**

`adb.exe shell screenrecord --time-limit 40 /sdcard/fgs.mp4` while you:
1. open the app;
2. go home;
3. show the notification;
4. press volume up and down;
5. tap mute in the notification;
6. show the bar's volume change on screen, using the slider or the notification number.

Pull it to `docs/release/fgs-demo.mp4`. Restore the bar's volume and mute to their starting values and read them back.

- [ ] **Step 6: Write `first-upload.md` and `checklist.md`**

`first-upload.md`, click by click:
1. Play Console (Code-418) → Create app: name "Zapbar: Remote for HEOS", default language English (US), App, **Free**, the declarations.
2. Note whether Console requires the 12-testers closed test for production. Record it in the ledger.
3. Testing → Internal testing → Create release → upload `app-release.aab` (path) → release name 1.0.0 → save → roll out.
4. Testers: create the list "zapbar-owners" with the owner's and partner's Google accounts and copy the opt-in link.
5. Setup → License testing: add both accounts.
6. Users and permissions → invite `<service-account>@<project>.iam.gserviceaccount.com` with Zapbar-only permissions: Releases, Store presence, Monetisation (manage products).
7. Store presence → Main store listing: paste from `listing.md` and upload the graphics.
8. App content: paste from `declarations.md`, including the YouTube URL of `fgs-demo.mp4` (the owner uploads it as unlisted).

`checklist.md`: the spec §6.4 list as checkboxes:
1. Fresh install from internal.
2. Setup finds the bar.
3. Remote, EQ, inputs.
4. Widgets.
5. Volume keys locked.
6. Notification.
7. Tile.
8. Support card shows three Play prices.
9. Test purchase (€2), then badge, coral, Comic Neue.
10. Uninstall, reinstall, then perks restored after opening Settings.
11. Sideloaded 0.3.5 APK shows no Support card.
12. Partner's install.

- [ ] **Step 7: Run tests**

Run: `cd apps/remote && npx jest __tests__/release.test.ts && npx jest`
Expected: PASS; suite green.

- [ ] **Step 8: Commit**

```bash
git add docs/release apps/remote/scripts/store-graphics.mjs apps/remote/__tests__/release.test.ts apps/site/img apps/site/index.html && git commit -m "docs(release): listing, declarations (Data Safety research, EUIPO check), store graphics, FGS demo, first-upload steps"
```

---

### Task 10: Launch kit

**Files:**
- Create: `docs/launch/README.md`, `docs/launch/posts.md`, `docs/launch/review-reply.md`

**Interfaces:** none (documents).

- [ ] **Step 1: Write the failing test**

Append to `apps/remote/__tests__/release.test.ts`:

```ts
it('the launch kit is complete and honest', () => {
  const dir = join(__dirname, '../../../docs/launch');
  const readme = readFileSync(join(dir, 'README.md'), 'utf8');
  for (const h of ['## Value proposition', '## Features', '## Target persona', '## Privacy', '## Links']) expect(readme).toContain(h);
  const posts = readFileSync(join(dir, 'posts.md'), 'utf8');
  for (const h of ['## r/denon', '## r/hometheater', '## r/homeassistant', '## Tweakers']) expect(posts).toContain(h);
  expect(posts.match(/DHT-S716H/g)!.length).toBeGreaterThanOrEqual(4);
  const reply = readFileSync(join(dir, 'review-reply.md'), 'utf8');
  expect(reply).toMatch(/I made|ik heb .* gemaakt/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/release.test.ts`
Expected: FAIL with ENOENT for `docs/launch/README.md`.

- [ ] **Step 3: Write the kit**

- **`README.md`:**
  - Value proposition: "The remote HEOS forgot to build: one-tap inputs, volume keys, widgets, no account, no bloat."
  - Features (as on the site).
  - Target persona: owners of HEOS soundbars and AVRs who switch HDMI inputs daily and gave the official app 1★. Secondary: Home Assistant tinkerers who want a fast local remote.
  - Privacy: the claims.
  - Links: zapbar.app, the Play URL, support.
- **`posts.md`:** one post per community, each with a title and body.
  - **r/denon:** the problem with the HEOS app, what Zapbar does, the 30-second demo GIF placeholder replaced by `docs/release/graphics/1-remote.png`, "tested on DHT-S716H only, please report your model", free with tips.
  - **r/hometheater:** angled at input switching and volume keys.
  - **r/homeassistant:** angled at local-only, no cloud, no account.
  - **Tweakers:** in Dutch, for the Meuktracker/forum: "Gratis afstandsbediening voor HEOS-soundbars…".
  - Each post ends with the disclosure "I'm the developer."
- **`review-reply.md`:** a 2–3 sentence reply for HEOS 1★ review threads and forum complaints, in EN and NL. It always discloses "I made this" / "ik heb dit gemaakt", is never posted more than once per thread, and is never posted from a sock account.

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/release.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/launch apps/remote/__tests__/release.test.ts && git commit -m "docs(launch): README, community posts (EN + NL), disclosed review reply"
```

---

### Task 11: Release 1.0.0 (owner gates)

**Files:**
- Modify: `docs/release/checklist.md` (results), `docs/plans/2026-10-17-zapbar-5-release.md` (no edits; the ledger holds the results)

**Interfaces:**
- Consumes: the AAB and `release-check` (Task 5); scripts (Task 7); docs (Task 9).

- [ ] **Step 1: Build and check the final AAB**

Use the Task 5 Step 6 commands on the merged tip of `feat/release`.
Expected: four `ok` lines from release-check.

- [ ] **Step 2: OWNER — first upload**

Hand the owner `docs/release/first-upload.md`, the AAB path (copied to `E:\projects\zapbar\release\zapbar-1.0.0.aab`), the graphics and the video, and wait for:
- "uploaded to internal";
- the testers added;
- the service account granted.

Then run `python3 scripts/play/check.py` and `python3 scripts/play/status.py --track internal`.
Expected: API access ok; the internal track shows versionCode 10000.

- [ ] **Step 3: OWNER GATE — create the tip products**

Ask "Create the three tip products (€2/€5/€10) in Play now?" On a yes:

Run: `python3 scripts/play/products.py --apply`
Expected: three products, active. The owner sees them under Monetise → In-app products.

- [ ] **Step 4: OWNER — device checklist**

The owner and their partner install from the internal opt-in link and run `docs/release/checklist.md`. Fix any FAIL with TDD, bump the version with `node scripts/version.mjs 1.0.1`, build, run release-check, then:

```bash
python3 scripts/play/upload.py <aab> --track internal
```

Repeat until the checklist passes. Record the results in `checklist.md`, then commit.

- [ ] **Step 5: OWNER GATE — production**

Ask "Promote <version> to production now?" On a yes:

Run: `python3 scripts/play/promote.py --from internal --to production --version-code <code>`
Expected: read-back shows the code on production. Google review follows (hours to days), and the owner reports approval.

- [ ] **Step 6: Launch handoff**

Once the app is live, show the owner `docs/launch/posts.md`. Post only on an explicit go, per post, and only if the owner wants Claude to post rather than doing it themselves.

Update memory `project_zapbar.md`:
- live date;
- version;
- whether the 12-testers rule applied;
- the Data Safety answer;
- the EUIPO result;
- the iOS gate (500+ installs or positive ratings → Apple dev account + Mac mini builds).

---

## Self-review notes (planning)

- **Spec coverage:**
  - §2 → Task 5 + Task 7 + Task 11.
  - §3 → Task 9 (+ Task 11 for paste and upload).
  - §4 → Tasks 6 and 8.
  - §5 → Tasks 1–4.
  - §6 → Task 11.
  - §7 → Task 10 (+ the EUIPO check in Task 9).
  - §8 → tests in Tasks 1–10.
  - §10 backlog → no task (v1.1/v2).
- **Interface additions vs spec:**
  - `Billing.acknowledge(token)` is added: the spec's interface lists four methods, but acknowledging needs one of its own. `OwnedTip` carries `token` and `acknowledged`.
  - `Supporter.buy` can return `'busy'`.
  - The badge sits next to the Z on the remote header, not in Settings (Settings has no Z).
  - The site is not `new.sh`-scaffolded (it lives in the zapbar repo).

  All four are ledgered as rulings at execution.
