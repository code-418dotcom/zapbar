# Zapbar: visual design spec

**Status:** approved in conversation 2026-10-17; written for review.
**Parent spec:** `docs/specs/2026-10-16-zapbar-design.md` (this replaces its "Material You dynamic colour" style line).
**Inputs:** owner's brand assets in `E:\projects\zapbar\assets` (Z logos, two feature banners); mockups in `.superpowers/brainstorm/` (`visual-direction-v3.html`, `idle-top.html`).

## 1. Intent

Plan 2 shipped a working remote with a plain dark theme. It passed the owner's end-to-end test on 2026-10-17. This pass makes it look like the brand and fixes two owner remarks: the player needs more room, and renaming an input needs an explicit save.

**Who:** used day and evening, and handed to other people in the household. The owner's partner will install her own copy from the Play Store. It must be obvious to someone who never set it up.

**Success criteria:**
- The remote, EQ sheet, setup and settings all use the brand tokens in both light and dark mode. No hard-coded colours remain outside `src/theme.ts`.
- What is playing is visible at a glance: a streaming track or the active input.
- The top card never changes the layout. Switching between Spotify and an input does not move the input tiles.
- Renaming an input never saves half-typed text silently, and never loses it silently either.
- The launcher icon and splash screen show the Z.
- No behaviour change. All existing tests stay green; new UI behaviour gets tests.

## 2. Brand tokens

Colours, from the assets:

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#17301B` forest | `#F3F6EC` pale sage | screen background |
| `surface` | `#21402A` | `#FFFFFF` | cards, tiles, sheet |
| `surfaceHi` | `#2C4F33` | `#E3EAD7` | slider track, chips |
| `text` | `#F4F6EE` | `#17301B` | primary text |
| `muted` | `#A9B8A0` | `#5E7360` | secondary text |
| `accent` | `#C8F552` lime | `#17301B` forest | active fill (tile, chip, slider fill, play button) |
| `onAccent` | `#17301B` | `#C8F552` | text and icons on `accent` |
| `danger` | `#FF7A6B` | `#C0392B` | errors |
| `warn` | `#F5C451` | `#9A6B00` | banner text |
| `border` | `#2C4F33` | `#D5DDC8` | outlines (Quick Select chips, "+N hidden") |

**Rule:** lime never sits on a light background as text or as a thin line. In light mode lime appears only on forest (`onAccent`).

**Theme:** follows the phone's setting via `useColorScheme()`. `app.json` sets `userInterfaceStyle: "automatic"`. Components read colours from a `useTheme()` hook and never import a fixed palette.

**Type:** Plus Jakarta Sans (500, 700, 800), bundled with `@expo-google-fonts/plus-jakarta-sans` and loaded at startup with `expo-font`. The splash stays up until the fonts load. Scale:

| Use | Size and weight |
|---|---|
| Room name | 22/800 |
| Card title | 18/800 |
| Tile label | 13/700 |
| Body | 15/500 |
| Secondary | 13/500 |
| Chip | 12/700 |

**Shape:**
- Radius 18 for tiles and 24 for cards and the sheet.
- Chips are full pills.
- Spacing stays on the 4-pt `space(n)` scale.
- Tap targets are at least 48 dp.

**Icons:** MaterialCommunityIcons. Inputs use the real brand glyphs that already exist: `sony-playstation`, `microsoft-xbox`, `nintendo-switch`, `apple`, `cast`, `television`, `television-box`. Emoji are never used.

## 3. Remote screen

From top to bottom:

1. **Header.** The Z mark (24 dp), the room name, and the settings cog.

2. **Top card**, fixed height (about 190 dp) so the layout never jumps.
   - **Streaming** (`nowPlaying` set): full-width artwork (or a brand gradient when there is none), title, artist and source, then ⏮ ⏯ ⏭. The play button is an `accent` circle. "Open Spotify" shows for Spotify only.
   - **On an input**: the input's icon at 64 dp in `accent`, its label in card-title type, and "HDMI 1 · Movie" in `muted`. It uses a soft radial surface gradient. Long-press opens that input's editor.
   - **Unknown/offline**: the same card shows the connection banner text and a Retry button, so the banner no longer stacks above the card.

3. **Input grid.** The existing behaviour (always rendered, one tap switches) is restyled: `surface` tiles, the active tile in `accent` with `onAccent`. "+N hidden" uses an outlined tile.

4. **Volume.** A pill slider 48 dp tall: an `accent` fill with a round `bg`-coloured knob, the mute icon on the left and the number on the right. This is a custom component built on the existing drag logic (thumb held under the finger, onSlidingComplete). It keeps `testID="volume"` and supports the accessibility increment/decrement actions.

5. **Sound row.**
   - Movie/Music, Dialogue (Off/Low/Med/High) and EQ are pills.
   - Night is a pill toggle instead of a Switch.
   - The active state uses `accent`.

6. **Quick Selects.** Outlined pills.

## 4. Other screens

**EQ sheet:**
- `surface` sheet with radius 24 and a drag handle.
- Pill sliders for bass, treble and subwoofer, with values.
- Preset pills when available.
- "Reset to neutral" as an outlined pill.
- It already pads by the bottom safe-area inset.

