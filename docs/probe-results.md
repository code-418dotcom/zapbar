# Write-probe results

Device 10.0.0.82, run 2026-10-16T17:38:31.285Z

## ACT setter formats

| setting | candidate | result |
|---|---|---|
| soundMode | partial | wrote MUSIC_NORMAL, read back MUSIC_NORMAL → WORKS |
| soundMode | restore | read back MOVIE_NORMAL (original MOVIE_NORMAL) |
| dialogue | partial-nested | wrote 1, read back 1 → WORKS |
| dialogue | restore | read back 2 (original 2) |
| night | partial-nested | wrote 1, read back 1 → WORKS |
| night | restore | read back 0 (original 0) |

## Ranges

- dialogue accepted values: [0, 1, 2, 3, 4, 5] (restored to 2)
- night accepted values: [0, 1] (restored to 0)

## Tone and presets

- X_SetBass 5→6: read back 6
- SelectPreset(Rock): bass 6, treble 5, X_GetPreset ""
- SelectPreset(Disabled): bass 6, treble 5, X_GetPreset ""
- restored: bass 5 (was 5), treble 5 (was 5), preset "" (was "")

## Quick Select

- play_quickselect id=1: volume 35→35, mid "inputs/hdmi_in_1"→"inputs/hdmi_in_1"
- restored volume 35, mid "inputs/hdmi_in_1"

## Spotify Connect control via CLI

Run 2026-10-16, Spotify started from the Spotify app → device picker → "Loving room".

- now playing: sid 4, type station, song "Golden", has art yes
- set_play_state pause → get_play_state pause
- set_play_state play → get_play_state play
- play_next → song "Easy On Me"

The same run's base probe found soundMode MUSIC_NORMAL and dialogue 0 while Spotify played, against MOVIE_NORMAL and dialogue 2 on HDMI 1 earlier. The bar appears to keep sound settings per source.

## Events

Run 2026-10-16 18:00–18:02 with a listen-only CLI client. The user changed bass in the HEOS app, then switched input in the HEOS app (Spotify was playing).

- Bass change in the HEOS app: **no event of any kind**.
- Input switch: `player_state_changed pause`, then `stop` ×2, `player_queue_changed`, `player_now_playing_changed`, `player_state_changed play`, then a second `player_now_playing_changed` (~2 s for the whole sequence).
- During playback: `player_now_playing_progress` every 5 s (`cur_pos`/`duration` in ms).
- Power/standby: not tested (no remote at hand). The TV-off/CEC test is still open.

## Decisions (feed Task 6 and Plans 2–3)
- soundMode setter: partial (`<AudioConfig><soundMode>…</soundMode></AudioConfig>`). No ApplyChanges needed.
- dialogue setter: partial-nested (`<dialogueEnhance><level>n</level></dialogueEnhance>`). DIALOGUE_RANGE = { min: 0, max: 3 }. The device stores 0–5 without complaint, but the HEOS app and the manual expose Off/Low/Medium/High, so 4–5 are not real levels.
- night setter: partial-nested; NIGHT_RANGE = { min: 0, max: 1 }.
- SelectPreset side effects: none on the DHT-S716H. Bass and treble are unchanged and X_GetPreset stays "", so EQ presets are non-functional on this model. They are exposed only when X_GetPreset reports a current preset. The "Reset to neutral" button calls resetTone().
- Quick Select via CLI play_quickselect: accepted (success reply). QS1 "Watch TV" equals the current state (HDMI 1, volume 35), so there was no visible change; this confirms the command is accepted, not what it does.
- Spotify Connect via CLI: pause/play works, next works, Spotify sid = 4, artwork present. The now-playing strip needs no Spotify API.
- Sound settings appear to be per source (Spotify: MUSIC_NORMAL/dialogue 0; HDMI 1: MOVIE_NORMAL/dialogue 2). Plan 2: re-read UPnP settings after every input or source change instead of trusting the store.
- Events on HEOS-app bass change: none. **UPnP polling is required** (10 s while visible, plus a refresh on app focus).
- Input changes from another controller arrive as `player_now_playing_changed`, which the device already handles. Combined with the per-source finding, Plan 2 should trigger `refreshUpnp()` on `player_now_playing_changed` so sound settings follow the new source.
- `player_now_playing_progress` (every 5 s) is available for a progress bar; heos-core ignores it in v1.
- Power/standby: still untested (needs the TV-off/CEC test or the bar's button). Power control stays out of scope.

## Volume keys → remote media session (S24+, 2026-10-17)
Result: WORK — (a) in app: bar follows, (b) home screen: bar follows, (c) locked: bar follows.
Decision: build spec §4 media session as specified (remote VolumeProviderCompat, 50 steps of 2).

## Rename (2026-10-17)
- SCPD: ACT `GetFriendlyName` → `friendlyName`; ACT `SetFriendlyName(configurationToken, friendlyName)` needs a token. GroupControl (`/upnp/control/AiosServicesDvc/GroupControl`) `SetDeviceFriendlyName(DeviceFriendlyName)` needs none; `GetDeviceFriendlyName` returns an EMPTY string on this bar.
- Writing a name via GroupControl works: CLI `get_players` and ACT show the new name within ~20 s.
- **Writing an empty name locked up the bar's network stack** (all UPnP control URLs 404, CLI `eid=2 ID Not Valid`, HEOS app could not reach it) until a power cycle; the bar then booted as "Denon DHT-S716H". Never write an empty or whitespace-only name; read the current name from ACT or the CLI only.

## iOS discovery: Bonjour (Mac mini, 2026-10-19)
- `dns-sd -B _heos-audio._tcp` finds the bar: instance `Zanzibar` (its friendly name), host `Denon-DHT-S716H.local.`, port 10101.
- TXT: `did=3C424E4F0005CDB852FE vers=3.139.170 model=Denon DHT-S716H networkid=589cfc10ffb1`.
- Decision: iOS `zapbar-discovery` browses `_heos-audio._tcp` (NSBonjourServices + NSLocalNetworkUsageDescription). No multicast entitlement, no SSDP port. Port 10101 is ignored; heos-core connects to 1255 on the resolved IP as on Android.

## iOS widgets on device (iPhone, 1.2.1, 2026-11-03, owner)
- Tapping the volume pill segments sets the bar's volume with the app closed: the AppIntent reaches the bar over the LAN. Plan 6c Task 5 (open-app fallback) is not needed.
- Dragging the pill scrolls the home screen: WidgetKit has no drag. 1.2.2 adds − / + buttons (step 5) to both widgets.
