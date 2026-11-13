# Quick access: device checklist (Plan 4, spec §12)

Run 2026-10-17. Emulator = Pixel AVD on the dev machine against the real bar (10.0.0.82); phone = owner's S24+. Every write to the bar was read back and restored.

| Check | Result | Where |
|---|---|---|
| Widget tap with the app swiped away (input, volume segment, mute) | PASS | emulator + phone (`quick-check/widgets-*.png`) |
| Widgets follow light/dark | PASS after fix (setColorStateList) | emulator |
| Floating slider | PASS | emulator (`slider-dark.png`) |
| Volume keys: in app, home screen, locked | PASS | phone (spike a/b/c) |
| Notification follows volume; no drag-to-dismiss; fits collapsed | PASS after fix (0.3.3) | phone (`notification-*.png`) |
| Quick Settings tile toggles mute | PASS | emulator (`tile*.png`) |
| Rename writes to the bar; "Applying" shown during the restart; one press | PASS after fixes (0.3.2–0.3.4) | phone |
| Remote fits one screen (Quick Select row removed) | PASS | phone (`remote-one-screen-dark.png`) |
| EQ sheet swipes down to close | PASS | emulator (0.3.5) |
| Model-specific inputs (PS4/PS5, Xbox One/Series, Switch/Switch 2, …) | PASS | phone (0.3.5) |
| Wi-Fi off stops live controls | NOT RUN | covered by LiveRulesTest only |
| Bar idle 5 min stops live controls | NOT RUN | covered by LiveRulesTest only |
| Rename shows up in the HEOS app | NOT RUN | name read back via ACT + CLI get_players |
