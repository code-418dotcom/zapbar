# Zapbar 1.1 Perks and Play Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Zapbar 1.1.0 with five switchable-or-secret supporter perks and the four Play Console recommended fixes.

**Architecture:**
- Perk switches live in the existing `Appearance` record (`src/theme.ts`), so persistence (`DeviceMemory`), the supporter gate (`Supporter.setAppearance`) and the refund reset already apply. `effectiveAppearance` keeps non-supporters on defaults.
- UI reads perks through `useTheme().appearance` (already in the theme). Pirate copy comes from one table, `src/ui/copy.ts`.
- Dad mode's cap is one pure function, `capped()`, in TS (`src/runtime/volume.ts`) and Kotlin (`QuickConfig.capped`), pushed to native through `QuickConfigJs.volumeCap`.

**Tech Stack:** Expo SDK 58 / RN 0.88, TypeScript 6, Jest (jest-expo) + RNTL 14 (async API: `await render`, `await fireEvent`), zustand, Kotlin (zapbar-quick module, JUnit).

**Spec:** `docs/specs/2026-10-18-zapbar-1.1-design.md` (parent `docs/specs/2026-10-17-zapbar-release-design.md` §5, §10).

## Global Constraints

- Any tier unlocks every perk. Non-supporters never see or get a perk; a refund resets every perk to off.
- Perk defaults: `eleven: false`, `pirate: false`, `confetti: false`, `dad: false`.
- Perks are app-only, except dad mode's cap, which native quick access also enforces.
- Dad mode cap: 30. Rule: `capped(target, current, cap) = target <= current ? target : min(target, max(current, cap))`.
- Exact copy: "This one goes to 11", "Pirate labels", "Confetti on unmute", "Dad mode (max volume 30)", "Silly perks", "You are now a developer.", "It's loud enough.", subline "Zapbar is free and stays free. Tips unlock a badge, extra colours and some very silly perks, nothing else."
- No new dependencies.
- Bar commands stay 0–100.
- Version 1.1.0 → versionCode 10100 (`scripts/version.mjs`).
- Tests: `cd apps/remote && pnpm test <pattern>`; typecheck `pnpm typecheck`. Kotlin: `cd apps/remote && npx expo prebuild --platform android --clean` (only when native config changed), then `cd android && ./gradlew :zapbar-quick:testDebugUnitTest`. Never weaken an existing assertion. Existing tests that assert the old subline get the new subline, nothing else.
- Commit after every task, message `feat(perks): …` / `fix(play): …`, ending with the attribution line from the session.

## Review Focus

