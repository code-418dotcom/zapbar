# Zapbar

A fast remote for Denon and Marantz soundbars and speakers that use HEOS: switch inputs with your own labels, set volume, bass, treble, dialogue and night mode, and group speakers to play together. Android and iOS.

- Android: [Google Play](https://play.google.com/store/apps/details?id=app.zapbar.remote)
- iPhone: App Store ("Zapbar: Soundbar Remote")
- Site: [zapbar.app](https://zapbar.app)

Zapbar is an independent app, not made by or affiliated with Denon, Marantz or Sound United. HEOS is their trademark.

## What it does on your network

Zapbar talks **only to devices on your own network**, over the same local interfaces the official HEOS app uses:

- **HEOS CLI**, TCP port 1255: players, volume, mute, inputs, grouping, change events.
- **UPnP/SOAP**, HTTP port 60006: bass, treble, subwoofer, sound mode, dialogue enhancer, night mode.

There is no account, no server, no analytics and no tracking. The only internet traffic is the store's own purchase flow for the optional tips. Check it yourself: every network call goes through `packages/heos-core/src/cli` and `packages/heos-core/src/upnp`.

## How it's built

Built by one developer with heavy AI assistance (Claude Code). "Vibecoded apps are scary" is a fair worry, so here's how this project keeps that in check:

- **Tests:** `@zapbar/heos-core` runs against a fake HEOS device (a real TCP and HTTP server, `packages/heos-core/test/fake`). The app has its own component and flow tests, and the native Android and iOS modules have unit tests.
- **Hardware first:** every write was probed on a real bar and read back before it shipped (`docs/probe-results.md`, `docs/quick-check.md`). Firmware quirks are documented where the code handles them, such as the empty name that locks up a bar's network stack.
- **Written plans:** design specs and implementation plans are in `docs/specs` and `docs/plans`, so you can see what was decided and why.

## Layout

| Path | What |
|---|---|
| `packages/heos-core` | Pure TypeScript HEOS control: CLI and UPnP clients, device state machine, store. No React Native. |
| `apps/remote` | The Expo / React Native app, plus native modules for Android quick settings and iOS widgets. |
| `apps/site` | zapbar.app |
| `scripts` | Store release tooling (Google Play API). |
| `docs` | Specs, plans, device probe results, release checklists. |

## Run it

Requires Node 20+, pnpm 10, and for device builds the Android SDK or Xcode.

```bash
pnpm install
pnpm typecheck
pnpm test                      # heos-core (vitest) + app (jest)
cd apps/remote && npx expo run:android   # or run:ios
```

The release scripts (`apps/remote/scripts`, `scripts/play`) expect store credentials from your own secret store. They are included for transparency, not as a turnkey pipeline.

## Feedback

Bug reports and device reports are welcome as GitHub issues. Please include your model (for example "Denon Home 150" or "Marantz SR6013"), because HEOS devices differ in what they support.

## License

MIT, see [LICENSE](LICENSE).
