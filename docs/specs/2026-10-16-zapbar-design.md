# Zapbar: design spec

**Status:** draft, 2026-10-16
**Tagline:** *The remote HEOS forgot to build.*
**Store title:** "Zapbar: Remote for HEOS soundbars"

## 1. Intent

The Denon HEOS app is slow to operate for the things people do daily: switching inputs, setting volume, changing sound settings. It also buries those controls under music-service browsing that many owners never use. Zapbar is a **remote-first** controller for HEOS soundbars and speakers.

**Origin:** the owner's Denon DHT-S716H. Pain points, ranked:
1. Basic controls are buried. HDMI inputs can't be labelled, so finding "PS5" or "Switch" means scrolling through four unnamed inputs.
2. There is no visible EQ.
3. Music-service browsing clutters the UI.
4. Soundbar settings are clunky.
5. There is no quick access from outside the app.

Reliability of the HEOS app is not a complaint.

**Success criteria:**
- **From any state, including a stream like Spotify, one tap on an input tile switches to that input.** In the HEOS app, leaving Spotify for an input took a Quick Select (reported by the owner on 2026-10-16). Zapbar must never put the user in that situation.
- Switching to a labelled input takes ≤2 taps from launch and 1 tap from the widget.
- Every control the soundbar exposes (inputs, volume, EQ, sound mode, dialogue, night mode, Quick Selects) is on one screen or one sheet.
- First-run setup takes <30 s.
- The app collects zero data.

**Product decisions:**
- It is a product, not a personal tool: support multiple devices and adapt the UI to each model's capabilities.
- It is **fully free**. A tip jar (Supporter €2/€5/€10, one-time purchases) gives cosmetic perks only, never features. This is a reputation and audience play, not a revenue line.
- Android ships first. iOS follows once there's traction.
- The name and brand never contain "HEOS" or "Denon". They appear only in compatibility wording ("Remote for HEOS").

## 2. Device protocol (probed on the DHT-S716H, firmware 3.139.170)

| Need | API |
|---|---|
| Discovery | SSDP ST `urn:schemas-denon-com:device:ACT-Denon:1` → description at `:60006/upnp/desc/aios_device/aios_device.xml` |
| Players, volume, mute, transport, now playing, change events | HEOS CLI, TCP 1255, line-delimited JSON |
| Inputs | CLI `browse/browse?sid=<pid>` → mids `inputs/hdmi_arc_1`, `hdmi_in_1..4`, `optical_in_1`, `coax_in_1`, `aux_in_1`; play with `browse/play_input` |
| Sound mode, bass boost | UPnP ACT `Get/SetAudioConfig` (`availableSoundModes`: MUSIC_NORMAL, MOVIE_NORMAL) |
| Dialogue enhancer, night mode, audio delay | UPnP ACT `Get/SetTvConfig` |
| Quick Selects | UPnP ACT `GetQuickSelectNames`, `RecallQuickSelect` |
| Bass, treble, subwoofer | UPnP RenderingControl `X_Get/SetBass`, `X_Get/SetTreble` (5 = neutral), `X_Get/SetSubwoofer` |
| EQ presets | UPnP RenderingControl `ListPresets`/`SelectPreset`: Acoustic, Classical, Jazz, Pop, Rock (the HEOS app does not expose them) |

The device has **no input names**, so labels are stored in the app.

**Must be verified before UI work (implementation task 1, write-probe):**
- Signatures of the `Set*` calls, and whether they apply without `ApplyChanges` or a configuration token.
- Value ranges for bass, treble, subwoofer, dialogue and night mode.
- Whether play/pause/next and now-playing over the CLI work during a Spotify Connect session.
- Whether power/standby can be controlled over the CLI or UPnP. If not, it's out of scope.
- Whether change events fire for UPnP-side changes. If not, poll UPnP state on focus and every 10 s while visible.

**Spotify:** the Spotify Web API is **not used**. Development mode allows 5 users, and extended access needs ≥250k MAU from a registered organization. Spotify Connect playback is controlled through HEOS, plus an "Open Spotify" deep link.

## 3. Architecture

Expo/React Native monorepo, TypeScript throughout.

```
packages/heos-core   pure TS, no RN deps, Vitest
  cli/               TCP client: command queue, "command under process" handling,
                     change-event subscription, heartbeat 30s, backoff reconnect
  upnp/              SOAP client + tolerant XML parsing (ACT, RenderingControl)
  capabilities.ts    probe Get* at connect → Capabilities (inputs, soundModes,
                     eqPresets, tone, dialogue, night, quickSelects)
  store/             normalized state; zones (groups of players, v1 = 1 member);
                     optimistic updates reconciled by device events
  playback.ts        playUrl(zone, url, metadata) interface (v1: test impl only)
packages/subsonic    v2: Subsonic API client, shared with DriveSonic
apps/remote          Expo Router app
  native/discovery   SSDP + Android MulticastLock
  native/session     MediaSession + VolumeProviderCompat (remote volume keys,
                     notification, lock screen)
  native/widget      home-screen widget; taps run a headless JS task using heos-core
```

- The UI is generated from `Capabilities`, never from a list of model names. A plain HEOS speaker gets volume, inputs and transport controls.
- Every command goes through `heos-core`. The UI, the widget and the media session all read from one store.
- Device memory (labels, icons, order, hidden inputs) lives in MMKV, keyed by **serial number**, so it survives IP changes.
- There is no backend, no accounts and no analytics.

**Room for v2:**
- Expo Router `/(tabs)/remote` is the only tab in v1, and the tab bar is hidden while only one tab exists. `/(tabs)/library` is added in v2.
- The now-playing strip consumes a source-agnostic `NowPlaying` object.
- Zones are already the state model.
- `playUrl` is already the interface Subsonic will plug into.

