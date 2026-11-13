# Zapbar: quick access spec

**Status:** approved in conversation 2026-10-17; written for review.
**Parent spec:** `docs/specs/2026-10-16-zapbar-design.md` §4 "Quick access". This spec refines that section and adds soundbar renaming.
**Mockups:** `.superpowers/brainstorm/2965308-1792228211/content/widgets-v4.html`.
**Owner's phone:** Samsung Galaxy S24+ (Android 14–16, One UI).

## 1. Intent

The remote app is done and approved (Plans 1–3). Quick access lets the owner, and later their partner on a phone of their own, control the soundbar without opening the app:
1. a home-screen widget;
2. the phone's volume keys;
3. a notification;
4. a Quick Settings tile.

Plan 4 also adds renaming the soundbar.

**Success criteria:**
- A widget tap changes the input or volume within 1 s, even when the app was swiped away. This matches the parent spec's "1 tap from the widget".
- With the bar playing, the phone's volume keys change the soundbar's volume, including with the screen locked, provided Android allows it (§9).
- The notification and widget always show the current input and volume while live controls run, and after every tap.
- The tile mutes and unmutes in one tap from anywhere.
- Nothing runs in the background while the bar is idle.
- Renaming the soundbar in Zapbar changes its name everywhere, if the bar accepts it.
- The app still makes no network calls beyond the LAN.

## 2. When the controls are live

| Piece | When it works |
|---|---|
| Widget, floating slider, Quick Settings tile | Any time. Each tap connects, sends, reads back the state and disconnects. |
| Volume keys, notification | While **live controls** run |

**Live controls** run while the app is in the foreground. When the app goes to the background, they stay on as long as the bar's play state is `play` (TV, console, stream).

They stop when any of these happens:
- the bar has been `pause`/`stop` for 5 minutes;
- the phone leaves home Wi-Fi (the same `isLan` rule as the app);
- the user turns both "Volume keys" and "Notification" off in Settings;
- the user swipes the app away while the bar is idle.

A widget or tile tap never starts live controls. They stay on-demand.

## 3. Native quick-access core (Kotlin)

A small local Expo module, `apps/remote/modules/zapbar-quick`, lives next to `zapbar-discovery`.

**`HeosLite`** speaks the same CLI protocol as heos-core, over TCP port 1255 with line-delimited JSON. It implements only:
- `get_players`, to find the pid by serial;
- `get_volume` / `set_volume`;
- `get_mute` / `set_mute`;
- `browse/play_input`;
- `get_now_playing_media` and `get_play_state`;
- `register_for_change_events` and parsing of the volume, mute, play-state and now-playing events.

It has the same message escaping rules and the same "command under process" handling as heos-core. Commands time out after 3 s.

**`QuickConfig`** is a JSON snapshot in SharedPreferences: device key and serial, last IP, pid, room name, and the arranged inputs (mid, label, icon id, hidden, order). It also holds the settings flags `volumeKeys` and `notification`. The JS app writes it through the module whenever any of these change: setup, an input edit, a rename, a settings toggle, a rediscovered IP. Native code only reads it. Icons map from the app's `IconId` to bundled vector drawables, using the same MaterialCommunityIcons glyphs exported as Android drawables.

**`QuickState`** is the last known volume, mute flag, active input mid and play state. It is persisted, so widgets render instantly before a reply arrives.

**JS bridge API** (TypeScript):
- `setConfig(config)`
- `setLiveWanted(appForeground: boolean)`
- `refreshWidgets()`
- `onLiveStateChanged(listener)`

**IP changes:** if a command cannot connect to `lastIp`, `HeosLite` does not run SSDP. It reports "Open Zapbar to reconnect". The app's own rediscovery saves the new IP and pushes the config. On a widget that message appears in the header for 3 s.

## 4. Live controls service

A foreground service, `LiveControlsService`, holds one `HeosLite` connection with change events registered. The foreground-service type is `connectedDevice`, which means declaring `FOREGROUND_SERVICE_CONNECTED_DEVICE` and `CHANGE_NETWORK_STATE`. The Play Console declaration for it goes in Plan 5.

The service runs:
- **The media session.** A `MediaSessionCompat` with a remote `VolumeProviderCompat`: 50 steps of 2 (0–100), current volume taken from events. Volume keys call `onAdjustVolume` / `onSetVolumeTo`, which map to `set_volume`. The session reports `PlaybackState.STATE_PLAYING` while live, so the system routes volume keys to it. It runs only when "Volume keys" is on.
- **The notification** (§6). It is shown only when "Notification" is on. If both settings are off, the service does not run at all.
- **The stop rules** from §2. A 5-minute idle timer resets on any play event.

The service publishes state to the widgets (§5) and to the JS app (`onLiveStateChanged`) on every event.

**Permission:** the app asks for `POST_NOTIFICATIONS` (Android 13+) the first time live controls would start with "Notification" on. If the user refuses, the notification stays off and the volume keys still work.

**Samsung:** One UI may put the app to "sleep" and kill the service. Settings shows one line about this, "Keep volume keys working when the app is closed", which opens the system battery-optimisation exemption for Zapbar. The widget and tile never depend on the service.

## 5. Widgets

There are two `AppWidgetProvider`s using RemoteViews. Both follow the system light/dark mode with the brand palette from Plan 3: dark is forest/lime, light is sage/white/forest.

| Widget | Layout |
|---|---|
| **4×2** | Header: Z, room name, current input on the right. Volume row: mute, volume pill, number. Bottom row: the first 4 visible inputs as tiles (icon and label), the active one in accent. |
| **4×1** | Z, mute, volume pill, number. |

