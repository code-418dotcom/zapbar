# Zapbar: iOS spec (Plan 6)

**Status:** design agreed in conversation 2026-10-18; written for review.
**Parent specs:** `2026-10-16-zapbar-design.md` (app), `2026-10-17-zapbar-quick-access-design.md` (widgets and quick access), `2026-10-17-zapbar-release-design.md` (Play release).
**Supersedes:** the release spec's iOS gate ("iOS once 500+ installs or positive ratings"). On 2026-10-18 the owner decided to start iOS now, while Android 1.0.1 waits for Google's review.

## 1. Intent

Zapbar on iPhone does the same as Zapbar on Android, as far as iOS allows it. The first user is the owner's wife, on her own iPhone. After that, Zapbar goes to the App Store for strangers, next to the Play version.

**Success criteria:**
- The owner's wife uses Zapbar daily on her iPhone, installed first through TestFlight and later from the App Store.
- On iPhone, the remote screen does everything it does on Android:
  - find the soundbar;
  - switch inputs, set volume and mute;
  - sound modes, dialogue, night mode and EQ;
  - rename the soundbar and its inputs;
  - the Support us shortcut and the tip jar with its perks;
  - the 1.1 supporter perks: 0–11 volume, pirate labels, tap the Z seven times, confetti on unmute, dad mode (cap also on widgets).
- Both home-screen widgets (small and large) work on iOS 17+.
- Zapbar is live on the App Store as `app.zapbar.remote`.
- Android behaviour and all existing tests are unchanged.

**Owner decisions (2026-10-18):**
- **Feature parity with Android.** No new features and no changed behaviour, except where iOS does not allow something (§3).
- **Widgets are part of v1.** They are built last, after the remote works on the phone.
- **Hardware:**
  - Build machine: the owner's Mac mini M1, running Xcode.
  - Test phone: an iPhone 12 mini the owner is buying as a dedicated test unit. The old iPhone 7 stops at iOS 15, below the 16.4 minimum.
  - The wife's iPhone is newer than the 12 mini (assumed iOS 17+, so widgets work there too). She installs through TestFlight, so her install waits for the paid account. Development milestones are reached on the 12 mini.
- **Apple Developer Program:** the owner is registering now. The choice between Individual and Organisation (Code-418) depends on Code-418's legal form at the KvK, and the owner makes it during registration. Nothing in this spec depends on which one is chosen, except the seller name shown on the App Store.

## 2. Goals, non-goals, anti-goals

**Goals:**
- One codebase:
  - the same Expo app in `apps/remote`;
  - the same `@zapbar/heos-core`;
  - the same UI;
  - the same bundle identifier `app.zapbar.remote`.
- iOS implementations of the two Android-only native modules: `zapbar-discovery`, and the widget part of `zapbar-quick`.
- Tips through StoreKit, using the same product IDs as Play: `supporter_2`, `supporter_5`, `supporter_10`.
- App Store release, with TestFlight first.

**Non-goals for v1:**
- Physical volume buttons controlling the soundbar. iOS does not allow this.
- A Quick Settings tile. The nearest thing on iOS is a Control Center control (iOS 18+), which is a later idea.
- The persistent live-controls notification and the floating volume slider. On iOS the nearest thing would be a Live Activity, which is a later idea.
- An iPad layout. The app is iPhone-only (`supportsTablet: false`).
- Apple Watch and CarPlay.

**Anti-goals** (this work fails if any of these happen, even if iOS works):
- An Android regression of any kind.
- A fork. Two diverging copies of the app or of heos-core must not exist.
- Any data collection on iOS. The "collects no data" claim and its tests hold on both platforms.
- Settings rows on iOS that do nothing. Android-only settings are hidden on iOS, not shown disabled.

## 3. What changes per platform

| Area | Android (today) | iOS v1 |
|---|---|---|
| Finding the soundbar | `zapbar-discovery`: SSDP M-SEARCH over UDP multicast | See §4 |
| Typed IP fallback | yes | yes, unchanged |
| HEOS control (TCP 1255) and UPnP (HTTP) | `react-native-tcp-socket`, fetch | same; the iOS Local Network prompt must be handled (§4) |
| Tips | Play Billing via `expo-iap` | StoreKit via `expo-iap`, plus a **Restore purchases** button (§5) |
| Widgets | `zapbar-quick` Kotlin widgets with their own HEOS client | WidgetKit extension with its own Swift HEOS client (§6) |
| Volume keys, notification, slider, QS tile | `zapbar-quick` | not available: the module's iOS side does nothing for them, and their Settings rows are hidden |
| "Keep volume keys working" (battery) row | yes | hidden |
| Purchase wording ("Purchases are handled by Google Play") | Play | App Store on iOS (Settings › About, site privacy and support pages) |

