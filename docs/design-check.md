# Plan 3 visual design check

Emulator `Zapbar_Phone` (Android 16, x86_64) against the real DHT-S716H "Loving room" through the emulator NAT, 2026-10-17. Screenshots in `docs/design-check/`. Owner verdict on the phone (0.2.0 arm64), 2026-10-17: "It looks great and works as expected" — PASS.

| Screen | Dark | Light | Notes |
|---|---|---|---|
| Splash | — | PASS | Lime Z on forest (after fixing the swallowed splash plugin config) |
| Launcher icon | — | PASS | Adaptive Z icon in the app drawer |
| Setup: scanning/welcome | PASS | PASS | Z pulse, "Let's find your soundbar", Plus Jakarta Sans |
| Setup: manual IP | PASS | PASS | Pill input, lime/forest Connect, outline Search again |
| Setup: label | PASS | PASS | Progress bar, brand icon tiles, outlined "Not used" |
| Setup: extras | FAIL → PASS | PASS | Off switches were invisible; fixed (muted thumb, surfaceHi track) |
| Remote (on an input) | PASS | PASS | "Now on" card (TV decoder · HDMI 1 · Movie), lime/forest active tile, pill volume, sound pills, Watch TV |
| EQ sheet | PASS | PASS | Handle, pill sliders, Reset clear of the nav bar |
| Settings | PASS | PASS | Grouped cards, active dot, disclaimer in About only |
| Inputs editor | PASS | PASS | ✓/× appear on edit; switch visible after fix |
| Leave prompt | PASS | — | Back with unsaved name → "Save changes?"; Keep editing stays; Discard restores "TV" |

Found on device and fixed with tests: blank room name while offline, double-dimmed offline controls, invisible off switches, splash config not applied.
Not checked on the emulator: streaming state (needs Spotify on the bar), large font scale. Deferred minor: "Connecting to …" title is left-aligned on the centred setup screen.