1. **Refund while a perk is on** (dad mode on, then refund): the cap must drop to 100 in the app and in native config. → Task 1 test `refund resets the silly perks`, Task 6 test `volumeCap follows effective appearance`.
2. **Old stored appearance** (1.0.1 JSON `{accent, font}` with no perk keys, or garbage like `dad: "yes"`): must load with all perks off, not crash. → Task 1 test `appearance() fills missing and invalid perk flags`.
3. **Dad mode switched on while the bar is at 60**: the app must not drop the volume, and a volume-up must not raise it. → Task 4 test `dad mode never raises a volume already above the cap`, Task 6 Kotlin `cappedNeverRaisesAboveCurrent`.
4. **Unmute from the widget or the soundbar while confetti is on**: no confetti (only the app's button). → Task 5 test `external unmute fires no confetti`.
5. **A renamed ARC input with pirate labels on**: keeps the user's name. → Task 3 test `pirate never touches a renamed input`.

---

### Task 1: Perk flags in Appearance

**Files:**
- Modify: `apps/remote/src/theme.ts` (Appearance, DEFAULT_APPEARANCE, `themeKey`)
- Modify: `apps/remote/src/runtime/memory.ts:156-166` (`appearance()`)
- Modify: `apps/remote/src/runtime/RuntimeProvider.tsx:78` — the context value is built from `{ accent, font }` only; it must carry the four perk flags too (select them from the supporter store and add them to the memo deps), or no perk ever reaches the UI.
- Test: `apps/remote/__tests__/memory.test.ts`, `apps/remote/__tests__/supporter.test.ts`, `apps/remote/__tests__/runtime.test.tsx` (`perk flags reach the theme context`: supporter with `pirate:true` → a probe component reading `useTheme().appearance.pirate` renders `true`)

**Interfaces:**
- Produces: `interface Appearance { accent: AccentId; font: FontId; eleven: boolean; pirate: boolean; confetti: boolean; dad: boolean }`; `DEFAULT_APPEARANCE` with all four `false`; `export type PerkId = 'eleven' | 'pirate' | 'confetti' | 'dad'`; `export const PERK_IDS: readonly PerkId[]` in that order.

- [ ] **Step 1: Write failing tests**
  - `memory.test.ts` › `appearance() fills missing and invalid perk flags`: write `{accent:'sky', font:'comic'}` → read gives `{accent:'sky', font:'comic', eleven:false, pirate:false, confetti:false, dad:false}`; write `{...DEFAULT_APPEARANCE, dad:'yes', pirate:true}` → `dad:false, pirate:true`.
  - `supporter.test.ts` › `refund resets the silly perks`: supporter sets `{dad:true, eleven:true}`; fake billing returns no ownership; after `refresh()` state and memory appearance equal `DEFAULT_APPEARANCE`.
  - `supporter.test.ts` › `a non-supporter cannot switch a perk on`: `setAppearance({pirate:true})` leaves `pirate:false`.
- [ ] **Step 2:** Run `pnpm test memory supporter` → the new tests FAIL.
- [ ] **Step 3:** Extend `Appearance`/`DEFAULT_APPEARANCE`/`PERK_IDS` in `theme.ts`; `appearance()` keeps each perk only when `=== true`. `themeKey` stays accent+font (perks don't change styles). Fix any test fixture typed `Appearance` that now misses keys by spreading `DEFAULT_APPEARANCE`.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → all PASS.
- [ ] **Step 5:** Commit `feat(perks): perk flags in Appearance`.

### Task 2: Silly perks switches in the Support card, copy and docs

**Files:**
- Modify: `apps/remote/src/ui/SupportCard.tsx`
- Modify: `docs/release/listing.md:30`, `docs/specs/2026-10-18-zapbar-ios-design.md` §1 parity list
- Test: `apps/remote/__tests__/support-card.test.tsx`

**Interfaces:**
- Consumes: `PERK_IDS`, `Appearance` (Task 1). `onAppearance(p: Partial<Appearance>)` unchanged.
- Produces: `PERK_LABELS: Record<PerkId, string>` exported from `SupportCard.tsx` with the Global Constraints copy.

- [ ] **Step 1: Write failing tests**
  - Update the existing subline assertion to the new subline.
  - `a supporter switches each silly perk`: supporter state; `getByText('Silly perks')`; for each label, `fireEvent(getByLabelText(label), 'valueChange', true)` calls `onAppearance({[id]: true})`.
  - `non-supporters never see the silly perks`: `queryByText('Silly perks')` null.
- [ ] **Step 2:** `pnpm test support-card` → FAIL.
- [ ] **Step 3:** Below the font rows, render label "Silly perks" (style `s.label`) and one row per perk: text + RN `Switch` (`accessibilityLabel` = label, `value` from `state.appearance`), visually matching `ToggleRow` in `SettingsView.tsx`. New subline. Listing sentence: "Zapbar is free and stays free. Tips unlock a supporter badge, extra accent colours, Comic Neue and some very silly perks. Nothing else, ever." iOS spec: add a parity bullet "the 1.1 supporter perks: 0–11 volume, pirate labels, tap the Z seven times, confetti on unmute, dad mode (cap also on widgets)".
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(perks): silly perks switches`.

### Task 3: Pirate labels

**Files:**
- Create: `apps/remote/src/ui/copy.ts`
- Modify: `apps/remote/src/ui/TopCard.tsx` (`bannerFor` texts, empty state), `apps/remote/src/ui/VolumeBar.tsx` (a11y labels), `apps/remote/src/ui/SettingsView.tsx` ("Soundbars" section), `apps/remote/src/runtime/inputs.ts` (`arrangeInputs` ARC label)
- Test: create `apps/remote/__tests__/copy.test.tsx`; extend `__tests__/inputs.test.ts`

**Interfaces:**
- Produces:
  - `type CopyKey = 'pickInput' | 'reconnecting' | 'offLan' | 'volume' | 'mute' | 'unmute' | 'soundbars'`
  - `copy(key: CopyKey, pirate: boolean): string` and `useCopy(): (key: CopyKey) => string` (reads `useTheme().appearance.pirate`).
  - `arrangeInputs(inputs, prefs, opts?: { pirate?: boolean })` — ARC input with no stored label gets `'Arrr-C'` instead of `'TV'`.
- Table (plain → pirate): pickInput "Pick an input below" → "Pick yer port below"; reconnecting "Reconnecting…" → "Hoisting the anchor…"; offLan "Connect to your home Wi-Fi" → "Sail back to home waters (Wi-Fi)"; volume "Volume" → "Hoist the volume"; mute "Mute" → "Silence the parrot"; unmute "Unmute" → "Free the parrot"; soundbars "Soundbars" → "Ships".

- [ ] **Step 1: Write failing tests**
  - `copy.test.tsx`: `copy('mute', false) === 'Mute'`, `copy('mute', true) === 'Silence the parrot'`; every key has a non-empty plain and pirate value; rendering `VolumeBar` inside `AppearanceContext.Provider value={{...DEFAULT_APPEARANCE, pirate:true}}` exposes `getByLabelText('Hoist the volume')` and `getByLabelText('Silence the parrot')` with `accessibilityHint` "Volume"/"Mute".
  - `inputs.test.ts` › `pirate renames the default ARC input` and `pirate never touches a renamed input` (pref label "Telly" stays "Telly").
- [ ] **Step 2:** `pnpm test copy inputs` → FAIL.
- [ ] **Step 3:** Implement. `bannerFor` gains a trailing `pirate = false` parameter and keeps returning the plain text by default (existing tests unchanged); `DEGRADED_TEXT` stays plain. Callers of `arrangeInputs` in `app/remote.tsx` and `src/runtime/quick.ts`: remote passes `{ pirate: effective.pirate }`; quick sync passes nothing (perks are app-only).
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(perks): pirate labels`.

### Task 4: 0–11 display, dad mode in the app, generic toast

**Files:**
- Create: `apps/remote/src/runtime/volume.ts`
- Modify: `apps/remote/src/ui/VolumeBar.tsx`, `apps/remote/src/ui/Toast.tsx`, `apps/remote/src/ui/RemoteView.tsx`, `apps/remote/app/remote.tsx`
- Test: create `apps/remote/__tests__/volume.test.ts`; extend `__tests__/remote.test.tsx`

**Interfaces:**
- Produces:
  - `DAD_CAP = 30`; `capped(target: number, current: number, cap: number): number`; `capFor(a: Appearance): number` (30 when `a.dad`, else 100); `elevenOf(v: number): number` = `Math.round(v * 11 / 100)`.
  - `Toast({ message }: { message: { id: string | number; text: string } | null })` — `DeviceError` already has `id` and `text`, so `RemoteView` passes `state.lastError` unchanged; local messages (`'loud'`, `'dev'`) use a counter id so repeats re-show.
  - `RemoteView` gains `onToast`-free internal state `const [note, setNote] = useState<{id:number;text:string}|null>()` and renders `<Toast message={note ?? state.lastError} />` with the newer one winning.
  - `VolumeBar` props add `eleven?: boolean`, `cap?: number` (default 100), `onCapHit?(): void`.

- [ ] **Step 1: Write failing tests**
  - `volume.test.ts`: `capped(40, 20, 30) === 30`; `capped(25, 20, 30) === 25`; `capped(10, 50, 30) === 10`; `dad mode never raises a volume already above the cap`: `capped(55, 50, 30) === 50`; `capped(70, 20, 100) === 70`; `elevenOf(100) === 11`, `elevenOf(0) === 0`, `elevenOf(50) === 6`.
  - `remote.test.tsx` › `goes to 11`: with appearance `eleven:true` and volume 100, the value text is `11`; slider stays `max 100`.
  - `remote.test.tsx` › `dad mode caps the slider and says so`: appearance `dad:true`, volume 20; slider `valueChange` 30 → `setVolume(30)` and toast "It's loud enough." visible; slider max prop is 30.
  - `remote.test.tsx` › `dad mode off for non-supporters`: supporter false with stored `dad:true` → slider max 100 (use `effectiveAppearance`).
- [ ] **Step 2:** `pnpm test volume remote` → FAIL.
- [ ] **Step 3:** Implement. `VolumeBar`: slider `max={cap}`; every `onVolume(v)` goes through `capped(v, volume, cap)`; when `cap < 100` and a drag reaches `cap`, call `onCapHit` once per drag (reset on sliding start). Value text `eleven ? elevenOf(shown) : shown`; slider a11y value text the same number. `RemoteView` reads perks from `useTheme().appearance` (the provider already applies `effectiveAppearance`; confirm in `RuntimeProvider.tsx`/`_layout.tsx` and wire it there if not).
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(perks): goes to 11 and dad mode in the app`.

### Task 5: Tap the Z seven times, confetti on unmute

**Files:**
- Create: `apps/remote/src/ui/Confetti.tsx`, `apps/remote/src/ui/useTapBurst.ts`
- Modify: `apps/remote/src/ui/RemoteView.tsx`, `apps/remote/src/ui/VolumeBar.tsx`
- Test: create `apps/remote/__tests__/perks-fun.test.tsx`

**Interfaces:**
- Consumes: `Toast` message shape, `RemoteView` note state (Task 4).
- Produces:
  - `useTapBurst(count: number, windowMs: number, onBurst: () => void): () => void` — returns a tap handler; fires when `count` taps land within `windowMs`, then resets. Uses `Date.now()`.
  - `Confetti({ burstId, origin }: { burstId: number; origin: { x: number; y: number } | null })` — renders 24 `Animated.View` pieces (`testID="confetti-piece"`) for ~1200 ms when `burstId` changes, `pointerEvents="none"`, palette colours `c.accent`, `c.warn`, `c.danger`, `c.text`; renders nothing when reduce-motion is on (`AccessibilityInfo.isReduceMotionEnabled()` read once on mount plus the `reduceMotionChanged` listener).
  - `VolumeBar` adds `onUserUnmute?(origin)` called only from the mute button press when going muted → unmuted.

- [ ] **Step 1: Write failing tests** (jest fake timers, mock `Date.now`)
  - `seven taps on the Z make a developer`: supporter; press the Z (`accessibilityLabel` "Zapbar") 7× → text "You are now a developer."; 6× → absent.
  - `taps spread over more than 3 s do nothing`.
  - `non-supporter Z is inert`: 7 taps → no toast, and the Z has no button role.
  - `unmute from the app bursts confetti`: `confetti:true`, muted; press "Unmute" → `getAllByTestId('confetti-piece').length === 24`; after advancing 1300 ms → none.
  - `external unmute fires no confetti`: rerender with `mute:false` from state → no pieces.
  - `reduce motion skips confetti`: mock `isReduceMotionEnabled` → `true`; press Unmute → no pieces.
- [ ] **Step 2:** `pnpm test perks-fun` → FAIL.
- [ ] **Step 3:** Implement. Wrap the header `ZMark` in a `Pressable` (`accessibilityLabel="Zapbar"`) only for supporters, hooked to `useTapBurst(7, 3000, …)`. Confetti overlay sits in `RemoteView`'s root above the ScrollView; origin from the mute button's `measureInWindow` (fall back to the bar's centre when null). Pieces: random x drift ±120 dp, fall 300–500 dp, rotate, fade out; `useNativeDriver: true`.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(perks): seven taps on the Z and confetti on unmute`.

### Task 6: Dad mode in native quick access

**Files:**
- Modify: `apps/remote/src/runtime/quick.ts` (`QuickConfigJs.volumeCap`, `buildQuickConfig`, `startQuickSync` also subscribes to the supporter store)
- Modify: `apps/remote/src/runtime/RuntimeProvider.tsx` (pass the supporter store to `startQuickSync`)
- Modify: `apps/remote/modules/zapbar-quick/android/src/main/java/expo/modules/zapbarquick/QuickStore.kt` (`QuickConfig.volumeCap: Int = 100`, JSON `optInt("volumeCap", 100)`, `fun capped(target: Int, current: Int): Int`)
- Modify: `QuickActions.kt:45-46`, `QuickReceiver.kt:35`, `live/LiveControlsService.kt:129-144`, `slider/SliderLink.kt:17` — route every volume change through `cfg.capped(target, current)`.
- Test: `apps/remote/__tests__/quick.test.ts`; Kotlin `QuickStoreTest.kt`, `QuickActionsTest.kt`

**Interfaces:**
- Consumes: `capFor`, `effectiveAppearance` (Tasks 1, 4).
- Produces: `buildQuickConfig(ui, devices, cap = 100)`; JSON key `volumeCap`.

- [ ] **Step 1: Write failing tests**
  - `quick.test.ts` › `volumeCap follows effective appearance`: supporter with `dad:true` → pushed JSON has `volumeCap: 30`; after refund refresh → `100`; non-supporter with stored `dad:true` → `100`.
  - `QuickStoreTest` › `volumeCap round-trips and defaults to 100` (old JSON without the key → 100); `cappedNeverRaisesAboveCurrent`: cap 30, `capped(55, 50) == 50`, `capped(40, 20) == 30`, `capped(10, 50) == 10`.
  - `QuickActionsTest` › `step up stops at the cap`: fake bar at 28, cap 30, `Step(+5)` → bar receives 30.
- [ ] **Step 2:** Run `pnpm test quick` and the Kotlin tests → FAIL.
- [ ] **Step 3:** Implement. Where native lacks a fresh current value (`SliderLink.send`), use the last saved `QuickState.volume`.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` and Kotlin tests → PASS.
- [ ] **Step 5:** Commit `feat(perks): dad mode cap on volume keys, widgets and notification`.

### Task 7: Large screens and orientation

**Files:**
- Modify: `apps/remote/app.json` (`"orientation": "default"`)
- Modify: `apps/remote/src/ui/RemoteView.tsx`, `SettingsView.tsx`, `SetupView.tsx`, `app/settings/inputs.tsx` content containers
- Modify: `apps/remote/src/theme.ts` (`export const MAX_CONTENT_WIDTH = 560`)
- Test: `apps/remote/__tests__/release.test.ts` (manifest/app.json), `remote.test.tsx`

- [ ] **Step 1: Write failing tests**
  - `release.test.ts` › `no orientation lock`: `app.json` `expo.orientation === 'default'`.
  - `remote.test.tsx` › `content is a centred column on wide screens`: the remote content style flattens to `maxWidth: 560`, `width: '100%'`, `alignSelf: 'center'`.
- [ ] **Step 2:** `pnpm test release remote` → FAIL.
- [ ] **Step 3:** Implement on each listed screen's content container. If the committed fixture `__tests__/fixtures/merged-manifest.xml` asserts `screenOrientation`, regenerate per its existing instructions.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5:** Commit `fix(play): drop the portrait lock, centre content on large screens`.

### Task 8: Edge-to-edge and bitmaps

**Files:**
- Modify (as found): `apps/remote/app/_layout.tsx`, `apps/remote/src/ui/TopCard.tsx` (art `Image` `resizeMethod="resize"`), oversized files under `apps/remote/assets/` and `modules/zapbar-quick/android/src/main/res/`, `apps/remote/package.json` (only a patch bump of `react-native-screens` inside Expo 58's range, via `npx expo install --check`)
- Create: `docs/release/play-recommendations.md` (what was fixed, what remains and why)

- [ ] **Step 1:** List every PNG/WebP in `apps/remote/assets` and module `res/` with pixel size and where it is displayed; any bitmap larger than 2× its largest displayed size (the store icon 512 px and Play graphics excepted) gets resized with `sharp` (already a devDependency; extend `scripts/brand-assets.mjs` if that script generates it, so a rerun doesn't undo the fix).
- [ ] **Step 2:** `TopCard` art `Image` gets `resizeMethod="resize"`; add a `topcard.test.tsx` assertion that the art has that prop.
- [ ] **Step 3:** Prebuild, then `grep -rn "setStatusBarColor\|setNavigationBarColor\|statusBarColor\|navigationBarColor" android/app/src node_modules/{expo-status-bar,expo-system-ui,react-native-screens,expo-router}/android --include=*.kt --include=*.java` and record each hit. Remove any Zapbar-side config/prop that triggers one; run `npx expo install --check` and accept only patch bumps.
- [ ] **Step 4:** Write `docs/release/play-recommendations.md`: each of the four recommendations, the cause found, the fix, and the remainder with its library owner.
- [ ] **Step 5:** `pnpm test && pnpm typecheck` → PASS. Commit `fix(play): bitmap sizes and edge-to-edge cleanup`.

### Task 9: R8, version 1.1.0, release build, internal track

**Files:**
- Modify: `apps/remote/app.json` (`expo-build-properties.android.enableMinifyInReleaseBuilds: true`, `enableShrinkResourcesInReleaseBuilds: true`; version via script)
- Create if needed: `apps/remote/plugins/proguard-rules.pro` wired through `expo-build-properties.android.extraProguardRules`
- Modify: `apps/remote/__tests__/release.test.ts`, `docs/release/checklist.md`

- [ ] **Step 1: Write failing test** `release.test.ts` › `release builds are shrunk`: the `expo-build-properties` android config has both flags `true`.
- [ ] **Step 2:** `pnpm test release` → FAIL; set the flags → PASS.
- [ ] **Step 3:** `node apps/remote/scripts/version.mjs 1.1.0` → `app.json` version `1.1.0`, versionCode `10100`.
- [ ] **Step 4:** `apps/remote/scripts/build-release.sh` → exits 0 and `release-check` PASS. On an R8 failure (missing class), add the narrowest `-keep` rule the error names and rebuild.
- [ ] **Step 5:** Install the release build on the owner's phone (the AAB via `bundletool` or the internal track) and run the spec §3.2 device smoke list. **Owner gate:** the owner confirms on the device; record the result in the daily note.
- [ ] **Step 6:** Upload to internal (`scripts/play/upload.py`), commit `release 1.1.0: silly perks, large screens, R8`. Production promote only on the owner's go.