## 4. UI

**Main screen** (the whole app in v1):
- Device picker (only when there's more than one device) and settings.
- Now-playing strip (only for stream sources): art, title, ⏮ ⏯ ⏭, "Open Spotify".
- Input tiles: user label and icon; **always visible, whatever is playing**. The now-playing strip sits above them and never replaces, covers or collapses them; the active input lit; hidden inputs collapsed into "+N hidden". Long-press to rename, change icon, hide or reorder.
- Volume slider, mute and value.
- Sound row: Movie/Music, Dialogue level, Night toggle, EQ ›.
- Quick Select chips (hidden when unused).

**EQ sheet:**
- Bass, treble and subwoofer sliders.
- Preset chips (Flat plus the device presets).
- "Reset to neutral".

**Settings:**
- Devices.
- Inputs.
- Volume keys on/off.
- Notification on/off.
- Supporter.
- About and licences.

**First run:**
1. "Found <device>", or enter an IP manually.
2. For each HDMI input, "What's on HDMI n?" with choices TV decoder, PS5, Xbox, Switch, Apple TV, Chromecast, Other, Not used. "Not used" hides the input.
3. Done.

**Quick access**, in priority order:
1. Widget: 4×2 with volume −/+, mute and the top 4 inputs; 4×1 with volume and mute.
2. Phone volume keys control the soundbar through a remote-volume media session.
3. Persistent notification with volume, mute and input, shown while the app is in use or audio is playing. It can be turned off.
4. Quick Settings tile: mute, or a favourite input.

**Style:**
- Dark-first, Material You dynamic colour, large tap targets.
- Optimistic feedback within 100 ms. If the device disagrees, the control snaps back to the device's value.

**Out of scope:**
- Music-service browsing (TuneIn, Deezer, Tidal and so on).
- Firmware updates.
- Network setup.
- Multiroom grouping (v2+).

## 5. Connection and errors

**States:** `discovering → connecting → probing → ready ⇄ degraded → offline`.
- **degraded:** the CLI is up but UPnP is down. Volume and inputs work; sound settings are greyed out with "Soundbar settings unavailable".
- **offline:** the last state is shown dimmed with "Reconnecting…" and Retry. Controls are disabled and commands are never queued.

**Reconnect:**
- Backoff 1/2/5/10 s, capped.
- A forced reconnect on app resume and on Wi-Fi change.

**IP change:** when the stored IP fails, the app rediscovers and matches on serial.

**Command failure:**
- 3 s timeout.
- The optimistic change rolls back and a toast names the action, e.g. "Couldn't change input, soundbar didn't respond".
- No automatic retry.

**External changes** (HEOS app, TV remote, IR): device events win.

**Not on the LAN:** the app shows "Connect to your home Wi-Fi".

**Firmware drift:** unknown XML fields are ignored, and unknown sound modes are shown under their raw names.

## 6. Testing

- **Unit:** `heos-core` runs against fixtures recorded from the DHT-S716H, plus malformed and partial responses.
- **Integration:** a fake HEOS device (TCP 1255 + HTTP 60006 mock) in Vitest covers reconnects, timeouts and degraded mode.
- **Privacy tripwire:** every outbound host must be RFC1918, link-local or Google Play Billing. Anything else fails the build.
- **Manual device checklist:** widget with the app killed, volume keys with the screen locked, Wi-Fi switch, DHCP IP change, HEOS app changing state concurrently.

## 7. Distribution

**Scaffold:** `~/projects/new.sh --name zapbar --type other --no-web --no-always-on`.
- Gitea origin.
- Gitea CI runs Vitest and the typecheck.
- Android builds run locally or on EAS; iOS builds on EAS only.

**Play Console:** use the existing Code 418 organization account, which already published DriveSonic and has InnerGroove in testing. Organization accounts don't need the 12-tester closed test. A short open or closed beta with HEOS-hater testers (Reddit, Tweakers) is optional; it serves as launch seeding.

**Domain:** `zapbar.app`, registered 2026-10-16 via RealtimeRegister (auto-renew). It is in Cloudflare zone `9544fcdb703efae5d321114afd266fac`, NS carla/ryan. It will host the privacy-policy page that the Play listing requires.

**Data Safety:** no data collected or shared.

**Tip jar:** `react-native-iap` with three one-time products. The perks are a supporter badge and extra accent colours.

**iOS gate:** start Apple enrollment (€99/yr) and the multicast entitlement request when Android reaches ~1,000 installs or a ≥4.5★ rating.

**Launch channels:** r/denon, r/hometheater, r/homeassistant, Tweakers, and replies in HEOS 1★ review threads. The product README and outreach draft are part of the deliverable.

**Name checks:**
- `zapbar.app` has no DNS (likely free; confirm before registering). `zapbar.com` is taken.
- A web search on 2026-10-16 found no existing "Zapbar" app, brand or trademark.
- Watch item: Zapier enforces "Zap" in software. It sued Zoom over "Zapps" in 2020 and dismissed the suit. The EUIPO class-9 check must look at Zap-prefixed marks.
- Name history: Barkeep was dropped because of search competition from bar-inventory and cocktail apps; NEOS was dropped as too close to HEOS.
- Run an EUIPO class-9 check before investing in branding.

## 8. Roadmap

- **v1:** everything in sections 2–7.
- **v2:**
  - Subsonic/Navidrome/Gonic library tab, streaming to the soundbar via `playUrl`. The soundbar must be able to reach the server URL.
  - Multiroom grouping.
- **Later:** iOS (behind the gate above).
- **Cut line:** the Quick Settings tile is the last v1 task. If v1 runs late, it moves to v1.1 instead of delaying launch.
