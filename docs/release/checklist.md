# Release checklist — Zapbar 1.0.0 (internal track, owner + partner)

Install from the internal-testing opt-in link (Play Store), not from an APK.

| # | Check | Owner | Partner |
|---|---|---|---|
| 1 | Fresh install from the Play Store (internal) | | |
| 2 | Setup finds the soundbar and names the inputs | | |
| 3 | Remote: inputs, volume, mute, sound mode, dialogue, night, EQ | | |
| 4 | Widgets (4×2 and 4×1) work with the app swiped away | | |
| 5 | Volume keys control the bar with the screen locked while it plays | | |
| 6 | Notification controls volume, mute and inputs | | |
| 7 | Quick Settings tile mutes and unmutes | | |
| 8 | Settings → Support Zapbar shows three Play prices | | |
| 9 | Test purchase (€2) → heart next to the Z, accent colours, Comic Neue | | |
| 10 | Uninstall, reinstall from Play, open Settings → perks restored | | |
| 11 | The sideloaded 0.3.5 APK shows no Support card (billing unavailable) | | — |
| 12 | Coral + Comic Neue picked, then refund the test purchase in Console → perks and look revert after reopening Settings | | — |

## R8 device smoke (1.1.0, shrunk release build, owner)

Install the 1.1.0 release AAB and confirm each works, with no crash: discovery, connect, input switch, volume, EQ sheet, Support card with Play prices, widgets, Quick Settings tile, notification, floating slider, volume keys.

Result: PASS / FAIL with notes. Record here and commit.

## 1.1 perks and layout device smoke (owner)

- Dad mode on: volume keys, the widget + and the floating slider stop at 30.
- Bar at 60, dad mode on, volume key up: stays at 60.
- Refund the purchase with dad mode on: after reopening the app, volume keys exceed 30 again.
- Confetti bursts from the mute button on unmute, in portrait and landscape.
- Seven taps on the Z show "You are now a developer."
- Pirate labels show, and the 0-11 display works.
- Landscape setup, remote and settings scroll and look right.

Result: PASS / FAIL with notes. Record here and commit.

## iOS 6a device check (iPhone 12 mini, owner)

Run this on the TestFlight build: `ssh user@your-mac 'bash ~/projects/zapbar/apps/remote/scripts/ios-build.sh testflight feat/ios'` uploads it to App Store Connect; install from the TestFlight app on the phone. (Cable alternative: the `device` target, phone connected, unlocked, trusted, Developer Mode on.)

- First launch: the Local Network prompt shows the spec wording; tap Allow within ~5 s, the bar is found without "Search again".
- Remote: input switch, volume, mute, sound mode, dialogue, night, EQ, rename.
- Settings shows no Volume keys / notification / battery rows and says "App Store".
- Settings > Zapbar > Local Network off, reopen: setup "Search again" shows the denied text and "Open Settings" opens iOS Settings.
- Background 1 min, then foreground: the remote reconnects.

Result: PENDING (no TestFlight build uploaded yet). Record PASS / FAIL with notes here and commit.
