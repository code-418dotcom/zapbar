# Zapbar 6a: the app runs on iPhone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The existing Expo app builds, installs and works on the owner's iPhone 12 mini: finds the soundbar over Bonjour, handles the Local Network prompt and its denial, hides Android-only settings, and says "App Store" where Android says "Google Play".

**Architecture:** Same app, same heos-core. The two Android-only Expo modules gain an Apple side: `zapbar-discovery` gets a Swift Bonjour browser (`browseAsync`), `zapbar-quick` gets a Swift no-op stub so `requireNativeModule('ZapbarQuick')` resolves. JS picks the discovery function by `Platform.OS` in one place (`nativeDiscover()`); everything above `DeviceManager.discover` is unchanged. A Mac-side script builds for the simulator or the device over SSH.

**Tech Stack:** Expo SDK 58, RN 0.88, TypeScript 6, Jest (jest-expo, RNTL 14), Swift (Expo Modules API, Network.framework `NWBrowser`/`NWConnection`), Xcode 27.1, CocoaPods 1.17 on the Mac mini.

**Spec:** `docs/specs/2026-10-18-zapbar-ios-design.md` — this plan is §8 step 1 only. Tips (step 2), widgets (step 3, incl. `setState`) and the App Store release (step 4) are later plans. Bonjour result: `docs/probe-results.md` → "iOS discovery: Bonjour".

## Global Constraints

- Anti-goals: no Android regression; no fork of the app or heos-core; no data collection on iOS; no Settings rows on iOS that do nothing (hidden, not disabled).
- Bundle identifier `app.zapbar.remote` on both platforms; iPhone only (`supportsTablet: false`).
- Bonjour service type `_heos-audio._tcp` (domain `local.`); heos-core keeps connecting to CLI port 1255 on the resolved IPv4. The advertised port (10101) is ignored.
- Local Network usage text, verbatim: "Zapbar needs to find and control your soundbar on your Wi-Fi."
- `ios/` is generated (`expo prebuild`), never hand-edited and never committed (same as `android/`).
- No EAS. Builds run on the Mac mini (`the Mac@10.0.0.89`, repo at `~/projects/zapbar`, `. ~/tools/env.sh` first in every SSH command). The Mac only pulls from Gitea; all edits happen on the dev machine.
- Signing team `AQBG4QHRNN`, automatic signing.
- JS never branches on missing native methods: the iOS stub implements every `QuickNative` method.
- All 235 existing Jest tests and the Kotlin `zapbar-quick` tests stay green.

## Review Focus

1. **First launch, prompt still open:** iOS shows the Local Network prompt on the first browse; the user may take 10 s to tap Allow. Expected: discovery keeps waiting until the deadline and finds the bar once allowed, not "Couldn't find your soundbar" after 3 s. → Task 2 uses a 10 s iOS deadline that ends 750 ms after the first hit; device check in Task 5.
2. **Denied permission:** user taps "Don't Allow". Expected: the manual screen says why and offers "Open Settings", never an endless spinner. → Task 3 test `scan shows the denied message when discovery is denied`.
3. **Two soundbars or one with IPv6 only:** Expected: each IPv4 appears once; IPv6-only endpoints are skipped, not crashed on. → Task 2 Swift dedupes and filters to IPv4; `uniqueIps` test in Task 1.
4. **Android unchanged:** Expected: Android still calls SSDP `searchAsync` with a 3000 ms window, and Settings still shows the three quick rows. → Task 1 test `android keeps SSDP`, Task 4 test `android shows the quick rows`.
5. **Discovery throws something other than denial (Wi-Fi off, browser failed):** Expected: treated as "nothing found" (manual screen, no denial text). → Task 3 test `scan treats other discovery errors as nothing found`.

---

### Task 1: Platform-picked discovery in JS

**Files:**
- Modify: `apps/remote/modules/zapbar-discovery/index.ts`
- Modify: `apps/remote/src/runtime/discovery.ts`
- Modify: `apps/remote/src/runtime/RuntimeProvider.tsx` (`createDefaultManager`: `discover: nativeDiscover()`)
- Delete: `apps/remote/modules/zapbar-discovery/src/` (unused scaffold leftovers)
- Test: `apps/remote/__tests__/discovery.test.ts`