The JS calls into `zapbar-quick` (`setConfig`, `setLiveWanted`, `refreshWidgets`, `openBatterySettings`) stay. On iOS:
- `setConfig` writes the config to the shared App Group storage the widgets read;
- `refreshWidgets` asks WidgetKit to reload the widgets;
- the other two calls do nothing.

**One new call, `setState(json)`** (builder's call, 2026-10-18):
- **Why:** on Android, native code writes the widget state (`LiveControlsService`, `QuickActions` after a widget tap, the slider). iOS has no live service, so without this call a widget goes stale as soon as the user changes volume or input in the app.
- **Contents:** the live values the widgets show (volume, mute, active input, status). The app pushes it on every change, debounced.
- **On iOS:** writes the values to the App Group and reloads the widgets.
- **On Android:** does nothing, so Android behaviour is unchanged. A test pins that no-op.

The JS side never branches on missing native methods.

## 4. Finding the soundbar on iOS

SSDP over multicast needs Apple's `com.apple.developer.networking.multicast` entitlement. Apple grants it on request, and only to paid accounts, so it is a slow and uncertain dependency.

**Preferred route: Bonjour.**
- HEOS devices are expected to advertise `_heos-audio._tcp`. Home Assistant's HEOS integration discovers them that way.
- Browsing Bonjour on iOS needs no special entitlement. It only needs:
  - `NSBonjourServices` listing `_heos-audio._tcp`;
  - an `NSLocalNetworkUsageDescription`.
- The iOS side of `zapbar-discovery` browses for that service and returns IPs in the same shape the Android side returns.
- The connect-and-`get_players` flow in heos-core stays unchanged.

**Spike first (§8, step 0):** on the Mac, run `dns-sd -B _heos-audio._tcp` with the owner's DHT-S716H on the LAN. This confirms the service name before any code is written.
- If the DHT-S716H does not advertise it, the fallback is to request the multicast entitlement and port SSDP to iOS.
- Until the entitlement arrives, the typed-IP screen covers setup.

**Local Network permission:**
- iOS asks the user before the app's first local network access.
- If the user denies it, nothing connects. The app must say so plainly and point to iOS Settings › Zapbar › Local Network, not show an endless "searching".
- Wording: "Zapbar needs to find and control your soundbar on your Wi-Fi."

**Background:** iOS suspends the app and drops its sockets when it leaves the foreground. The app already reconnects on foreground (`setForeground`). Nothing runs in the background on iOS v1.

## 5. Tips on iOS

`expo-iap` already abstracts StoreKit. The changes are:
- **The availability check:** `billing.available()` currently returns false on anything but Android. It must return true on iOS when StoreKit is reachable.
- **Owned-tip detection:** must work with StoreKit's transaction model.
  - Non-consumable tips stay owned across reinstalls and devices on the same Apple ID.
  - Refunds must remove the perks, matching the Play behaviour.
- **Restore purchases:** App Review requires a visible **Restore purchases** action for non-consumables. It goes in the Support card on iOS only. Play restores automatically, so it does not get the button.
- **App Store Connect products:**
  - The same three IDs, as non-consumable.
  - Titles and descriptions as on Play.
  - Prices as close to €2, €5 and €10 as Apple's price points allow; the exact points are the builder's call.
  - Enroll in the App Store Small Business Program so Apple takes 15%, not 30%.
- **Testing:** use a sandbox tester account on the 12 mini, and TestFlight purchases (which are free).

## 6. Widgets on iOS

These mirror the Android widgets (`modules/zapbar-quick/android/.../widget/`):
- **Small** (Android 4×1, iOS small or medium; the builder picks the closest family):
  - a segmented volume bar;
  - a mute button;
  - the volume number.
  - A recent failure shows "!".
- **Large:**
  - the soundbar name and its status;
  - the volume row;
  - four input buttons, which follow the user's input order and hide the inputs the user has hidden.
- When no soundbar is configured, a tap opens the app.

**Architecture:**
- A WidgetKit extension in Swift.
- An App Group shared with the app. The app writes the quick config (`buildQuickConfig` in `src/runtime/quick.ts`) and the last known state into it.
- A small Swift HEOS client in the extension. It is a port of `HeosLite.kt`/`HeosCodec.kt`, covering volume, mute, play input and a state refresh.
- Buttons are iOS 17 interactive widgets (`AppIntent`), so the widget extension's deployment target is iOS 17. On iOS 16.4–16.x the app works without widgets.

**Open technical question (spike in §8, step 0):** can an `AppIntent` running in the widget extension open a TCP connection to the soundbar on the LAN, given the Local Network permission rules?
- **Yes:** widget taps act without opening the app, as on Android.
- **No:** the intents fall back to `openAppWhenRun`. The tap opens Zapbar, which runs the action and goes back to the remote. That is slower, but it works.

The spike result decides which one is built. The owner has been told about this fallback.

**Build plumbing:** `ios/` is generated (Continuous Native Generation), the same as `android/`, and is never hand-edited. The extension, the App Group and the entitlements are added through a config plugin. Using `@bacons/apple-targets` or a local plugin is the builder's call.

## 7. Build, signing and release

**Mac mini M1 joins the estate as the iOS build machine.** It runs no services.
- **Access (owner, 2026-10-18):** Claude drives it over SSH from the dev machine. The owner sets this up. Build, test, install on the 12 mini and the spikes all run over that SSH session.
- It clones from Gitea over the LAN (`https://github.com/code-418dotcom/zapbar`).
- It needs Xcode (current), Node, pnpm and CocoaPods.
- It gets its own vault age key only if a build script needs a secret, for example the App Store Connect API key.
- The CLAUDE.md infra section gets a line for it once it is set up. That is the owner's file; Claude proposes the line.

**Builds:**
- `expo prebuild --platform ios`, then an Xcode build and run on the 12 mini during development.
- Release: an Xcode archive, uploaded to App Store Connect.
- Upload method: Xcode Organizer, Transporter, or `xcrun altool` with an App Store Connect API key stored in the vault. The builder picks the one that can be scripted the way `scripts/play/` is.
- **No EAS**, consistent with the Android decision.

**Signing:**
- Automatic signing with the owner's team.
- Before the paid account is active, a free Apple ID can sideload to the 12 mini (builds expire after 7 days). It cannot use App Groups, so the widgets wait for the paid account.

**Versioning:**
- `scripts/version.mjs` also sets `expo.ios.buildNumber`, derived the same way as versionCode.
- iOS and Android share the marketing version.

**Release path:**
1. TestFlight, internal testing: the owner and their wife.
2. App Store review.
3. Release.

The first App Store submission is done by the owner in App Store Connect (app record, agreements, tax and banking), the same as Play's manual first steps. Claude prepares a step-by-step guide like `docs/release/first-upload.md`.

## 8. Order of work

0. **Mac and spikes.** These are throwaway and not merged.
   - Set up the Mac.
   - Run `dns-sd -B _heos-audio._tcp`.
   - A minimal widget whose `AppIntent` sends one HEOS volume command from the extension.
   - Both results are recorded in `docs/probe-results.md`.
1. **The app runs on iPhone:**
   - iOS discovery (§4) and the Local Network prompt and denial handling;
   - a `zapbar-quick` iOS stub;
   - Android-only settings rows hidden;
   - platform-aware purchase wording.
   - **Milestone:** the wife uses it via TestFlight or a sideloaded build.
2. **Tips on iOS (§5):** StoreKit, Restore purchases, App Store Connect products, sandbox test.
3. **Widgets (§6).**
4. **App Store listing and release:**
   - Listing text adapted from `docs/release/listing.md`. Remove the Android-only bullets: volume keys, Quick Settings tile, floating slider and notification.
   - App Privacy answer: "Data Not Collected".
   - Privacy manifest (`PrivacyInfo.xcprivacy`) with the required-reason API entries Expo and the libraries need.
   - Screenshots in the sizes App Store Connect requires, which the 5.4" 12 mini does not produce, so the Mac's Simulator is used.
   - Site: an App Store badge on zapbar.app; privacy and support pages cover App Store purchases.

Every step keeps the existing Android tests green and adds tests for new shared JS behaviour: billing availability per platform, hidden settings rows, purchase wording, and denial handling.

## 9. Risks

- **The name in App Review:**
  - Apple is stricter than Google about third-party trademarks in app names (guideline 5.2.1). "Zapbar: Remote for HEOS" may be rejected.
  - Fallback name: "Zapbar: Soundbar Remote", with HEOS mentioned only in the description and the not-affiliated line.
  - The owner decides if Apple rejects it.
- **Bonjour service not advertised by the DHT-S716H:** this costs the multicast-entitlement request (§4), which can take days to weeks.
- **Widget network access:** this decides between tap-acts and tap-opens-app (§6).
- **Account timing:** an Organisation account needs a D-U-N-S number, which takes about 1–2 weeks. Steps 0–1 do not wait for the account; steps 2–4 do.

## 10. Left to the builder

- Library choices for the widget target plugin and the Bonjour bridge.
- Exact widget families and the layout within Apple's widget sizes. Match the Android look and the theme tokens.
- The App Store price points nearest €2, €5 and €10.
- The upload tooling (§7).
- How the Swift HEOS client is tested (unit tests against a fake socket are expected, mirroring the Kotlin tests).
