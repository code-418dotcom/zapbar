# Plan 2 on-device checklist

Owner's phone (arm64 release APK, debug-signed) against the DHT-S716H "Loving room", 2026-10-17, builds 0.1.0 to 0.1.3. Emulator (Android 16 x86_64, Windows) used to reproduce item 2.

| # | Item | Result | Observed |
|---|---|---|---|
| 1 | Finds the bar within 5 s, no IP typed | PASS | Quick setup reached on first launch |
| 2 | Labelling questions, then labels on the remote | PASS (0.1.2) | 0.1.0/0.1.1: remote rendered blank after setup — hidden-tab-bar `(tabs)` group renders an empty scene on Expo Router 58; fixed by a plain Stack route |
| 3 | Spotify playing: strip shows, tiles visible, one tap switches input | PASS | Owner: "Spotify works". 0.1.2 bounced the tile to the previous input first; fixed in 0.1.3 (input settle window) |
| 4 | Volume drag follows and settles | NOT REPORTED | |
| 5 | Mute, Movie/Music, Dialogue, Night | PASS / see note | Dialogue "works perfectly". Night: no audible change; live check confirmed the bar switches night mode on (Dolby Digital compression only) |
| 6 | EQ sliders, Reset to neutral, no presets | PASS (0.1.3) | 0.1.2: Reset sat under the navigation bar; fixed |
| 7 | Watch TV Quick Select | NOT REPORTED | |
| 8 | Wi-Fi off → banner; back on → recovers | PASS | "Connect to your home Wi-Fi" shown |
| 9 | Background 1 min, reopen | NOT REPORTED | |
| 10 | HEOS app bass change followed | PASS | "HEOS EQ changes Zapbar EQ" |
| 11 | Settings → Inputs edits show on the remote | PASS | Owner asks for an explicit save/confirm for label text |
| 12 | Kill and reopen: straight to the remote, labels kept | PASS | |

Extra: TV input switches the bar; "TV decoder" switches both the TV (CEC) and the bar.

Design follow-ups from the owner: more room for the now-playing player; a save/confirm affordance when renaming inputs.