**Interfaces:**
- Produces:
  - native: `ZapbarDiscoveryNative.browseAsync(serviceType: string, timeoutMs: number): Promise<string[]>` (IPv4 strings; iOS only). Rejects with an error whose `code === 'LOCAL_NETWORK_DENIED'` when iOS denies local network access.
  - `export class LocalNetworkDenied extends Error` in `src/runtime/discovery.ts`.
  - `export const HEOS_BONJOUR = '_heos-audio._tcp'`, `export const IOS_BROWSE_MS = 10_000`.
  - `export type BrowseFn = (serviceType: string, timeoutMs: number) => Promise<string[]>`.
  - `export async function browseIps(browse: BrowseFn, timeoutMs = IOS_BROWSE_MS): Promise<string[]>` — dedupes via `uniqueIps`-equivalent order-preserving set; maps a rejection with `code === 'LOCAL_NETWORK_DENIED'` to `throw new LocalNetworkDenied()`; any other rejection → `[]`.
  - `export function nativeDiscover(os = Platform.OS): () => Promise<string[]>` — `'ios'` → `() => browseIps(nativeBrowse())`; otherwise `() => discoverIps(nativeSearch())` (unchanged Android path, 3000 ms).
- `discoverIps` and `nativeSearch` keep their signatures.

- [ ] **Step 1: Write the failing tests** in `__tests__/discovery.test.ts`:
  - `browseIps returns unique IPv4s in order`: browse resolves `['10.0.0.5','10.0.0.5','10.0.0.7']` → `['10.0.0.5','10.0.0.7']`; browse called with `('_heos-audio._tcp', 10000)`.
  - `browseIps maps the denied code to LocalNetworkDenied`: browse rejects `Object.assign(new Error('x'), { code: 'LOCAL_NETWORK_DENIED' })` → `rejects.toBeInstanceOf(LocalNetworkDenied)`.
  - `browseIps treats other failures as nothing found`: rejects `new Error('boom')` → `[]`.
  - `android keeps SSDP`: with `jest.mock('../modules/zapbar-discovery', …)` exposing `searchAsync` and `browseAsync` mocks, `await nativeDiscover('android')()` calls `searchAsync` with the M-SEARCH text and `3000`, and never `browseAsync`.
  - `ios browses Bonjour`: `await nativeDiscover('ios')()` calls `browseAsync('_heos-audio._tcp', 10000)` and never `searchAsync`.
- [ ] **Step 2: Run** `cd apps/remote && pnpm jest __tests__/discovery.test.ts` — expected FAIL (`browseIps` not exported).
- [ ] **Step 3: Implement** the Interfaces above. `nativeBrowse()` loads the module lazily with `require`, exactly like `nativeSearch()`.
- [ ] **Step 4: Run** `pnpm jest && pnpm tsc --noEmit` in `apps/remote` — expected all green.
- [ ] **Step 5: Commit** `feat(ios): pick Bonjour or SSDP discovery per platform`.

### Task 2: Swift side of both native modules + iOS app config

**Files:**
- Modify: `apps/remote/modules/zapbar-discovery/expo-module.config.json` → `{"platforms":["android","apple"],"android":{…unchanged},"apple":{"modules":["ZapbarDiscoveryModule"]}}`
- Create: `apps/remote/modules/zapbar-discovery/ios/ZapbarDiscovery.podspec`, `…/ios/ZapbarDiscoveryModule.swift`
- Modify: `apps/remote/modules/zapbar-quick/expo-module.config.json` (same shape, `"apple":{"modules":["ZapbarQuickModule"]}`)
- Create: `apps/remote/modules/zapbar-quick/ios/ZapbarQuick.podspec`, `…/ios/ZapbarQuickModule.swift`
- Modify: `apps/remote/app.json` (`expo.ios`), `apps/remote/scripts/release-lib.cjs` (`setVersion`), `apps/remote/scripts/version.mjs` (log line)
- Test: `apps/remote/__tests__/release.test.ts`

**Interfaces:**
- Consumes: `browseAsync(serviceType, timeoutMs)` contract from Task 1.
- Produces: `expo.ios.buildNumber` = `String(versionCodeFor(version))`.

- [ ] **Step 1: Failing test** in `release.test.ts`: `setVersion sets the iOS build number` — `setVersion({expo:{version:'1.0.0',android:{versionCode:1},ios:{buildNumber:'1'}}}, '1.1.0').expo.ios.buildNumber === '10100'`, and `expo.android.versionCode === 10100`.
- [ ] **Step 2: Run** `pnpm jest __tests__/release.test.ts` — FAIL.
- [ ] **Step 3: `setVersion`** also writes `ios: { ...expo.ios, buildNumber: String(versionCodeFor(semver)) }`; `version.mjs` logs `buildNumber` too.
- [ ] **Step 4: `app.json` `expo.ios`:**
  ```json
  "ios": {
    "bundleIdentifier": "app.zapbar.remote",
    "buildNumber": "10100",
    "supportsTablet": false,
    "appleTeamId": "AQBG4QHRNN",
    "infoPlist": {
      "NSLocalNetworkUsageDescription": "Zapbar needs to find and control your soundbar on your Wi-Fi.",
      "NSBonjourServices": ["_heos-audio._tcp"],
      "ITSAppUsesNonExemptEncryption": false
    }
  }
  ```
