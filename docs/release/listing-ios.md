# App Store listing — Zapbar (iOS)

`apps/remote/scripts/ios_listing.py` reads the sections below and writes them to App Store Connect. Limits: name 30, subtitle 30, keywords 100, promotional text 170, description 4000 characters. Unlike the Play listing, this leaves out the Android-only features (volume keys, notification, Quick Settings tile, floating slider). Since 1.2.0 it lists the iOS Home Screen widgets and tips. The 1.1.2 copy is at git `9a97270` if that submission needs another push.

## Name

Zapbar: Soundbar Remote

## Subtitle

One-tap inputs for soundbars

## Promotional text

Switch inputs in one tap and control volume, sound modes and EQ from one clean screen. Free, no account, no ads.

## Keywords

soundbar,sound bar,remote,volume,input,hdmi,eq,speaker,home theater,tv audio,night mode,dialogue

## Description

Zapbar is the soundbar remote you actually want: switch inputs in one tap and control volume, sound modes and EQ from one clean screen. Designed for function, no bloat.

WHAT IT DOES
• Every input on one screen, with real device icons: TV, PS5, PS4, Xbox, Switch, Steam Deck, Apple TV, Chromecast, Fire TV and more
• Volume and mute with a smooth slider
• Sound modes, dialogue enhancer, night mode and EQ
• Rename your soundbar and your inputs
• A light tap you can feel on every button
• Light and dark mode
• Home Screen widgets: volume, mute and your inputs

WHAT YOU NEED
A compatible network soundbar on the same Wi-Fi as your iPhone. Supported models are listed at zapbar.app/support; tell us yours at support@zapbar.app.

FREE
Zapbar is free and stays free. Tips unlock a supporter badge, extra accent colours, Comic Neue and some very silly perks. Nothing else, ever.

PRIVACY
Zapbar only talks to devices on your own network. No account, no analytics, no crash reporting, no ads. Your settings stay on your iPhone. Tips are processed by the App Store.

## Review notes

Zapbar is a remote control for HEOS soundbars (Denon, Marantz). It finds the soundbar on the local Wi-Fi with Bonjour (_heos-audio._tcp) and controls it over the HEOS CLI protocol (TCP port 1255). This is why it asks for Local Network access.

Without a HEOS device on the same network, the setup screen keeps searching and offers manual IP entry; that is expected. A screen recording of the app with a Denon DHT-S716H is here: {video}

Following the 5.2.1 rejection, the name, keywords and description no longer use the HEOS trademark. HEOS appears only in these notes to explain the protocol the app speaks; the protocol is publicly documented by its maker.

There is no account and no login. Tips are optional non-consumables that unlock cosmetic perks only. Restore purchases is in Settings › Support Zapbar.