**Setup:**
- **Welcome step:** the Z large, "Let's find your soundbar", then the scan.
- **Scanning:** an animated Z or pill pulse, not a bare spinner.
- **Label steps:**
  - a progress bar (n of N);
  - big answer tiles using the same brand icons;
  - "Not used" as an outlined tile.
- **Manual IP:**
  - a pill input;
  - an accent "Connect" button;
  - the error in `danger`.

**Settings:**
- Grouped `surface` cards: Devices, Inputs, About.
- The About card holds the disclaimer "Zapbar is not affiliated with Denon or HEOS." and the version.

**Inputs editor:**
- One row per input: icon, name field, show/hide toggle, and up/down reorder.
- **Inline rename with explicit save:**
  - Typing changes only the field. A ✓ button appears beside the field when its text differs from the saved label, and an × restores the saved text.
  - Pressing ✓ or the keyboard's Done key saves.
  - Leaving the screen (Back or the header back button) with unsaved edits asks "Save changes?" with Save / Discard / Keep editing.
  - This replaces Plan 2's save-on-every-keystroke behaviour. Save-on-change was added only because edits were being lost; the prompt now covers that.
  - Icon, visibility and order still apply immediately: they are single taps with nothing half-done.

## 5. App identity

- **Z mark:** redrawn as an SVG, `apps/remote/assets/brand/z.svg`. It is a rounded geometric Z traced from `Lime geometric Z logo-5.png` (round caps, even stroke). The PNGs are AI-generated with ragged edges and are not shipped. A small `ZMark` component renders it with `react-native-svg` in the header and setup.
- **Launcher icon:** an Android adaptive icon.
  - Foreground: the lime Z inside the safe zone.
  - Background: solid `#17301B`.
  - Monochrome layer: a white Z, for themed icons.
  - Legacy `icon.png` is 1024², generated from the SVG by a script (`scripts/brand-assets.mjs`, using `sharp`) so the PNGs can always be rebuilt.
- **Splash:** the lime Z on `#17301B`, through `expo-splash-screen` config in `app.json`.
- **Store art:** the banners stay in `E:\projects\zapbar\assets` for Plan 4.
  - The listing must not put "HEOS" in headline type ("The app that HEOS should've built"). "A remote for HEOS" as compatibility wording is fine.
  - This follows the parent spec's brand rule and Play's trademark policy.

## 6. Architecture

- **`src/theme.ts`** becomes:
  - `palettes = { dark, light }` with the token table above;
  - `type Theme = { c: Palette; space; radius; type }`;
  - `useTheme()` reading `useColorScheme()`, with a `ThemeOverride` context for tests and screenshots.
  - The `colors` export is removed. Every component moves to `useTheme()`, and styles are built per theme with a small `makeStyles(fn)` helper that memoises by scheme.
- **New UI pieces:**
  - `ZMark` (svg).
  - `PillSlider` (volume and EQ).
  - `Pill` (chip / toggle / button variants).
  - `TopCard` (streaming / input / offline), which replaces `NowPlayingStrip` and folds `ConnectionBanner`'s message in.
- **Dependencies added:**
  - `@expo-google-fonts/plus-jakarta-sans` and `expo-font`;
  - `react-native-svg`;
  - `expo-splash-screen` (config only, likely already present);
  - `sharp` (dev only, for icon generation).
  - All are Expo-supported. None makes network calls at runtime.
- **Fonts:** `RootLayout` loads the fonts and keeps the splash up until they are ready.

## 7. Testing

**Unit and RNTL (Jest):**
- `useTheme` returns the dark or light palette from the colour scheme, and the override works.
- `TopCard`:
  - streaming shows title, artist and transport, and "Open Spotify" only for Spotify;
  - on an input it shows the input's label and icon, and "HDMI 1 · Movie";
  - offline it shows the banner text and Retry, and Retry calls reconnect;
  - its height stays the same across all three (fixed-height style).
- **`PillSlider`:**
  - the drag holds the value under the finger;
  - `onSlidingComplete` sends the final value;
  - accessibility increment/decrement step by 1.
- Inputs editor:
  - ✓ appears only after a change;
  - ✓ and Done save;
  - × restores the saved text;
  - leaving with an unsaved edit triggers the prompt (via an injected `confirmLeave` callback), and Save/Discard behave as named.
- A contrast check:
  - for each palette, `onAccent` on `accent` and `text` on `bg`/`surface` meet WCAG AA (4.5:1);
  - light mode has no lime-on-light pairing.
- **Existing tests:** the owner requirements (one tap switches from a stream; tiles always rendered) carry over unchanged.

**On device:**
- Emulator screenshots of remote/streaming, remote/input, EQ, setup and settings in light and dark, checked by eye against the mockups.
- The owner reinstalls and confirms on the phone.

## 8. Out of scope

- Behaviour changes, new features, Plan 3 quick access (widget, volume keys) and the tip jar.
- Material You dynamic colour. The brand palette replaces it.
- Store listing graphics (Plan 4).