- [ ] **Step 5: `ZapbarDiscoveryModule.swift`** — `Name("ZapbarDiscovery")`, `AsyncFunction("browseAsync") { (serviceType: String, timeoutMs: Int, promise: Promise) in … }`:
  - `NWBrowser(for: .bonjour(type: serviceType, domain: "local."), using: .tcp)` on a private serial queue.
  - For each result endpoint, open an `NWConnection` to it; on `.ready`, read `currentPath?.remoteEndpoint`, keep the host only if it is `.ipv4` (strip any `%iface` suffix), cancel the connection.
  - Finish (resolve with the collected IPs, deduped, in discovery order) at the deadline `timeoutMs`, or 750 ms after the first IP was collected, whichever comes first. Cancel browser and connections on finish; resolve exactly once.
  - If the browser is in `.waiting(.dns(Int32(kDNSServiceErr_PolicyDenied)))` **at the deadline** and no IP was collected, reject with code `LOCAL_NETWORK_DENIED` (`promise.reject("LOCAL_NETWORK_DENIED", "Local network access denied")`). A transient `.waiting` that turns `.ready` (user tapped Allow) just continues.
  - `.failed` → resolve with what was collected.
- [ ] **Step 6: `ZapbarQuickModule.swift`** — `Name("ZapbarQuick")`, `Function` `setConfig(_ json: String)`, `setLiveWanted(_ foreground: Bool)`, `refreshWidgets()`, `openBatterySettings()`, all empty bodies with one comment: "Widgets arrive in plan 6c; the rest has no iOS equivalent (spec §3)."
- [ ] **Step 7: Podspecs** follow `create-expo-module`'s template (`s.platforms = { :ios => '16.4' }`, `s.dependency 'ExpoModulesCore'`, `s.source_files = "**/*.{h,m,swift}"`).
- [ ] **Step 8: Run** `pnpm jest && pnpm tsc --noEmit` — green. Kotlin unaffected (no Android files touched).
- [ ] **Step 9: Commit** `feat(ios): Bonjour discovery and quick stub modules, iOS app config`.

### Task 3: Local Network denial in setup

**Files:**
- Modify: `apps/remote/src/setup/flow.ts`, `apps/remote/src/ui/SetupView.tsx`, `apps/remote/app/setup.tsx`
- Test: `apps/remote/__tests__/setup-flow.test.ts`, `apps/remote/__tests__/setup-view.test.tsx`

**Interfaces:**
- Consumes: `LocalNetworkDenied` from Task 1 (thrown through `DeviceManager.scan` unchanged — `scan` must not swallow it; check `listPlayers` is only called after `discover()` resolves, which it is).
- Produces: `SetupStep` manual variant becomes `{ kind: 'manual'; error: string | null; denied?: boolean }`; `export const DENIED_TEXT = "Zapbar isn't allowed on your local network. Turn on Settings › Zapbar › Local Network, then search again."` in `flow.ts`; `SetupView` prop `onOpenSettings(): void`.

- [ ] **Step 1: Failing tests:**
  - `setup-flow.test.ts` `scan shows the denied message when discovery is denied`: fake manager `scan` rejects `new LocalNetworkDenied()` → step equals `{ kind: 'manual', error: DENIED_TEXT, denied: true }`.
  - `setup-flow.test.ts` `scan treats other discovery errors as nothing found`: `scan` rejects `new Error('x')` → `{ kind: 'manual', error: null }` (no `denied`).
  - `setup-view.test.tsx` `denied manual step offers Open Settings`: render manual step with `denied: true`; button "Open Settings" exists and calls `onOpenSettings`; "Search again" still exists. Without `denied`, no "Open Settings" button.
- [ ] **Step 2: Run** both files — FAIL.
- [ ] **Step 3: Implement.** `SetupFlow.scan` catches: `LocalNetworkDenied` → the denied step; anything else → `[]` as today. `SetupView` renders `<Pill label="Open Settings" variant="primary" block onPress={onOpenSettings} />` above "Search again" when `step.denied`. `app/setup.tsx` passes `onOpenSettings={() => void Linking.openSettings()}`.
- [ ] **Step 4: Run** `pnpm jest && pnpm tsc --noEmit` — green.
- [ ] **Step 5: Commit** `feat(ios): explain a denied Local Network permission in setup`.

