# Zapbar 6b: tips on iOS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tip jar works on iPhone through StoreKit. Tips stay owned across reinstalls, and a refund removes the perks. A visible "Restore purchases" action is shown. The three products exist in App Store Connect.

**Architecture:**
- `expo-iap` 6.1 already wraps StoreKit 2. The work is mostly in `src/runtime/billing.ts`: it opens to iOS, maps StoreKit purchases (revoked = not owned, finishing a transaction on iOS = acknowledging it) and gains `restore()`.
- `Supporter` gains `restore()`, and `SupportCard` shows the restore link on iOS only.
- A Python script creates the products through the App Store Connect API, the same way `scripts/play/products.py` does for Play.

**Tech Stack:** Expo SDK 58, `expo-iap` 6.1.0 (`requestPurchase({ request: { apple: { sku } } })`, `restorePurchases()`, `finishTransaction`), Jest (jest-expo, RNTL 14), and Python 3 with PyJWT for the App Store Connect API (`ios_profile.call`).

**Spec:** `docs/specs/2026-10-18-zapbar-ios-design.md` §5, which is §8 step 2. Ships in 1.2.0 together with Plan 6c (`docs/plans/2026-10-20-zapbar-6c-ios-widgets.md`), whose Task 7 does the release.

## Global Constraints

- **Products:**
  - Product IDs on both stores: `supporter_2`, `supporter_5`, `supporter_10`.
  - They are non-consumable. Any tier unlocks every perk.
  - Titles: "Small tip", "Medium tip", "Big tip".
- **Prices:** the App Store price points nearest to €2, €5 and €10, with the Netherlands as the base territory. On a tie, take the lower point.
- **Restore:** "Restore purchases" appears on iOS only. Play restores automatically and gets no button.
- **Refunds:** a refunded or revoked tip removes the perks, the same as on Play. Only a successful ownership read can revoke them; that rule is in `supporter.ts` and stays unchanged.
- **Android:** no change in behaviour. All existing Jest tests stay green.
- **Owner-only steps (the owner does them in App Store Connect or on the phone):**
  - an active Paid Apps Agreement;
  - App Store Small Business Program enrollment;
  - a sandbox tester account;
  - the IAP review screenshot;
  - selecting the IAPs on the 1.2.0 version page before submission.
- **Rules carried over:** no new data collection; no network calls outside StoreKit.

## Review Focus

1. **A refund on iOS:**
   - Situation: StoreKit still lists a transaction for a refunded tip, with `revocationDateIOS` set.
   - Expected: it does not count as owned, and the perks go.
   - Pinned by: Task 1, test `ignores a revoked App Store purchase`.
2. **A fresh install on another iPhone:**
   - Situation: the same Apple ID, and the tip was bought earlier.
   - Expected: `getAvailablePurchases` returns it on the first refresh, so the badge shows without a tap.
   - Pinned by: Task 1, test `treats App Store entitlements as acknowledged`; Task 4 checks it on the device.
3. **Restore finds nothing, or fails** (signed out of the App Store, offline):
   - Expected: a short message, the perks unchanged, and no throw.
   - Pinned by: Task 2, tests `restore with nothing owned says so` and `restore failure keeps perks`.
4. **The App Store sheet is cancelled:**
   - Situation: the iOS error code for a cancelled purchase.
   - Expected: `cancelled`, not `failed`, and no error text.
   - Pinned by: Task 1, test `maps the iOS cancel code to cancelled`.
5. **Android unchanged:**
   - Expected: `available()` on Android behaves as before, there is no restore link on Android, and buying still uses the `google` request.
   - Pinned by: Task 1, test `android buy still sends the google request`; Task 2, test `no restore link on android`.

---

### Task 1: StoreKit in `billing.ts`

**Files:**
- Modify: `apps/remote/src/runtime/billing.ts`
- Modify: `apps/remote/src/runtime/RuntimeProvider.tsx`: the call site of `playBilling()` becomes `storeBilling()`.
- Test: `apps/remote/__tests__/billing.test.ts`

**Interfaces:**
- Produces:
  - `storeBilling(os: string = Platform.OS): Billing` replaces `playBilling()`. The old name is not kept.
  - `Billing.restore(): Promise<void>`. On iOS it calls `restorePurchases()`; on Android it is a no-op.
  - `toOwned(p: PurchaseLike, os: string): OwnedTip | null`.
  - `PurchaseLike` gains `revocationDateIOS?: number | null`.

- [ ] **Step 1: Write the failing tests** in `billing.test.ts`. Mock `expo-iap` the way the existing Jest setup does. Existing `toOwned` calls gain `'android'` as the second argument.