**Volume pill:**
- RemoteViews cannot drag, so the pill is 20 equal clickable segments. Tapping segment *n* sets the volume to 5·(n+1), giving 5 to 100.
- The fill shows the current volume. The knob is drawn at the fill's end, as in the app.
- Tapping the number opens the floating slider (§7).

**Input tiles:** a tap calls `play_input(mid)`. The tile lights up immediately (optimistic) and is confirmed by the read-back.

**Mute:** a tap toggles `set_mute`. The icon changes to `volume-off` in the warn colour while muted.

**Taps:**
- A broadcast to a receiver, which uses `goAsync()` with the 3 s command timeout.
- Then a read-back of volume, mute and current input, written to `QuickState`.
- Then a redraw of all widgets.

**Errors:** a failed command shows "Soundbar didn't respond" in the header for 3 s. When there is no config yet, the widget shows "Open Zapbar to set up" and a tap opens the app.

## 6. Notification

A custom-layout notification (`DecoratedCustomViewStyle`) on a low-importance, silent channel called "Live controls".

**Collapsed:**
- small icon: the Z;
- title: "Zapbar · {room name}";
- line: "{current input or track} · Volume {n} · {sound mode}";
- one row with mute, volume pill (same 20-segment tap-to-set) and number.

**Expanded:** the same, plus the first 3 visible inputs as buttons, the active one in accent.

Tapping the notification body opens the app. Tapping the number opens the floating slider.

## 7. Floating slider

A translucent native `Activity` with a dialog theme, `excludeFromRecents` and its own task, so it doesn't bring the app forward. It shows:
- the room name;
- mute;
- a draggable pill slider styled like the app's, built as a custom Kotlin view with the same geometry as `PillSlider`;
- the number.

Dragging sends `set_volume` coalesced at most every 150 ms, plus the final value on release. Tapping outside, or Back, closes it. It works with the app closed, because it uses `HeosLite` directly.

## 8. Quick Settings tile

`MuteTileService` is a toggle showing "Mute · {room name}".
- **Active (lit)** while the bar is muted.
- **When the tile becomes visible** (`onStartListening`), it reads the mute state with a one-shot `get_mute`, using `QuickState` while the read is in flight.
- **A tap** toggles `set_mute`, then updates the tile.
- **Unavailable** (greyed) when there is no config.

## 9. Volume-key feasibility (first task)

Since Android 12, routing volume keys to a third-party remote-volume media session has been restricted on some versions. Task 1 is a spike on the owner's S24+ with a throwaway build: a minimal `MediaSessionCompat` with a remote `VolumeProviderCompat`, `STATE_PLAYING`, screen on and locked.

- **If the keys reach the session:** build §4 as specified.
- **If they don't:** keep the service and notification, and drop the media-session part. "Volume keys" is removed from Settings, and the notification and widget pill cover volume. Ledger it, and tell the owner.

## 10. Soundbar rename

**Task 2 probe** on the owner's bar, with read-and-restore:
1. Read the current name. Expected: `GetFriendlyName` on the ACT service, or the UPnP device description.
2. Call `SetFriendlyName` with "Loving room (test)".
3. Read back through both UPnP and `player/get_players`.
4. Restore the original name.

The results are added to `docs/probe-results.md`.

- **Works:** heos-core gains `setDeviceName(name)` (UPnP `SetFriendlyName`). The device's `players_changed` event updates the store's name; it is already handled by heos-core.
- **Refused:** Zapbar stores a nickname in `DeviceMemory` (`KnownDevice.nickname`), which overrides the reported name in the app, widget, notification and tile.

**UI:** Settings → Soundbars gets a pencil per device that opens inline editing with ✓ / × and Done, exactly like input names.
- 1–40 characters, trimmed.
- An error toast if the write fails.
- The quick-access config is pushed afterwards, so the widget and notification show the new name.

## 11. App changes

**Settings → Remote gains:**
- "Volume keys control the soundbar" (switch, on by default);
- "Show notification" (switch, on by default);
- the Samsung battery line (§4).

**Plumbing:**
- `RuntimeProvider` calls `setLiveWanted(true/false)` on foreground and background.
- The manager pushes `setConfig` whenever devices, prefs, the active device, cached inputs or flags change.

## 12. Testing

**Kotlin unit tests** (JUnit, under the module's `android/src/test`):
- `HeosLite` against a fake TCP server: escaping, "command under process", timeouts, event parsing, and `play_input` to now-playing.
- Volume-pill segment-to-volume mapping.
- `QuickConfig` JSON round-trip.
- Live-controls stop-rule timer logic, as a pure state machine with an injected clock.

**JS tests (Jest):**
- The bridge calls `setConfig` with the right snapshot after setup, an input edit, a rename or a settings toggle. The native module is mocked.
- `setLiveWanted` follows AppState.
- Settings switches and the rename editor.

**On the device (owner's S24+), checklist:**
- A widget tap with the app swiped away (input, volume segment, mute).
- The floating slider.
- Volume keys on a locked screen while the bar plays.
- The notification follows a TV-remote volume change.
- The tile.
- Wi-Fi off stops live controls.
- The bar in standby for 5 minutes stops live controls.
- A rename shows up in the HEOS app.

## 13. Out of scope

- Multiple soundbars on one widget. The widget follows the active device.
- Widget configuration screens (choosing inputs per widget). The widget uses the first visible inputs in the app's order.
- Wear OS, Android Auto, lock-screen widgets.
- iOS equivalents.