### Task 4: Android-only rows hidden, platform purchase wording

**Files:**
- Modify: `apps/remote/app/settings/index.tsx` (pass `quick`, `onQuick`, `onBattery` only when `Platform.OS === 'android'`)
- Modify: `apps/remote/src/ui/SettingsView.tsx:86` (purchase line from a prop or `Platform`)
- Test: `apps/remote/__tests__/settings.test.tsx`

**Interfaces:**
- Produces: `export function purchaseLine(os: string): string` in `src/ui/SettingsView.tsx` → `'android'`: "Zapbar talks only to devices on your own network and collects no data. Purchases are handled by Google Play."; `'ios'`: same sentence ending "Purchases are handled by the App Store."

- [ ] **Step 1: Failing tests** in `settings.test.tsx`:
  - `purchase wording follows the platform`: `purchaseLine('ios')` ends with "handled by the App Store."; `purchaseLine('android')` ends with "handled by Google Play.".
  - `ios hides the quick rows`: render the settings route (as the existing route tests do) with `Platform.OS` mocked to `'ios'` → no "Volume keys control the soundbar", no "Show notification", no "Keep volume keys working when the app is closed".
  - `android shows the quick rows`: same with `'android'` → all three present.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; `SettingsView` renders `purchaseLine(Platform.OS)`.
- [ ] **Step 4: Run** `pnpm jest && pnpm tsc --noEmit` — green; `privacy-claims.test.ts` still passes (the site is step 4's job).
- [ ] **Step 5: Commit** `feat(ios): hide Android-only settings, App Store purchase wording`.

### Task 5: Mac build script and on-device check

**Files:**
- Create: `apps/remote/scripts/ios-build.sh` (runs **on the Mac**)
- Modify: `docs/release/checklist.md` (new "iOS 6a device check" section), `docs/probe-results.md` (prompt timing result)

**Interfaces:**
- `ios-build.sh <sim|device> [branch]`: `. ~/tools/env.sh`; `git -C ~/projects/zapbar fetch && checkout <branch> && pull --ff-only`; `pnpm install --frozen-lockfile`; `npx expo prebuild --platform ios --clean`; `pod install` (prebuild does it); then
  - `sim`: `xcodebuild -workspace ios/Zapbar.xcworkspace -scheme Zapbar -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17e' -derivedDataPath ios/build`, `xcrun simctl boot` (ignore already booted), `simctl install`, `simctl launch app.zapbar.remote`.
  - `device`: Release configuration, `-destination 'generic/platform=iOS' -allowProvisioningUpdates`, then `xcrun devicectl device install app` + `process launch` on the first connected physical device. Release, so the JS bundle is embedded and no Metro server is needed.
  - Logs to `~/zapbar-ios-<target>.log`, prints the last `error:` lines and `BUILD SUCCEEDED/FAILED`, exits non-zero on failure.

- [ ] **Step 1:** Write the script; run from the dev machine: `ssh the Mac@10.0.0.89 'bash ~/projects/zapbar/apps/remote/scripts/ios-build.sh sim feat/ios'` → expected `BUILD SUCCEEDED` and the app launches in the simulator (screenshot via `xcrun simctl io booted screenshot`).
- [ ] **Step 2:** Owner connects the 12 mini (trusted, Developer Mode on). Run `… ios-build.sh device feat/ios` → app installs and launches.
- [ ] **Step 3: Device check (owner, on the 12 mini)**, recorded in `docs/release/checklist.md`:
  - first launch: the Local Network prompt shows the spec wording; tap Allow within ~5 s → the bar is found without "Search again";
  - remote: input switch, volume, mute, sound mode, dialogue, night, EQ, rename;
  - Settings shows no Volume keys / notification / battery rows and says "App Store";
  - Settings › Zapbar › Local Network off → reopen → setup "Search again" shows the denied text and "Open Settings" opens iOS Settings;
  - background 1 min → foreground: the remote reconnects.
- [ ] **Step 4: Commit** `chore(ios): Mac build script and 6a device check`.

---

**Out of this plan:** StoreKit / Restore purchases (6b), widgets + `setState` + App Group (6c), App Store listing, privacy manifest, screenshots and site changes (6d). Until 6b, `billing.available()` stays Android-only, so the Support card is hidden on iOS (`SupportCard` returns null when billing is unavailable and the user is no supporter).

**Branch:** `feat/ios`, cut from `feat/1.1` (1.1 is not merged to main yet; iOS parity includes the 1.1 perks). Rebase onto main after 1.1 merges.