```ts
it('treats App Store entitlements as acknowledged', () => {
  expect(toOwned({ productId: 'supporter_5', purchaseState: 'purchased', purchaseToken: 'jws' }, 'ios'))
    .toEqual({ id: 'supporter_5', state: 'owned', token: 'jws', acknowledged: true });
});
it('ignores a revoked App Store purchase', () => {
  expect(toOwned({ productId: 'supporter_5', purchaseState: 'purchased', purchaseToken: 'jws', revocationDateIOS: 1760000000000 }, 'ios')).toBeNull();
});
it('is available on ios when StoreKit connects', async () => {
  iap.initConnection.mockResolvedValue(true);
  await expect(storeBilling('ios').available()).resolves.toBe(true);
});
it('is unavailable on other platforms', async () => {
  await expect(storeBilling('web').available()).resolves.toBe(false);
});
it('ios buy sends the apple request and finishes the transaction', async () => {
  // purchaseUpdatedListener fires { productId: 'supporter_2', purchaseState: 'purchased', purchaseToken: 'jws' }
  await expect(storeBilling('ios').buy('supporter_2')).resolves.toBe('owned');
  expect(iap.requestPurchase).toHaveBeenCalledWith({ request: { apple: { sku: 'supporter_2' } }, type: 'in-app' });
  expect(iap.finishTransaction).toHaveBeenCalledWith(expect.objectContaining({ isConsumable: false }));
});
it('android buy still sends the google request', async () => {
  await storeBilling('android').buy('supporter_2');
  expect(iap.requestPurchase).toHaveBeenCalledWith({ request: { google: { skus: ['supporter_2'] } }, type: 'in-app' });
});
it('maps the iOS cancel code to cancelled', async () => {
  // purchaseErrorListener fires { code: 'user-cancelled' }
  await expect(storeBilling('ios').buy('supporter_2')).resolves.toBe('cancelled');
});
it('restore calls restorePurchases on ios only', async () => {
  await storeBilling('ios').restore();
  expect(iap.restorePurchases).toHaveBeenCalledTimes(1);
  await storeBilling('android').restore();
  expect(iap.restorePurchases).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the tests and confirm they fail.**
  - Run: `cd apps/remote && pnpm jest __tests__/billing.test.ts`
  - Expected: FAIL, `storeBilling` is not exported.

- [ ] **Step 3: Implement it in `billing.ts`.**
  - `available()` is true when `os` is `'android'` or `'ios'` and `connect()` succeeds.
  - On iOS, `toOwned` returns `acknowledged: true`, because a StoreKit entitlement needs no acknowledgement. It returns `null` when `revocationDateIOS` is set.
  - On iOS, `buy()` calls `finishTransaction({ purchase, isConsumable: false })` once the purchase arrives, then resolves `owned`.
  - Rewrite the interface comment: "The app's only view of the store (Play Billing or StoreKit)".
  - Check the real iOS cancel code in `node_modules/expo-iap/build/types.d.ts` (`ErrorCode`). If it differs from `'user-cancelled'`, map both values.

- [ ] **Step 4: Run the tests and confirm they pass.**
  - Run: `cd apps/remote && pnpm jest && pnpm tsc --noEmit`
  - Expected: all tests pass and tsc is clean.

- [ ] **Step 5: Commit** as `feat(tips): StoreKit billing on iOS`.

### Task 2: Restore purchases

**Files:**
- Modify: `apps/remote/src/runtime/supporter.ts`
- Modify: `apps/remote/src/ui/SupportCard.tsx`
- Modify: `apps/remote/src/ui/SettingsView.tsx`: passes `canRestore={Platform.OS === 'ios'}` and `onRestore`.
- Test: `apps/remote/__tests__/supporter.test.ts`, `apps/remote/__tests__/support-card.test.tsx`

**Interfaces:**
- Consumes: `Billing.restore()` from Task 1.
- Produces:
  - `Supporter.restore(): Promise<'restored' | 'none' | 'failed'>`. It calls `billing.restore()`, then `refresh()`. The result is `restored` when `supporter` is true afterwards, `none` when it is false, and `failed` when `restore()` throws. A failure leaves the state untouched.
  - `SupportCard` gets the new props `canRestore: boolean` and `onRestore(): Promise<'restored' | 'none' | 'failed'>`.

- [ ] **Step 1: Write the failing tests.**
  - `supporter.test.ts`:
    - `restore with an owned tip returns restored`: the fake `owned()` returns one owned `supporter_5` after `restore()`.
    - `restore with nothing owned says so`: the result is `'none'`.
    - `restore failure keeps perks`: the supporter flag is true, `restore()` rejects, the result is `'failed'` and `supporter` stays true.
  - `support-card.test.tsx`:
    - `shows Restore purchases on ios and reports the result`: press "Restore purchases"; `onRestore` resolves `'none'`; the text "No tips found for this Apple ID" appears.
    - `no restore link on android`: with `canRestore={false}`, "Restore purchases" is absent.
    - `restored shows thanks`: `onRestore` resolves `'restored'`, and "Tips restored, thank you" appears.
    - `failed restore says try again`: "Couldn't reach the App Store. Try again later." appears.

- [ ] **Step 2: Run the tests and confirm they fail.**
  - Run: `cd apps/remote && pnpm jest __tests__/supporter.test.ts __tests__/support-card.test.tsx`
  - Expected: FAIL.

- [ ] **Step 3: Implement it.**
  - The link is a `Tap` styled as secondary text, placed under the tiles. It shows only when `state.available && canRestore`.
  - It is disabled while a restore is running.
  - The result line is local component state, and is cleared after 4 s.

- [ ] **Step 4: Run the tests and confirm they pass.**
  - Run: `cd apps/remote && pnpm jest && pnpm tsc --noEmit`
  - Expected: all tests pass.

- [ ] **Step 5: Commit** as `feat(tips): Restore purchases on iOS`.

### Task 3: App Store Connect products

**Files:**
- Create: `apps/remote/scripts/ios_iap.py`, which is idempotent and runs on the dev machine.
- Test: `apps/remote/scripts/test_ios_iap.py`, plain `unittest`, the same style as `scripts/play/test_playlib.py`.

**Interfaces:**
- Consumes: `call` from `ios_profile.py`; `APP_ID = "6824589391"`.
- Produces:
  - `nearest_point(points: list[tuple[str, float]], target: float) -> str`, which returns the price point id.
  - `TIPS = [("supporter_2", 2, "Small tip"), ("supporter_5", 5, "Medium tip"), ("supporter_10", 10, "Big tip")]`.
  - `DESCRIPTION = "Unlocks the badge, colours and silly perks"`. App Store IAP descriptions are limited to 45 characters.

- [ ] **Step 1: Write the failing tests.**
  - `nearest_point` picks 1.99 over 2.29 for target 2.
  - It picks the lower point on a tie: 4.99 against 5.01 for target 5.
  - `len(DESCRIPTION) <= 45`, and every title is at most 30 characters.

- [ ] **Step 2: Run the tests and confirm they fail.**
  - Run: `python3 -m unittest apps/remote/scripts/test_ios_iap.py`
  - Expected: FAIL.

- [ ] **Step 3: Implement it.** For each tip:
  - `GET /v1/apps/{APP_ID}/inAppPurchasesV2?filter[productId]=...`, otherwise `POST /v2/inAppPurchases` with type `NON_CONSUMABLE` and `reviewNote` "Optional tip. Unlocks cosmetic perks only.";
  - an `en-US` localization through `POST /v1/inAppPurchaseLocalizations`;
  - a price schedule through `POST /v1/inAppPurchasePriceSchedules`, with base territory `NLD` and the price point from `GET /v2/inAppPurchases/{id}/pricePoints?filter[territory]=NLD`;
  - availability in every territory through `POST /v1/inAppPurchaseAvailabilities`.

  Print one line per product with its state. Skip any step whose resource already exists.

- [ ] **Step 4: Run the tests, then the script, and read the result back.**
  - Run: `python3 -m unittest apps/remote/scripts/test_ios_iap.py && python3 apps/remote/scripts/ios_iap.py`
  - Expected: three lines, each with the state `MISSING_METADATA` or `READY_TO_SUBMIT`. The only metadata left is the review screenshot, which the owner adds in Task 4.

- [ ] **Step 5: Commit** as `chore(tips): App Store tip products script`.

### Task 4: Device check (owner plus Claude)

- [ ] **Step 1:** Build a TestFlight build from this branch: `apps/remote/scripts/ios-testflight.sh`. Bump to the next interim patch first with `node apps/remote/scripts/version.mjs 1.1.N`, the next free one after the last TestFlight build. Interim builds go to TestFlight only, and 1.2.0 (10200) is kept for 6c Task 7.
- [ ] **Step 2: The owner tests on the 12 mini, signed in as the sandbox tester under Settings › App Store** (TestFlight purchases are free):
  - the card shows three prices;
  - buying `supporter_2` shows the badge and unlocks the perks;
  - delete the app, reinstall from TestFlight, open Settings, and the badge is back without a tap;
  - "Restore purchases" says "Tips restored, thank you".
- [ ] **Step 3:** The owner takes a screenshot of the Support card for each IAP's review screenshot and uploads it in App Store Connect.
- [ ] **Step 4:** Record the result in `docs/probe-results.md` under "iOS tips (StoreKit)", then commit.
