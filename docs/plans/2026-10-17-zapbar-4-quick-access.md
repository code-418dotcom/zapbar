# Zapbar Quick Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Control the soundbar without opening Zapbar:
- 4×2 and 4×1 home-screen widgets;
- a floating volume slider;
- the phone's volume keys, while live controls run;
- a live-controls notification;
- a mute Quick Settings tile.

Users can also rename the soundbar from Settings.

**Architecture:**
- **Kotlin core:** a new local Expo module, `apps/remote/modules/zapbar-quick`, holds a small Kotlin HEOS client (`HeosLite`/`HeosQuick`). The widgets, slider, tile and a foreground `LiveControlsService` (media session plus notification) all use it directly, so none of them needs React Native running.
- **Shared state:** the JS app pushes a `QuickConfig` snapshot (device, room name, arranged inputs, settings flags) into SharedPreferences through the module. Native code reads only that snapshot plus a persisted `QuickState`.
- **Rename:** a heos-core addition (UPnP `SetFriendlyName`, verified by a probe), with a nickname in `DeviceMemory` as the fallback.

**Tech Stack:**
- Kotlin: Android SDK, `androidx.media` (`MediaSessionCompat`, `VolumeProviderCompat`), RemoteViews app widgets, `TileService`, JUnit 4 plus `org.json` for unit tests.
- App: Expo SDK 58 / React Native 0.88, TypeScript, Jest (jest-expo), RNTL 14 (async).
- Build: `@mdi/js` (dev) for vector drawables.

**Spec:** `docs/specs/2026-10-17-zapbar-quick-access-design.md` (parent: `docs/specs/2026-10-16-zapbar-design.md` §4). Mockup: `.superpowers/brainstorm/2965308-1792228211/content/widgets-v4.html`.

## Global Constraints

- **Network.** The app talks only to LAN devices. The Kotlin core connects only to `QuickConfig.lastIp` on port 1255, never SSDP (spec §3).
- **No background work at rest.** A widget or tile tap never starts live controls. Each tap connects, sends, reads back and disconnects (spec §2). Live controls run only while the app is in the foreground, or while the bar plays, plus a 5-minute idle tail.
- **Brand.**
  - RemoteViews colours come from `res/values/zq_colors.xml` and `values-night/zq_colors.xml`, and must equal `palettes.light` / `palettes.dark` in `src/theme.ts` (a test pins this).
  - Widgets use the system sans-serif (RemoteViews cannot load Plus Jakarta Sans). Ruling: an accepted platform limit.
  - "HEOS" and "Denon" never appear in widget, notification or tile text.
- **Volume pill** (widget and notification): 20 segments, and tapping segment *i* sets the volume to `5 × (i + 1)`. Volume keys step by 2 (0–100 over 50 steps). The floating slider coalesces drags to one `set_volume` per 150 ms plus the final value.
- **Commands** time out after 3 s.
  - A failed command shows "Soundbar didn't respond" for 3 s.
  - No config shows "Open Zapbar to set up".
  - An unreachable `lastIp` shows "Open Zapbar to reconnect".
- **Android package id** stays `app.zapbar.remote`. The foreground service type is `connectedDevice`.
- **Commits.** Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F
  ```
- **Branch.** Work on `feat/quick`, created from `main`. Task 1 runs on a throwaway branch, `spike/volume-keys`, which is never merged.
- **Builds on the dev machine** can hit corrupt Gradle cache files (RAM issue). After a failed build, run `~/projects/zapbar/.superpowers/bin/fix-gradle-cache`, then `./gradlew --stop`, and retry, up to 3 times.
- **APKs.**
  - **Phone:** use `-PreactNativeArchitectures=arm64-v8a -Pexpo.useLegacyPackaging=true`, copy to `E:\projects\zapbar\APK\`, and remove older APKs there with a plain `rm <file>`.
  - **Emulator:** `Zapbar_Phone`, built for `x86_64`, driven from WSL with `/mnt/c/Users/<you>/AppData/Local/Android/Sdk/platform-tools/adb.exe`.
- **Kotlin unit tests** run with `cd apps/remote && npx expo prebuild --platform android --clean` (only when native config changed) and then `cd android && ./gradlew :zapbar-quick:testDebugUnitTest`. Never weaken an assertion.
- **Library versions** are newer than the plan author's training data. If an Android, Expo or library API differs from this plan, adapt with the smallest change and ledger a ruling.
- **Live soundbar.** Probes touch the owner's real soundbar (10.0.0.82). Every write is read back and restored. Never call `system/check_account`.

## Review Focus

1. **The soundbar's IP changed since the app last ran.** Widget, tile and slider taps fail fast with "Open Zapbar to reconnect" and never hang or retry in a loop. Task 7 test: "unreachable host reports reconnect, not a crash".
2. **Rapid repeated taps** (several volume segments, or mute pressed twice quickly). Commands run in order, the widget ends on the last state, and the app does not crash with overlapping broadcasts. Task 7 test: "actions are serialised and the last read-back wins".
3. **Volume-key presses at the limits** (0 or 100) or faster than the bar answers. The volume is clamped to 0–100 and never goes negative or past 100. Task 9 test: "volume-key steps clamp at 0 and 100".
4. **The app is swiped away while the bar is idle, or the phone leaves Wi-Fi.** Live controls stop and the notification disappears, and they do not restart by themselves. Task 9 tests: "stops when idle 5 minutes in background" and "stops off the LAN".
5. **A rename with an empty name, only spaces, more than 40 characters, or an `&` or `=` character.** The rename is rejected or trimmed with a clear message, and an `&` reaches the bar intact. Tasks 2 and 3 tests: "escapes the name for SOAP" and "rejects an empty or over-long name".

---

### Task 1: Volume-key feasibility spike on the owner's S24+ (throwaway)

**Files (on branch `spike/volume-keys`, never merged):**
- Create: `apps/remote/modules/zapbar-spike/` (module skeleton, Kotlin service)
- Modify: `apps/remote/src/ui/SettingsView.tsx`, `apps/remote/app/settings/index.tsx` (a temporary "Volume key test" row)

**Interfaces:**
- Produces: a ledger result, either `volume keys: WORK` or `BLOCKED`, recorded in `docs/probe-results.md` on `main`. Task 9 reads it.

- [ ] **Step 1: Branch and generate a throwaway module**

```bash
cd ~/projects/zapbar && git checkout main && git pull -q && git checkout -b spike/volume-keys
cd apps/remote && CI=1 pnpm create expo-module@latest zapbar-spike --local --name ZapbarSpike --package expo.modules.zapbarspike -p android --features AsyncFunction --description spike --author-name "Code 418" --author-email noreply@zapbar.app --author-url https://zapbar.app --repo https://zapbar.app --license MIT --module-version 0.0.1 < /dev/null
```

- [ ] **Step 2: Write the spike service**

`apps/remote/modules/zapbar-spike/android/build.gradle`: add a dependencies block.
```groovy
dependencies {
  implementation "androidx.media:media:1.7.0"
}
```

`apps/remote/modules/zapbar-spike/android/src/main/AndroidManifest.xml`:
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE" />
  <uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
  <application>
    <service android:name="expo.modules.zapbarspike.SpikeService" android:exported="false" android:foregroundServiceType="connectedDevice" />
  </application>
</manifest>
```

`apps/remote/modules/zapbar-spike/android/src/main/java/expo/modules/zapbarspike/SpikeService.kt`:
```kotlin
package expo.modules.zapbarspike

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.media.VolumeProviderCompat
import java.net.Socket
import kotlin.concurrent.thread

// Throwaway: does the S24+ route hardware volume keys to a remote-volume media session?
class SpikeService : Service() {
  private var session: MediaSessionCompat? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val ip = intent?.getStringExtra("ip") ?: return START_NOT_STICKY
    val pid = intent.getIntExtra("pid", 0)
    var volume = intent.getIntExtra("volume", 30)
    val nm = getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(NotificationChannel("spike", "Spike", NotificationManager.IMPORTANCE_LOW))
    val n = NotificationCompat.Builder(this, "spike").setSmallIcon(android.R.drawable.ic_lock_silent_mode_off).setContentTitle("Volume key test running").build()
    if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE) else startForeground(1, n)
    val send = { v: Int ->
      thread {
        try {
          Socket(ip, 1255).use { s ->
            s.getOutputStream().write("heos://player/set_volume?pid=$pid&level=$v\r\n".toByteArray())
            s.getInputStream().bufferedReader().readLine()
          }
        } catch (e: Exception) { Log.w("ZapbarSpike", "send failed", e) }
      }
    }
    val provider = object : VolumeProviderCompat(VOLUME_CONTROL_ABSOLUTE, 50, volume / 2) {
      override fun onSetVolumeTo(v: Int) { volume = (v * 2).coerceIn(0, 100); currentVolume = volume / 2; Log.i("ZapbarSpike", "set $volume"); send(volume) }
      override fun onAdjustVolume(d: Int) { volume = (volume + d * 2).coerceIn(0, 100); currentVolume = volume / 2; Log.i("ZapbarSpike", "adjust $d -> $volume"); send(volume) }
    }
    session = MediaSessionCompat(this, "ZapbarSpike").apply {
      setPlaybackToRemote(provider)
      setPlaybackState(PlaybackStateCompat.Builder().setState(PlaybackStateCompat.STATE_PLAYING, 0, 1f).build())
      isActive = true
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    session?.release()
    super.onDestroy()
  }
}
```

Replace `ZapbarSpikeModule.kt` with:
```kotlin
package expo.modules.zapbarspike

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ZapbarSpikeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZapbarSpike")
    Function("start") { ip: String, pid: Int, volume: Int ->
      val ctx = appContext.reactContext!!
      ContextCompat.startForegroundService(ctx, Intent(ctx, SpikeService::class.java).putExtra("ip", ip).putExtra("pid", pid).putExtra("volume", volume))
    }
    Function("stop") {
      val ctx = appContext.reactContext!!
      ctx.stopService(Intent(ctx, SpikeService::class.java))
    }
  }
}
```
Set `expo-module.config.json` to `{"platforms":["android"],"android":{"modules":["expo.modules.zapbarspike.ZapbarSpikeModule"]}}`.

- [ ] **Step 3: Add a temporary "Volume key test" row**

In `apps/remote/app/settings/index.tsx`, pass a new prop into `SettingsView`:
```tsx
onSpike={() => {
  const st = m.store.getState().devices[activeKey ?? ''];
  const known = devices.find((d) => d.key === activeKey);
  if (!st?.pid || !known) return;
  require('../../modules/zapbar-spike').default.start(known.lastIp, st.pid, st.settings.volume);
}}
```
In `SettingsView`, render a row "Volume key test (spike)" that calls `onSpike` when that prop is present. This code is never merged.

- [ ] **Step 4: Build the phone APK and run the test with the owner**

Build the arm64 APK with the phone flags from Global Constraints and copy it to `E:\projects\zapbar\APK\zapbar-spike-arm64.apk`. Ask the owner to:
1. Install it, then allow notifications if asked.
2. Turn the TV on so the bar plays, open Zapbar → Settings → "Volume key test (spike)".
3. Press the phone's volume keys: (a) in Zapbar, (b) on the home screen, (c) with the screen locked. Report whether the soundbar's volume follows in each case, and what the volume panel shows.

Expected: one of
- **WORK**: the bar follows in (b) and (c);
- **PARTIAL**: only (a)/(b);
- **BLOCKED**: never.

- [ ] **Step 5: Record the result on main and discard the spike**

```bash
cd ~/projects/zapbar && git stash -u -q || true; git checkout main
```
Append to `docs/probe-results.md`:
```markdown
## Volume keys → remote media session (S24+, 2026-10-17)
Result: <WORK|PARTIAL|BLOCKED> — (a) in app: <…>, (b) home screen: <…>, (c) locked: <…>.
Decision: <build §4 media session as specified | keep service + notification, drop the media session and the "Volume keys" setting>.
```
Then:
```bash
git add docs/probe-results.md && git commit -m "probe: volume keys to a remote-volume media session on the S24+

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F" && git push -q origin main
git branch -D spike/volume-keys
git checkout -b feat/quick
```
Ledger: `Task 1: volume keys <result>`.
- **BLOCKED:** Task 9 skips the media-session steps marked **[keys]**, and Task 5 drops the "Volume keys" switch. Rule on it in the ledger and tell the owner.
- **PARTIAL:** build as specified, and note the limitation in Settings help text.

---

### Task 2: Soundbar rename in heos-core (probe first)

**Files:**
- Create: `packages/heos-core/scripts/probe-rename.ts`, `packages/heos-core/src/upnp/name.ts`
- Modify: `packages/heos-core/src/device.ts`, `packages/heos-core/src/index.ts`, `packages/heos-core/test/fake/fake-heos.ts`, `docs/probe-results.md`
- Test: `packages/heos-core/test/name.test.ts`, `packages/heos-core/test/device-commands.test.ts` (append)

**Interfaces:**
- Consumes: `soapCall`, `ACT`, `UpnpFault`, `UpnpEndpoint` from `upnp/soap.ts`; `HeosDevice` internals (`run`, `ep`, `cmds`, `upsertDevice`).
- Produces:
  - `getFriendlyName(ep): Promise<string>`
  - `setFriendlyName(ep, name: string): Promise<void>`
  - `MAX_NAME_LENGTH = 40`
  - `cleanName(raw: string): string | null` (trimmed, 1–40 characters, otherwise `null`)
  - `HeosDevice.setName(name: string): Promise<'ok' | 'unsupported' | 'failed'>`

- [ ] **Step 1: Probe the real bar (read and restore)**

`packages/heos-core/scripts/probe-rename.ts`:
```ts
// Live probe: can the bar be renamed over UPnP? Reads, writes "<name> (test)", reads back via UPnP and CLI, restores.
import { soapCall, ACT } from '../src/upnp/soap';
import { nodeHttp, nodeSocketFactory } from '../src/node';
import { HeosCliClient } from '../src/cli/client';
import { createCliCommands } from '../src/cli/commands';

const IP = process.argv[2] ?? '10.0.0.82';
const ep = { http: nodeHttp, baseUrl: `http://${IP}:60006`, timeoutMs: 4000 };

const desc = await (await fetch(`http://${IP}:60006/upnp/desc/aios_device/aios_device.xml`)).text();
const scpdUrls = [...desc.matchAll(/<SCPDURL>([^<]+)<\/SCPDURL>/g)].map((m) => m[1]!);
for (const u of scpdUrls) {
  const scpd = await (await fetch(`http://${IP}:60006${u.startsWith('/') ? '' : '/'}${u}`)).text().catch(() => '');
  for (const a of scpd.matchAll(/<action>\s*<name>([^<]*Name[^<]*)<\/name>([\s\S]*?)<\/action>/g)) {
    const args = [...a[2]!.matchAll(/<name>([^<]+)<\/name>\s*<direction>([^<]+)<\/direction>/g)].map((x) => `${x[1]}(${x[2]})`);
    console.log(`SCPD ${u}: ${a[1]} ${args.join(', ')}`);
  }
}
const cli = await HeosCliClient.connect(nodeSocketFactory, IP);
const cmds = createCliCommands(cli);
const cliName = async () => (await cmds.getPlayers())[0]?.name;
const before = await soapCall(ep, ACT, 'GetFriendlyName').catch((e) => ({ error: String(e) }));
console.log('GetFriendlyName ->', JSON.stringify(before), '| CLI name ->', await cliName());
const original = (before as Record<string, string>).FriendlyName;
if (original) {
  const res = await soapCall(ep, ACT, 'SetFriendlyName', { FriendlyName: `${original} (test)` }).then(() => 'ok', (e) => String(e));
  await new Promise((r) => setTimeout(r, 1500));
  console.log('SetFriendlyName ->', res, '| UPnP now ->', JSON.stringify(await soapCall(ep, ACT, 'GetFriendlyName').catch(String)), '| CLI now ->', await cliName());
  await soapCall(ep, ACT, 'SetFriendlyName', { FriendlyName: original }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  console.log('restored ->', JSON.stringify(await soapCall(ep, ACT, 'GetFriendlyName').catch(String)), '| CLI ->', await cliName());
}
cli.close();
```
Run: `cd ~/projects/zapbar/packages/heos-core && npx tsx scripts/probe-rename.ts 10.0.0.82`
Expected:
- the SCPD lines list the name actions and their argument names;
- the read shows "Loving room";
- after the set, both UPnP and CLI show "Loving room (test)";
- the restore shows "Loving room".

**If the action or argument names differ** (for example `X_SetFriendlyName`, or an argument called `Name`), use the names the SCPD lists in Step 4. Ledger it.
**If no rename action exists, or the write is refused:** ledger `Task 2: rename UNSUPPORTED`. Implement `name.ts` and `setName` anyway (so the code path exists and Task 3's nickname fallback is exercised), but Task 3 treats `unsupported` as the normal path.

Append the result to `docs/probe-results.md` under `## Rename (2026-10-17)`. Copy the console lines minus anything that is not a name.

- [ ] **Step 2: Write the failing tests**

`packages/heos-core/test/name.test.ts`:
```ts
import { afterEach, beforeEach, expect, it } from 'vitest';
import { nodeHttp } from '../src/node';
import { cleanName, getFriendlyName, MAX_NAME_LENGTH, setFriendlyName } from '../src/upnp/name';
import { FakeHeos } from './fake/fake-heos';

let fake: FakeHeos;
beforeEach(async () => { fake = await FakeHeos.start(); });
afterEach(async () => { await fake.stop(); });
const ep = () => ({ http: nodeHttp, baseUrl: `http://127.0.0.1:${fake.httpPort}`, timeoutMs: 1000 });

it('reads and writes the friendly name', async () => {
  expect(await getFriendlyName(ep())).toBe('Loving room');
  await setFriendlyName(ep(), 'Living room');
  expect(fake.state.name).toBe('Living room');
});

it('escapes the name for SOAP', async () => {
  await setFriendlyName(ep(), 'Tom & Jerry <3 = fun');
  expect(fake.state.name).toBe('Tom & Jerry <3 = fun');
});

it('rejects an empty or over-long name', () => {
  expect(cleanName('  Bedroom  ')).toBe('Bedroom');
  expect(cleanName('   ')).toBeNull();
  expect(cleanName('x'.repeat(MAX_NAME_LENGTH + 1))).toBeNull();
  expect(cleanName('x'.repeat(MAX_NAME_LENGTH))).toHaveLength(MAX_NAME_LENGTH);
});
```

Append to `packages/heos-core/test/device-commands.test.ts`:
```ts
describe('rename', () => {
  it('renames the bar and updates the store', async () => {
    await ready();
    expect(await dev.setName('Living room')).toBe('ok');
    expect(fake.state.name).toBe('Living room');
    expect(st().name).toBe('Living room');
  });

  it('reports unsupported when the bar faults the action', async () => {
    await ready();
    fake.faultActions.add('SetFriendlyName');
    expect(await dev.setName('Living room')).toBe('unsupported');
    expect(st().name).toBe('Loving room');
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd packages/heos-core && pnpm test name device-commands`
Expected: FAIL. `../src/upnp/name` is missing and `dev.setName` is not a function.

- [ ] **Step 4: Implement**

Add to the fake device's SOAP switch in `packages/heos-core/test/fake/fake-heos.ts`, inside the action `switch`, next to `GetTvConfig`:
```ts
        case 'GetFriendlyName': return ok(`<FriendlyName>${xmlEscape(s.name)}</FriendlyName>`);
        case 'SetFriendlyName': s.name = xmlUnescape(arg('FriendlyName') ?? s.name); return ok('');
```
If `xmlEscape`/`xmlUnescape` helpers don't exist in the fake, add them at the top:
```ts
const xmlEscape = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xmlUnescape = (v: string) => v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
```
`arg()` reads the raw XML text of the argument. Whatever the fake's existing `arg` does, the name must round-trip `Tom & Jerry <3 = fun`.

`packages/heos-core/src/upnp/name.ts` (use the action and argument names Step 1 found):
```ts
import { ACT, soapCall, type UpnpEndpoint } from './soap';

export const MAX_NAME_LENGTH = 40;

/** Trimmed name of 1–40 characters, or null when it cannot be used. */
export function cleanName(raw: string): string | null {
  const name = raw.trim();
  return name.length >= 1 && name.length <= MAX_NAME_LENGTH ? name : null;
}

export async function getFriendlyName(ep: UpnpEndpoint): Promise<string> {
  const out = await soapCall(ep, ACT, 'GetFriendlyName');
  return out.FriendlyName ?? '';
}

export async function setFriendlyName(ep: UpnpEndpoint, name: string): Promise<void> {
  await soapCall(ep, ACT, 'SetFriendlyName', { FriendlyName: name });
}
```

In `packages/heos-core/src/device.ts`, add a public method next to the other commands:
```ts
  /** Renames the bar itself (HEOS app, Spotify Connect, TV all follow). 'unsupported' = the bar refused the action. */
  async setName(raw: string): Promise<'ok' | 'unsupported' | 'failed'> {
    const name = cleanName(raw);
    if (!name || !this.upnpAllowed()) return 'failed';
    try {
      await setFriendlyName(this.ep, name);
    } catch (e) {
      if (e instanceof UpnpFault) return 'unsupported';
      this.report(this.failText("Couldn't rename the soundbar", e));
      return 'failed';
    }
    upsertDevice(this.o.store, this.key, { name });
    return 'ok';
  }
```
Import `cleanName`, `setFriendlyName` from `./upnp/name`; `UpnpFault` is already imported. Export `cleanName`, `getFriendlyName`, `setFriendlyName` and `MAX_NAME_LENGTH` from `src/index.ts`.

- [ ] **Step 5: Run the full heos-core suite**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(heos-core): rename the soundbar over UPnP (probed on the DHT-S716H)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 3: Rename in the app (nickname fallback and Settings UI)

**Files:**
- Modify: `apps/remote/src/runtime/memory.ts`, `apps/remote/src/runtime/manager.ts`, `apps/remote/src/ui/SettingsView.tsx`, `apps/remote/src/ui/RemoteView.tsx`, `apps/remote/app/settings/index.tsx`, `apps/remote/app/remote.tsx`
- Test: `apps/remote/__tests__/manager.test.ts`, `apps/remote/__tests__/settings.test.tsx`, `apps/remote/__tests__/remote.test.tsx` (append and adjust)

**Interfaces:**
- Consumes: `HeosDevice.setName`, `cleanName`, `MAX_NAME_LENGTH` (Task 2).
- Produces:
  - `KnownDevice.nickname?: string`
  - `displayName(known: KnownDevice | undefined, state: DeviceState | null | undefined): string`
  - `DeviceManager.renameDevice(key, name): Promise<'device' | 'nickname' | 'invalid' | 'failed'>`
  - `SettingsView` prop `onRename(key, name): Promise<string | null>` (returns an error text or `null`)
  - `RemoteView` prop `displayName?: string`, which replaces Plan 3's `fallbackName`

- [ ] **Step 1: Write the failing tests**

Append to `apps/remote/__tests__/manager.test.ts` (Node environment, real `FakeHeos`):
```ts
describe('rename', () => {
  it('renames the bar itself when it accepts', async () => {
    const m = make();
    m.adopt((await m.scan())[0]!);
    await waitFor(() => status(m) === 'ready');
    expect(await m.renameDevice(KEY, '  Living room ')).toBe('device');
    expect(fake.state.name).toBe('Living room');
    expect(m.ui.getState().devices[0]!.nickname).toBeUndefined();
  });

  it('falls back to a Zapbar nickname when the bar refuses', async () => {
    const m = make();
    m.adopt((await m.scan())[0]!);
    await waitFor(() => status(m) === 'ready');
    fake.faultActions.add('SetFriendlyName');
    expect(await m.renameDevice(KEY, 'Living room')).toBe('nickname');
    expect(new DeviceMemory(kv).devices()[0]!.nickname).toBe('Living room');
  });

  it('rejects an empty or over-long name', async () => {
    const m = make();
    m.adopt((await m.scan())[0]!);
    expect(await m.renameDevice(KEY, '   ')).toBe('invalid');
    expect(await m.renameDevice(KEY, 'x'.repeat(41))).toBe('invalid');
  });
});
```

Append to `apps/remote/__tests__/settings.test.tsx`:
```tsx
describe('rename soundbar', () => {
  const h = () => ({ onActivate: jest.fn(), onForget: jest.fn(), onAddDevice: jest.fn(), onInputs: jest.fn(), onRename: jest.fn(async () => null) });

  it('edits the name inline and saves with the check button', async () => {
    const p = h();
    await render(<SettingsView devices={DEVICES} activeKey="S1" statusOf={() => 'ready'} version="0.1.0" {...p} />);
    await fireEvent.press(screen.getByLabelText('Rename Loving room'));
    await fireEvent.changeText(screen.getByLabelText('Name for Loving room'), 'Living room');
    await fireEvent.press(screen.getByLabelText('Save name for Loving room'));
    expect(p.onRename).toHaveBeenCalledWith('S1', 'Living room');
  });

  it('shows the error the screen returns and keeps editing', async () => {
    const p = { ...h(), onRename: jest.fn(async () => "Couldn't rename the soundbar") };
    await render(<SettingsView devices={DEVICES} activeKey="S1" statusOf={() => 'ready'} version="0.1.0" {...p} />);
    await fireEvent.press(screen.getByLabelText('Rename Loving room'));
    await fireEvent.changeText(screen.getByLabelText('Name for Loving room'), 'Living room');
    await fireEvent.press(screen.getByLabelText('Save name for Loving room'));
    expect(await screen.findByText("Couldn't rename the soundbar")).toBeTruthy();
    expect(screen.getByLabelText('Name for Loving room')).toBeTruthy();
  });

  it('shows a nickname instead of the reported name', async () => {
    await render(<SettingsView devices={[{ ...DEVICES[0]!, nickname: 'Den' }]} activeKey="S1" statusOf={() => 'ready'} version="0.1.0" {...h()} />);
    expect(screen.getByText('Den')).toBeTruthy();
  });
});
```

In `apps/remote/__tests__/remote.test.tsx`, replace the Plan 3 test "shows the remembered room name while the soundbar has not reported one yet" with:
```tsx
it('shows the display name chosen by the screen', async () => {
  await render(<RemoteView state={deviceState({ name: '', status: 'offline' })} displayName="Loving room" inputs={inputs} onLan actions={actions()} />);
  expect(screen.getByText('Loving room')).toBeTruthy();
});
```
This is a ruling: the prop is renamed because a nickname must override the reported name, not just fill in for it.

Add to the same file, importing `displayName` from `'../src/runtime/memory'`:
```tsx
it('displayName prefers nickname, then the reported name, then the remembered one', () => {
  const known = { key: 'S1', name: 'Old', model: 'm', lastIp: 'x' };
  expect(displayName({ ...known, nickname: 'Den' }, deviceState())).toBe('Den');
  expect(displayName(known, deviceState())).toBe('Loving room');
  expect(displayName(known, deviceState({ name: '' }))).toBe('Old');
  expect(displayName(undefined, null)).toBe('');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/remote && pnpm test manager settings remote`
Expected: FAIL. `renameDevice`, `displayName`, `onRename` and the rename UI are all missing.

- [ ] **Step 3: Implement**

`apps/remote/src/runtime/memory.ts`:
- Add `nickname?: string;` to `KnownDevice`.
- Add this exported helper:
```ts
import type { DeviceState } from '@zapbar/heos-core';

/** A Zapbar nickname wins; otherwise the bar's reported name, then the name remembered at setup. */
export function displayName(known: KnownDevice | undefined, state: DeviceState | null | undefined): string {
  return known?.nickname || state?.name || known?.name || '';
}
```

In `apps/remote/src/runtime/manager.ts`, add the method:
```ts
  async renameDevice(key: string, raw: string): Promise<'device' | 'nickname' | 'invalid' | 'failed'> {
    const name = cleanName(raw);
    const known = this.ui.getState().devices.find((d) => d.key === key);
    if (!name || !known) return 'invalid';
    const result = (await this.devices.get(key)?.setName(name)) ?? 'unsupported';
    if (result === 'failed') return 'failed';
    if (result === 'ok') {
      const { nickname: _old, ...rest } = known;
      this.saveKnown({ ...rest, name });
      return 'device';
    }
    this.saveKnown({ ...known, nickname: name });
    return 'nickname';
  }
```
Import `cleanName` from `@zapbar/heos-core`. `saveKnown` already writes memory and the ui. Make sure `saveKnown` stores the object as given: a `nickname` key omitted from the object must disappear from memory.

`apps/remote/src/ui/SettingsView.tsx`: per device row, add a pencil button (`accessibilityLabel={\`Rename ${shownName}\`}`, icon `pencil-outline`) that switches the row into edit mode:
- a `TextInput` with `accessibilityLabel={\`Name for ${shownName}\`}` and `maxLength={40}`;
- an `×` button (`Undo name change for …`);
- a `✓` button (`Save name for …`), with `onSubmitEditing` also saving.

Saving calls `await onRename(d.key, text)`. A returned string is shown under the field in `c.danger` and the row stays in edit mode. `null` leaves edit mode. The shown name is `d.nickname || d.name`. Add `onRename(key: string, name: string): Promise<string | null>` to `Props`.

`apps/remote/app/settings/index.tsx`: pass
```tsx
onRename={async (key, name) => {
  const r = await m.renameDevice(key, name);
  return r === 'invalid' ? 'Use 1 to 40 characters' : r === 'failed' ? "Couldn't rename the soundbar" : null;
}}
```

`apps/remote/src/ui/RemoteView.tsx`: rename the prop `fallbackName` to `displayName?: string`, and render `{displayName || state.name}`.

`apps/remote/app/remote.tsx`: compute `const known = useUi((s) => s.devices.find((d) => d.key === state?.key));` and pass `displayName={displayName(known, state)}` instead of `fallbackName`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(remote): rename the soundbar from Settings, nickname fallback

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 4: zapbar-quick module and the Kotlin HEOS client

**Files:**
- Create (generator): `apps/remote/modules/zapbar-quick/`
- Create: `apps/remote/modules/zapbar-quick/android/src/main/java/expo/modules/zapbarquick/heos/HeosCodec.kt`, `HeosLite.kt`, `HeosQuick.kt`
- Modify: `apps/remote/modules/zapbar-quick/android/build.gradle`, `expo-module.config.json`, `index.ts`
- Test: `apps/remote/modules/zapbar-quick/android/src/test/java/expo/modules/zapbarquick/heos/HeosLiteTest.kt`, `FakeHeosServer.kt`

**Interfaces:**
- Produces (Kotlin, package `expo.modules.zapbarquick.heos`):
  - `object HeosCodec { encode(v); decode(v); parse(message): Map<String,String>; build(command, params: Map<String, Any>): String }`
  - `data class Reply(command: String, message: Map<String,String>, payload: Any?)`
  - `class HeosException(message: String) : Exception`
  - `class UnreachableException(message: String) : Exception`
  - `class HeosLite(host, port = 1255, timeoutMs = 3000L)`:
    - `connect()`, `close()`
    - `send(command, params = emptyMap()): Reply`, which blocks and throws `HeosException` on fail or timeout
    - `onEvent: ((event: String, message: Map<String,String>) -> Unit)?`
  - `class HeosQuick(lite: HeosLite)`:
    - `pidFor(serial): Int`
    - `volume(pid): Int`, `setVolume(pid, v)`
    - `mute(pid): Boolean`, `setMute(pid, on)`
    - `playInput(pid, mid)`
    - `nowPlayingMid(pid): String?`, `playState(pid): String`
    - `registerEvents()`

- [ ] **Step 1: Generate the module and add test dependencies**

```bash
cd ~/projects/zapbar/apps/remote && CI=1 pnpm create expo-module@latest zapbar-quick --local --barrel --name ZapbarQuick --package expo.modules.zapbarquick -p android --features Function Event --description "Zapbar quick access" --author-name "Code 418" --author-email noreply@zapbar.app --author-url https://zapbar.app --repo https://zapbar.app --license MIT --module-version 0.1.0 < /dev/null
```
Delete the generated web/view/types sources, keeping only `index.ts`, `expo-module.config.json` and `android/`:
```bash
cd modules/zapbar-quick && rm src/ZapbarQuick.types.ts src/ZapbarQuickModule.web.ts src/ZapbarQuickModule.ts && rmdir src
```

`apps/remote/modules/zapbar-quick/android/build.gradle`: add after the `android { … }` block:
```groovy
dependencies {
  implementation "androidx.media:media:1.7.0"
  implementation "androidx.core:core-ktx:1.13.1"
  testImplementation "junit:junit:4.13.2"
  testImplementation "org.json:json:20240303"
}
```
`org.json` is needed because Android's own `org.json` is stubbed in JVM unit tests.

Add to `apps/remote/.gitignore`: nothing. `modules/*/android/build/` is already ignored.

- [ ] **Step 2: Write the failing Kotlin tests**

`android/src/test/java/expo/modules/zapbarquick/heos/FakeHeosServer.kt`:
```kotlin
package expo.modules.zapbarquick.heos

import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/** Minimal HEOS CLI stand-in: answers commands from a script and can push events. */
class FakeHeosServer {
  val server = ServerSocket(0)
  val port get() = server.localPort
  val received = mutableListOf<String>()
  var volume = 30
  var mute = false
  var mid = "inputs/hdmi_in_1"
  var playState = "play"
  var underProcessFirst = false
  var silent = false
  private var client: Socket? = null

  init {
    thread(isDaemon = true) {
      while (!server.isClosed) {
        val s = try { server.accept() } catch (e: Exception) { break }
        client = s
        thread(isDaemon = true) { serve(s) }
      }
    }
  }

  private fun reply(s: Socket, command: String, message: String, payload: String? = null) {
    val p = if (payload != null) ""","payload":$payload""" else ""
    s.getOutputStream().write("""{"heos":{"command":"$command","result":"success","message":"$message"}$p}""".plus("\r\n").toByteArray())
  }

  fun emit(event: String, message: String) {
    client?.getOutputStream()?.write("""{"heos":{"command":"event/$event","message":"$message"}}""".plus("\r\n").toByteArray())
  }

  private fun serve(s: Socket) {
    val r = s.getInputStream().bufferedReader()
    while (true) {
      val line = r.readLine() ?: break
      synchronized(received) { received.add(line) }
      if (silent) continue
      val cmd = line.removePrefix("heos://").substringBefore("?")
      val q = HeosCodec.parse(line.substringAfter("?", ""))
      if (underProcessFirst) { underProcessFirst = false; reply(s, cmd, "command under process&pid=1") ; Thread.sleep(100) }
      when (cmd) {
        "player/get_players" -> reply(s, cmd, "", """[{"name":"Loving room","pid":7331878,"serial":"TESTSERIAL0001"}]""")
        "player/get_volume" -> reply(s, cmd, "pid=7331878&level=$volume")
        "player/set_volume" -> { volume = q["level"]!!.toInt(); reply(s, cmd, "pid=7331878&level=$volume") }
        "player/get_mute" -> reply(s, cmd, "pid=7331878&state=${if (mute) "on" else "off"}")
        "player/set_mute" -> { mute = q["state"] == "on"; reply(s, cmd, "pid=7331878&state=${q["state"]}") }
        "player/get_play_state" -> reply(s, cmd, "pid=7331878&state=$playState")
        "player/get_now_playing_media" -> reply(s, cmd, "pid=7331878", """{"type":"station","mid":"$mid"}""")
        "browse/play_input" -> { mid = q["input"]!!; reply(s, cmd, "pid=7331878&input=${HeosCodec.encode(mid)}") }
        "system/register_for_change_events" -> reply(s, cmd, "enable=on")
        else -> reply(s, cmd, "")
      }
    }
  }

  fun close() { server.close(); client?.close() }
}
```

`android/src/test/java/expo/modules/zapbarquick/heos/HeosLiteTest.kt`:
```kotlin
package expo.modules.zapbarquick.heos

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class HeosLiteTest {
  private lateinit var fake: FakeHeosServer
  private lateinit var lite: HeosLite

  @Before fun setUp() { fake = FakeHeosServer(); lite = HeosLite("127.0.0.1", fake.port, timeoutMs = 500); lite.connect() }
  @After fun tearDown() { lite.close(); fake.close() }

  @Test fun `escapes the three special characters both ways`() {
    assertEquals("a%26b%3Dc%25d", HeosCodec.encode("a&b=c%d"))
    assertEquals("a&b=c%d", HeosCodec.decode("a%26b%3Dc%25d"))
    assertEquals(mapOf("pid" to "1", "input" to "inputs/hdmi_in_1"), HeosCodec.parse("pid=1&input=inputs%2Fhdmi_in_1".replace("%2F", "/")))
  }

  @Test fun `quick commands round-trip against the fake`() {
    val q = HeosQuick(lite)
    val pid = q.pidFor("TESTSERIAL0001")
    assertEquals(7331878, pid)
    q.setVolume(pid, 42); assertEquals(42, q.volume(pid))
    q.setMute(pid, true); assertTrue(q.mute(pid))
    q.playInput(pid, "inputs/hdmi_in_2"); assertEquals("inputs/hdmi_in_2", q.nowPlayingMid(pid))
    assertEquals("play", q.playState(pid))
  }

  @Test fun `waits through command under process`() {
    fake.underProcessFirst = true
    assertEquals(30, HeosQuick(lite).volume(7331878))
  }

  @Test(expected = HeosException::class) fun `times out when the bar is silent`() {
    fake.silent = true
    HeosQuick(lite).volume(7331878)
  }

  @Test fun `delivers change events`() {
    val latch = CountDownLatch(1)
    var got: Pair<String, Map<String, String>>? = null
    lite.onEvent = { e, m -> got = e to m; latch.countDown() }
    HeosQuick(lite).registerEvents()
    fake.emit("player_volume_changed", "pid=7331878&level=55&mute=off")
    assertTrue(latch.await(1, TimeUnit.SECONDS))
    assertEquals("player_volume_changed", got!!.first)
    assertEquals("55", got!!.second["level"])
  }

  @Test(expected = UnreachableException::class) fun `unreachable host reports reconnect, not a crash`() {
    HeosLite("127.0.0.1", 1, timeoutMs = 300).connect()
  }
}
```

- [ ] **Step 3: Run to verify they fail**

```bash
cd ~/projects/zapbar/apps/remote && npx expo prebuild --platform android --clean > ../../.superpowers/prebuild.log 2>&1
cd android && ./gradlew :zapbar-quick:testDebugUnitTest > ../../../.superpowers/kt-test.log 2>&1; echo "exit $?"; grep -E "error:|unresolved|FAILED|tests completed" ../../../.superpowers/kt-test.log | head
```
Expected: `exit 1`, with compile errors "Unresolved reference: HeosLite / HeosCodec / HeosQuick".
If the Gradle project is not called `:zapbar-quick`, find it with `./gradlew projects | grep -i quick` and use that name from here on. Ledger it.

- [ ] **Step 4: Implement**

`android/src/main/java/expo/modules/zapbarquick/heos/HeosCodec.kt`:
```kotlin
package expo.modules.zapbarquick.heos

/** HEOS CLI message encoding: values escape exactly &, = and % (same rules as heos-core cli/message.ts). */
object HeosCodec {
  fun encode(v: String): String = v.replace("%", "%25").replace("&", "%26").replace("=", "%3D")

  fun decode(v: String): String = Regex("%26|%3D|%25", RegexOption.IGNORE_CASE).replace(v) {
    when (it.value.uppercase()) { "%26" -> "&"; "%3D" -> "="; else -> "%" }
  }

  fun parse(message: String): Map<String, String> {
    if (message.isEmpty()) return emptyMap()
    return message.split("&").filter { it.isNotEmpty() }.associate { part ->
      val i = part.indexOf('=')
      if (i == -1) decode(part) to "" else decode(part.substring(0, i)) to decode(part.substring(i + 1))
    }
  }

  fun build(command: String, params: Map<String, Any> = emptyMap()): String {
    val q = params.entries.joinToString("&") { (k, v) -> "$k=${encode(v.toString())}" }
    return "heos://$command${if (q.isEmpty()) "" else "?$q"}\r\n"
  }
}
```

`android/src/main/java/expo/modules/zapbarquick/heos/HeosLite.kt`:
```kotlin
package expo.modules.zapbarquick.heos

import org.json.JSONObject
import java.io.BufferedReader
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

data class Reply(val command: String, val message: Map<String, String>, val payload: Any?)
class HeosException(message: String) : Exception(message)
class UnreachableException(message: String) : Exception(message)

/**
 * One command at a time, like heos-core's HeosCliClient: replies carry only the command name.
 * A reader thread splits events (to onEvent) from replies (to a queue the caller waits on).
 */
class HeosLite(private val host: String, private val port: Int = 1255, private val timeoutMs: Long = 3000) {
  @Volatile var onEvent: ((String, Map<String, String>) -> Unit)? = null
  private var socket: Socket? = null
  private val replies = LinkedBlockingQueue<JSONObject>()
  private val lock = Any()

  fun connect() {
    val s = Socket()
    try {
      s.connect(InetSocketAddress(host, port), timeoutMs.toInt())
    } catch (e: Exception) {
      s.close()
      throw UnreachableException("Can't reach $host:$port")
    }
    socket = s
    val reader: BufferedReader = s.getInputStream().bufferedReader()
    thread(isDaemon = true, name = "heos-lite-reader") {
      try {
        while (true) {
          val line = reader.readLine() ?: break
          val json = try { JSONObject(line) } catch (e: Exception) { continue }
          val heos = json.optJSONObject("heos") ?: continue
          val command = heos.optString("command")
          if (command.startsWith("event/")) {
            onEvent?.invoke(command.removePrefix("event/"), HeosCodec.parse(heos.optString("message")))
          } else {
            replies.put(json)
          }
        }
      } catch (_: Exception) {
      }
    }
  }

  fun send(command: String, params: Map<String, Any> = emptyMap()): Reply = synchronized(lock) {
    val s = socket ?: throw HeosException("Not connected")
    replies.clear()
    s.getOutputStream().write(HeosCodec.build(command, params).toByteArray())
    var deadline = System.currentTimeMillis() + timeoutMs
    while (true) {
      val left = deadline - System.currentTimeMillis()
      if (left <= 0) { close(); throw HeosException("$command timed out") }
      val json = replies.poll(left, TimeUnit.MILLISECONDS) ?: continue
      val heos = json.getJSONObject("heos")
      if (heos.optString("command") != command) continue
      val message = HeosCodec.parse(heos.optString("message"))
      if (message.containsKey("command under process")) { deadline = System.currentTimeMillis() + timeoutMs; continue }
      if (heos.optString("result") == "fail") throw HeosException("$command failed: ${message["text"] ?: message["eid"]}")
      return Reply(command, message, if (json.has("payload")) json.get("payload") else null)
    }
    @Suppress("UNREACHABLE_CODE") throw IllegalStateException()
  }

  fun close() {
    try { socket?.close() } catch (_: Exception) {}
    socket = null
  }
}
```

`android/src/main/java/expo/modules/zapbarquick/heos/HeosQuick.kt`:
```kotlin
package expo.modules.zapbarquick.heos

import org.json.JSONArray
import org.json.JSONObject

/** The handful of commands quick access needs, on top of HeosLite. */
class HeosQuick(private val lite: HeosLite) {
  fun pidFor(serial: String): Int {
    val players = lite.send("player/get_players").payload as? JSONArray ?: throw HeosException("No players")
    for (i in 0 until players.length()) {
      val p = players.getJSONObject(i)
      if (p.optString("serial") == serial) return p.getInt("pid")
    }
    if (players.length() == 1) return players.getJSONObject(0).getInt("pid")
    throw HeosException("Soundbar $serial not found")
  }

  fun volume(pid: Int): Int = lite.send("player/get_volume", mapOf("pid" to pid)).message["level"]?.toIntOrNull() ?: 0
  fun setVolume(pid: Int, v: Int) { lite.send("player/set_volume", mapOf("pid" to pid, "level" to v.coerceIn(0, 100))) }
  fun mute(pid: Int): Boolean = lite.send("player/get_mute", mapOf("pid" to pid)).message["state"] == "on"
  fun setMute(pid: Int, on: Boolean) { lite.send("player/set_mute", mapOf("pid" to pid, "state" to if (on) "on" else "off")) }
  fun playInput(pid: Int, mid: String) { lite.send("browse/play_input", mapOf("pid" to pid, "input" to mid)) }
  fun playState(pid: Int): String = lite.send("player/get_play_state", mapOf("pid" to pid)).message["state"] ?: "stop"
  fun nowPlayingMid(pid: Int): String? = (lite.send("player/get_now_playing_media", mapOf("pid" to pid)).payload as? JSONObject)?.optString("mid")?.takeIf { it.isNotEmpty() }
  fun registerEvents() { lite.send("system/register_for_change_events", mapOf("enable" to "on")) }
}
```

Replace the generated `android/src/main/java/expo/modules/zapbarquick/ZapbarQuickModule.kt` with a placeholder that compiles. Task 5 fills it in:
```kotlin
package expo.modules.zapbarquick

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ZapbarQuickModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZapbarQuick")
  }
}
```
`expo-module.config.json`: `{"platforms":["android"],"android":{"modules":["expo.modules.zapbarquick.ZapbarQuickModule"]}}`.

- [ ] **Step 5: Run the Kotlin tests**

Run: `cd ~/projects/zapbar/apps/remote/android && ./gradlew :zapbar-quick:testDebugUnitTest > ../../../.superpowers/kt-test.log 2>&1; echo "exit $?"; grep -E "tests completed|FAILED|BUILD" ../../../.superpowers/kt-test.log | head`
Expected: `exit 0`, `BUILD SUCCESSFUL`, 6 tests passing. The XML reports are under `modules/zapbar-quick/android/build/test-results/`.
Also run: `cd .. && pnpm test && pnpm typecheck`. Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
cd ~/projects/zapbar && git add -A && git commit -m "feat(quick): zapbar-quick module with a Kotlin HEOS client (HeosLite/HeosQuick)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 5: QuickConfig/QuickState, the JS bridge, sync and the Settings switches

**Files:**
- Create: `android/src/main/java/expo/modules/zapbarquick/QuickStore.kt` (under the module)
- Modify: `apps/remote/modules/zapbar-quick/index.ts`, `ZapbarQuickModule.kt`
- Create: `apps/remote/src/runtime/quick.ts`
- Modify: `apps/remote/src/runtime/memory.ts`, `manager.ts`, `RuntimeProvider.tsx`, `apps/remote/jest.setup.ts`, `apps/remote/src/ui/SettingsView.tsx`, `apps/remote/app/settings/index.tsx`
- Test: `android/src/test/java/expo/modules/zapbarquick/QuickStoreTest.kt`, `apps/remote/__tests__/quick.test.ts`, `apps/remote/__tests__/settings.test.tsx` (append)

**Interfaces:**
- Consumes: `DeviceManager`, `UiState`, `arrangeInputs`, `displayName` (Task 3).
- Produces:
  - Kotlin:
    - `data class QuickInput(mid, label, icon, hidden)`
    - `data class QuickConfig(key, serial, lastIp, name, inputs: List<QuickInput>, volumeKeys, notification)` with `toJson()` / `QuickConfig.fromJson(String)`
    - `data class QuickState(volume, mute, activeMid, playState, message, messageUntil)` with JSON both ways
    - `class QuickStore(context)`: `config(): QuickConfig?`, `saveConfig(json)`, `state(): QuickState`, `saveState(s)`
  - TS (`modules/zapbar-quick`):
    - `interface QuickNative { setConfig(json: string): void; setLiveWanted(foreground: boolean): void; refreshWidgets(): void; openBatterySettings(): void }`
    - `default export QuickNative`
  - TS (`src/runtime/quick.ts`):
    - `interface QuickConfigJs { key; serial; lastIp; name; inputs: Array<{ mid; label; icon; hidden }>; volumeKeys; notification }`
    - `buildQuickConfig(ui: UiState, devices: HeosState['devices']): QuickConfigJs | null`
    - `startQuickSync(m: DeviceManager, native: QuickNative): () => void`
  - memory:
    - `interface QuickSettings { volumeKeys: boolean; notification: boolean }`
    - `DeviceMemory.quickSettings()` and `setQuickSettings(patch)`
  - UiState gains `quick: QuickSettings`. The manager gains `setQuickSettings(patch)`.

- [ ] **Step 1: Write the failing tests**

`android/src/test/java/expo/modules/zapbarquick/QuickStoreTest.kt` (JSON only, no Android context):
```kotlin
package expo.modules.zapbarquick

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QuickStoreTest {
  private val json = """{"key":"TESTSERIAL0001","serial":"TESTSERIAL0001","lastIp":"10.0.0.82","name":"Loving room",
    "inputs":[{"mid":"inputs/hdmi_in_1","label":"PS5","icon":"playstation","hidden":false},{"mid":"inputs/aux_in_1","label":"AUX","icon":"audio","hidden":true}],
    "volumeKeys":true,"notification":false}"""

  @Test fun `config round-trips through JSON`() {
    val c = QuickConfig.fromJson(json)!!
    assertEquals("Loving room", c.name)
    assertEquals(2, c.inputs.size)
    assertEquals("playstation", c.inputs[0].icon)
    assertEquals(false, c.notification)
    assertEquals(c, QuickConfig.fromJson(c.toJson()))
  }

  @Test fun `visible inputs keep app order and drop hidden ones`() {
    assertEquals(listOf("inputs/hdmi_in_1"), QuickConfig.fromJson(json)!!.visibleInputs().map { it.mid })
  }

  @Test fun `bad JSON gives no config`() {
    assertNull(QuickConfig.fromJson("{not json"))
  }

  @Test fun `state round-trips and defaults`() {
    val s = QuickState(volume = 42, mute = true, activeMid = "inputs/hdmi_in_1", playState = "play")
    assertEquals(s, QuickState.fromJson(s.toJson()))
    assertEquals(QuickState(), QuickState.fromJson(null))
  }
}
```

`apps/remote/__tests__/quick.test.ts`:
```ts
import { arrangeInputs } from '../src/runtime/inputs';
import { DeviceManager } from '../src/runtime/manager';
import { DeviceMemory, memoryKv } from '../src/runtime/memory';
import { buildQuickConfig, startQuickSync } from '../src/runtime/quick';
import { CAPS, deviceState } from '../test-utils/fixtures';

const KEY = 'TESTSERIAL0001';
function manager() {
  const memory = new DeviceMemory(memoryKv());
  memory.saveDevice({ key: KEY, name: 'Loving room', model: 'm', lastIp: '10.0.0.82' });
  const m = new DeviceManager({ socketFactory: () => new Promise(() => {}), http: async () => ({ status: 500, text: '' }), memory, discover: async () => [] });
  m.store.setState({ devices: { [KEY]: deviceState() } });
  return m;
}
const native = () => ({ setConfig: jest.fn(), setLiveWanted: jest.fn(), refreshWidgets: jest.fn(), openBatterySettings: jest.fn() });

it('builds a snapshot with display name, arranged inputs and flags', () => {
  const m = manager();
  m.setInputPref('inputs/hdmi_in_1', { label: 'PS5', icon: 'playstation' });
  const c = buildQuickConfig(m.ui.getState(), m.store.getState().devices)!;
  expect(c).toMatchObject({ key: KEY, serial: KEY, lastIp: '10.0.0.82', name: 'Loving room', volumeKeys: true, notification: true });
  expect(c.inputs.map((i) => i.mid)).toEqual(arrangeInputs(CAPS.inputs, m.ui.getState().prefs[KEY] ?? {}).all.map((i) => i.mid));
  expect(c.inputs.find((i) => i.mid === 'inputs/hdmi_in_1')).toMatchObject({ label: 'PS5', icon: 'playstation', hidden: false });
});

it('has no snapshot without an active device', () => {
  const m = new DeviceManager({ socketFactory: () => new Promise(() => {}), http: async () => ({ status: 500, text: '' }), memory: new DeviceMemory(memoryKv()), discover: async () => [] });
  expect(buildQuickConfig(m.ui.getState(), m.store.getState().devices)).toBeNull();
});

it('pushes the snapshot once, then only when it changes', () => {
  const m = manager();
  const n = native();
  const stop = startQuickSync(m, n);
  expect(n.setConfig).toHaveBeenCalledTimes(1);
  m.store.setState({ devices: { [KEY]: deviceState({}, { volume: 50 }) } }); // volume is not in the snapshot
  expect(n.setConfig).toHaveBeenCalledTimes(1);
  m.setInputPref('inputs/hdmi_in_1', { label: 'PS5' });
  expect(n.setConfig).toHaveBeenCalledTimes(2);
  expect(JSON.parse(n.setConfig.mock.calls[1]![0]).inputs.find((i: { mid: string }) => i.mid === 'inputs/hdmi_in_1').label).toBe('PS5');
  m.setQuickSettings({ notification: false });
  expect(JSON.parse(n.setConfig.mock.calls[2]![0]).notification).toBe(false);
  stop();
});

it('remembers the quick settings', () => {
  const kv = memoryKv();
  const m1 = new DeviceMemory(kv);
  expect(m1.quickSettings()).toEqual({ volumeKeys: true, notification: true });
  m1.setQuickSettings({ volumeKeys: false });
  expect(new DeviceMemory(kv).quickSettings()).toEqual({ volumeKeys: false, notification: true });
});
```

Append to `apps/remote/__tests__/settings.test.tsx`:
```tsx
describe('quick access settings', () => {
  const base = { devices: DEVICES, activeKey: 'S1', statusOf: () => 'ready' as const, version: '0.3.0', onActivate: jest.fn(), onForget: jest.fn(), onAddDevice: jest.fn(), onInputs: jest.fn(), onRename: jest.fn(async () => null) };

  it('toggles volume keys and the notification, and opens battery settings', async () => {
    const onQuick = jest.fn();
    const onBattery = jest.fn();
    await render(<SettingsView {...base} quick={{ volumeKeys: true, notification: true }} onQuick={onQuick} onBattery={onBattery} />);
    await fireEvent(screen.getByLabelText('Volume keys control the soundbar'), 'valueChange', false);
    expect(onQuick).toHaveBeenCalledWith({ volumeKeys: false });
    await fireEvent(screen.getByLabelText('Show notification'), 'valueChange', false);
    expect(onQuick).toHaveBeenCalledWith({ notification: false });
    await fireEvent.press(screen.getByText('Keep volume keys working when the app is closed'));
    expect(onBattery).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/remote && pnpm test quick settings` and `cd android && ./gradlew :zapbar-quick:testDebugUnitTest`
Expected: both FAIL. `src/runtime/quick` and `QuickConfig` are missing, and `quick`, `onQuick` and `onBattery` are unknown props.

- [ ] **Step 3: Implement the Kotlin store**

`android/src/main/java/expo/modules/zapbarquick/QuickStore.kt`:
```kotlin
package expo.modules.zapbarquick

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class QuickInput(val mid: String, val label: String, val icon: String, val hidden: Boolean)

/** Snapshot the JS app writes; native code only reads it. */
data class QuickConfig(
  val key: String,
  val serial: String,
  val lastIp: String,
  val name: String,
  val inputs: List<QuickInput>,
  val volumeKeys: Boolean,
  val notification: Boolean,
) {
  fun visibleInputs(): List<QuickInput> = inputs.filter { !it.hidden }

  fun toJson(): String = JSONObject()
    .put("key", key).put("serial", serial).put("lastIp", lastIp).put("name", name)
    .put("inputs", JSONArray(inputs.map { JSONObject().put("mid", it.mid).put("label", it.label).put("icon", it.icon).put("hidden", it.hidden) }))
    .put("volumeKeys", volumeKeys).put("notification", notification).toString()

  companion object {
    fun fromJson(json: String?): QuickConfig? = try {
      val o = JSONObject(json ?: return null)
      val arr = o.getJSONArray("inputs")
      QuickConfig(
        key = o.getString("key"), serial = o.getString("serial"), lastIp = o.getString("lastIp"), name = o.getString("name"),
        inputs = (0 until arr.length()).map { arr.getJSONObject(it) }.map { QuickInput(it.getString("mid"), it.getString("label"), it.getString("icon"), it.getBoolean("hidden")) },
        volumeKeys = o.optBoolean("volumeKeys", true), notification = o.optBoolean("notification", true),
      )
    } catch (e: Exception) { null }
  }
}

/** Last known bar state, persisted so widgets render instantly; message shows in the widget header until messageUntil. */
data class QuickState(
  val volume: Int = 0,
  val mute: Boolean = false,
  val activeMid: String? = null,
  val playState: String = "stop",
  val message: String? = null,
  val messageUntil: Long = 0,
) {
  fun toJson(): String = JSONObject().put("volume", volume).put("mute", mute).put("activeMid", activeMid ?: JSONObject.NULL)
    .put("playState", playState).put("message", message ?: JSONObject.NULL).put("messageUntil", messageUntil).toString()

  companion object {
    fun fromJson(json: String?): QuickState = try {
      val o = JSONObject(json ?: return QuickState())
      QuickState(
        volume = o.optInt("volume"), mute = o.optBoolean("mute"),
        activeMid = if (o.isNull("activeMid")) null else o.optString("activeMid"),
        playState = o.optString("playState", "stop"),
        message = if (o.isNull("message")) null else o.optString("message"),
        messageUntil = o.optLong("messageUntil"),
      )
    } catch (e: Exception) { QuickState() }
  }
}

class QuickStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences("zapbar_quick", Context.MODE_PRIVATE)
  fun config(): QuickConfig? = QuickConfig.fromJson(prefs.getString("config", null))
  fun saveConfig(json: String) { prefs.edit().putString("config", json).apply() }
  fun state(): QuickState = QuickState.fromJson(prefs.getString("state", null))
  fun saveState(s: QuickState) { prefs.edit().putString("state", s.toJson()).apply() }
}
```

Fill in `ZapbarQuickModule.kt` (the widget, service and slider hooks are added in Tasks 7–9; for now they are no-ops that later tasks extend):
```kotlin
package expo.modules.zapbarquick

import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ZapbarQuickModule : Module() {
  private val ctx get() = appContext.reactContext!!.applicationContext

  override fun definition() = ModuleDefinition {
    Name("ZapbarQuick")
    Function("setConfig") { json: String ->
      QuickStore(ctx).saveConfig(json)
      QuickHooks.onConfigChanged(ctx)
    }
    Function("setLiveWanted") { foreground: Boolean ->
      QuickHooks.onAppForeground(ctx, foreground)
    }
    Function("refreshWidgets") { QuickHooks.refresh(ctx) }
    Function("openBatterySettings") {
      ctx.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}

/** Single place later tasks hook into (widgets in Task 7, live service in Task 9). */
object QuickHooks {
  @Volatile var appForeground = false
  fun onConfigChanged(ctx: android.content.Context) { refresh(ctx) }
  fun onAppForeground(ctx: android.content.Context, fg: Boolean) { appForeground = fg }
  fun refresh(ctx: android.content.Context) {}
}
```

`apps/remote/modules/zapbar-quick/index.ts`:
```ts
import { requireNativeModule } from 'expo';

export interface QuickNative {
  setConfig(json: string): void;
  setLiveWanted(foreground: boolean): void;
  refreshWidgets(): void;
  openBatterySettings(): void;
}

export default requireNativeModule<QuickNative>('ZapbarQuick');
```

- [ ] **Step 4: Implement the JS side**

`apps/remote/src/runtime/memory.ts`:
```ts
export interface QuickSettings {
  volumeKeys: boolean;
  notification: boolean;
}
// in K: quick: 'quick'
// in DeviceMemory:
  quickSettings(): QuickSettings {
    return { volumeKeys: true, notification: true, ...this.read<Partial<QuickSettings>>(K.quick, {}) };
  }

  setQuickSettings(patch: Partial<QuickSettings>): QuickSettings {
    const next = { ...this.quickSettings(), ...patch };
    this.write(K.quick, next);
    return next;
  }
```

`apps/remote/src/runtime/manager.ts`:
- `UiState` gains `quick: QuickSettings`, initialised from `d.memory.quickSettings()`.
- Add:
```ts
  setQuickSettings(patch: Partial<QuickSettings>): void {
    this.ui.setState({ quick: this.d.memory.setQuickSettings(patch) });
  }
```

`apps/remote/src/runtime/quick.ts`:
```ts
import type { HeosState } from '@zapbar/heos-core';
import type { QuickNative } from '../../modules/zapbar-quick';
import { arrangeInputs } from './inputs';
import type { DeviceManager, UiState } from './manager';
import { displayName } from './memory';

export interface QuickConfigJs {
  key: string;
  serial: string;
  lastIp: string;
  name: string;
  inputs: Array<{ mid: string; label: string; icon: string; hidden: boolean }>;
  volumeKeys: boolean;
  notification: boolean;
}

/** What native quick access needs to know, without any live values (those come from the bar itself). */
export function buildQuickConfig(ui: UiState, devices: HeosState['devices']): QuickConfigJs | null {
  const known = ui.devices.find((d) => d.key === ui.activeKey);
  if (!known) return null;
  const state = devices[known.key];
  const inputs = state?.caps?.inputs ?? ui.inputs[known.key] ?? [];
  const arranged = arrangeInputs(inputs, ui.prefs[known.key] ?? {}).all;
  return {
    key: known.key,
    serial: known.key,
    lastIp: state?.ip ?? known.lastIp,
    name: displayName(known, state),
    inputs: arranged.map((i) => ({ mid: i.mid, label: i.label, icon: i.icon, hidden: i.hidden })),
    volumeKeys: ui.quick.volumeKeys,
    notification: ui.quick.notification,
  };
}

/** Pushes the snapshot to native whenever it changes. Returns the unsubscribe function. */
export function startQuickSync(m: DeviceManager, native: QuickNative): () => void {
  let last = '';
  const push = () => {
    const c = buildQuickConfig(m.ui.getState(), m.store.getState().devices);
    if (!c) return;
    const json = JSON.stringify(c);
    if (json === last) return;
    last = json;
    native.setConfig(json);
  };
  push();
  const a = m.ui.subscribe(push);
  const b = m.store.subscribe(push);
  return () => {
    a();
    b();
  };
}
```
`HeosState` is heos-core's store state type. If it is exported under another name, use that name and ledger it.

`apps/remote/jest.setup.ts`: append
```ts
jest.mock('./modules/zapbar-quick', () => ({ __esModule: true, default: { setConfig: jest.fn(), setLiveWanted: jest.fn(), refreshWidgets: jest.fn(), openBatterySettings: jest.fn() } }));
```

`apps/remote/src/runtime/RuntimeProvider.tsx`:
- Accept an optional `quick?: QuickNative` prop. The default loads lazily, the same way `nativeSearch` does: `require('../../modules/zapbar-quick').default`.
- In the existing effect, after `m.start()`, run `const stopSync = startQuickSync(m, quick);` and `quick.setLiveWanted(AppState.currentState === 'active');`.
- In the AppState listener, also call `quick.setLiveWanted(s === 'active')`.
- Clean up with `stopSync()`.

`apps/remote/src/ui/SettingsView.tsx`: add the props `quick: QuickSettings`, `onQuick(patch: Partial<QuickSettings>): void` and `onBattery(): void`. Under the "Remote" card, render two switch rows with the same styling as the inputs editor switches (muted thumb when off, `surfaceHi` off track):
- "Volume keys control the soundbar" (`accessibilityLabel` equals the text);
- "Show notification".

Then a link row, "Keep volume keys working when the app is closed", that calls `onBattery`. If Task 1 ruled BLOCKED, omit the volume-keys switch and the battery row (ledger).

`apps/remote/app/settings/index.tsx`: pass
- `quick={useUi((s) => s.quick)}`;
- `onQuick={(p) => m.setQuickSettings(p)}`;
- `onBattery={() => require('../../modules/zapbar-quick').default.openBatterySettings()}`.

- [ ] **Step 5: Run all tests**

Run: `cd apps/remote && pnpm test && pnpm typecheck && cd android && ./gradlew :zapbar-quick:testDebugUnitTest > ../../../.superpowers/kt-test.log 2>&1; echo "exit $?"`
Expected: all JS tests PASS, `exit 0` (10 Kotlin tests).

- [ ] **Step 6: Commit**

```bash
cd ~/projects/zapbar && git add -A && git commit -m "feat(quick): config snapshot bridge, quick settings and Settings switches

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 6: Brand resources for RemoteViews (colours, icons, pill drawables)

**Files:**
- Create: `apps/remote/scripts/quick-res.mjs`
- Generated and committed:
  - `apps/remote/modules/zapbar-quick/android/src/main/res/values/zq_colors.xml`, `values-night/zq_colors.xml`
  - `drawable/zq_ic_*.xml` (icons and the Z), `drawable/zq_seg_*.xml` (pill segments), `drawable/zq_bg_*.xml` (rounded surfaces)
  - `layout/zq_pill.xml` (20 segments)
- Modify: `apps/remote/package.json` (devDependency `@mdi/js`, script `quick-res`)
- Test: `apps/remote/__tests__/quick-res.test.ts`

**Interfaces:**
- Consumes: `palettes`, `LIME`, `FOREST` (`src/theme.ts`); `ICONS` (`src/runtime/inputs.ts`); `Z_PATH` (`src/ui/ZMark.tsx`).
- Produces (resource names used by Tasks 7–10):
  - Colours: `zq_bg`, `zq_surface`, `zq_surface_hi`, `zq_text`, `zq_muted`, `zq_accent`, `zq_on_accent`, `zq_warn`.
  - Icons: `zq_ic_z`, plus `zq_ic_<glyph with - replaced by _>` for every value in `ICONS`, plus `volume_high`, `volume_off` and `tune_vertical`.
  - Segment drawables, 3 states × 3 positions: `zq_seg_{track|fill|knob}_{start|mid|end}`.
  - Backgrounds: `zq_bg_widget`, `zq_bg_tile`, `zq_bg_tile_on`, `zq_bg_round`.
  - Layout: `zq_pill` (ids `zq_seg_0` … `zq_seg_19`), and `zq_pill_tall` with the same ids (48 dp, for the slider dialog).

- [ ] **Step 1: Write the failing test**

`apps/remote/__tests__/quick-res.test.ts`:
```ts
/** @jest-environment node */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ICONS } from '../src/runtime/inputs';
import { palettes } from '../src/theme';

const RES = join(__dirname, '../modules/zapbar-quick/android/src/main/res');
const colors = (dir: string) => Object.fromEntries([...readFileSync(join(RES, dir, 'zq_colors.xml'), 'utf8').matchAll(/<color name="(\w+)">(#[0-9A-Fa-f]{6,8})<\/color>/g)].map((m) => [m[1], m[2]!.toUpperCase()]));

it('widget colours match the app palettes in both schemes', () => {
  for (const [dir, p] of [['values', palettes.light], ['values-night', palettes.dark]] as const) {
    const c = colors(dir);
    expect(c.zq_bg).toBe(p.bg.toUpperCase());
    expect(c.zq_surface).toBe(p.surface.toUpperCase());
    expect(c.zq_surface_hi).toBe(p.surfaceHi.toUpperCase());
    expect(c.zq_text).toBe(p.text.toUpperCase());
    expect(c.zq_muted).toBe(p.muted.toUpperCase());
    expect(c.zq_accent).toBe(p.accent.toUpperCase());
    expect(c.zq_on_accent).toBe(p.onAccent.toUpperCase());
    expect(c.zq_warn).toBe(p.warn.toUpperCase());
  }
});

it('has a drawable for every input icon, the controls and the Z', () => {
  const glyphs = [...Object.values(ICONS), 'volume-high', 'volume-off', 'tune-vertical'];
  for (const g of glyphs) expect(existsSync(join(RES, 'drawable', `zq_ic_${g.replace(/-/g, '_')}.xml`))).toBe(true);
  expect(existsSync(join(RES, 'drawable', 'zq_ic_z.xml'))).toBe(true);
});

it('the pill layout has exactly 20 segments', () => {
  const xml = readFileSync(join(RES, 'layout', 'zq_pill.xml'), 'utf8');
  for (let i = 0; i < 20; i++) expect(xml).toContain(`@+id/zq_seg_${i}"`);
  expect(xml).not.toContain('@+id/zq_seg_20"');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/remote && pnpm test quick-res`
Expected: FAIL with ENOENT on `zq_colors.xml`.

- [ ] **Step 3: Write the generator and run it**

```bash
cd ~/projects/zapbar/apps/remote && pnpm add -D @mdi/js
```
Add the script `"quick-res": "node scripts/quick-res.mjs"` to `package.json`.

`apps/remote/scripts/quick-res.mjs`:
```js
// Generates RemoteViews resources for zapbar-quick from the app's brand tokens. Run: pnpm quick-res
import * as mdi from '@mdi/js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const RES = new URL('../modules/zapbar-quick/android/src/main/res/', import.meta.url).pathname;
const theme = readFileSync(new URL('../src/theme.ts', import.meta.url), 'utf8');
const inputs = readFileSync(new URL('../src/runtime/inputs.ts', import.meta.url), 'utf8');
const zmark = readFileSync(new URL('../src/ui/ZMark.tsx', import.meta.url), 'utf8');

const LIME = theme.match(/LIME = '(#\w+)'/)[1];
const FOREST = theme.match(/FOREST = '(#\w+)'/)[1];
const block = (name) => theme.match(new RegExp(`${name}: \\{([\\s\\S]*?)\\n  \\}`))[1];
const tok = (b, key) => {
  const v = b.match(new RegExp(`\\b${key}: ([^,\\n]+)`))[1].trim();
  return v === 'LIME' ? LIME : v === 'FOREST' ? FOREST : v.replace(/'/g, '');
};
const write = (path, body) => { mkdirSync(RES + path.split('/').slice(0, -1).join('/'), { recursive: true }); writeFileSync(RES + path, body); };

for (const [dir, name] of [['values', 'light'], ['values-night', 'dark']]) {
  const b = block(name);
  const map = { zq_bg: 'bg', zq_surface: 'surface', zq_surface_hi: 'surfaceHi', zq_text: 'text', zq_muted: 'muted', zq_accent: 'accent', zq_on_accent: 'onAccent', zq_warn: 'warn' };
  write(`${dir}/zq_colors.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${Object.entries(map).map(([k, t]) => `  <color name="${k}">${tok(b, t)}</color>`).join('\n')}\n</resources>\n`);
}

const glyphs = [...new Set([...[...inputs.matchAll(/: '([a-z-]+)',/g)].map((m) => m[1]).filter((g) => mdi['mdi' + g.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('')]), 'volume-high', 'volume-off', 'tune-vertical'])];
for (const g of glyphs) {
  const path = mdi['mdi' + g.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('')];
  write(`drawable/zq_ic_${g.replace(/-/g, '_')}.xml`, `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">\n  <path android:fillColor="#FFFFFFFF" android:pathData="${path}"/>\n</vector>\n`);
}
const z = zmark.match(/Z_PATH = '([^']+)'/)[1];
write('drawable/zq_ic_z.xml', `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="100" android:viewportHeight="100">\n  <path android:strokeColor="#FFFFFFFF" android:strokeWidth="15" android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000" android:pathData="${z}"/>\n</vector>\n`);

// Pill segments: start/end segments carry the rounded ends; the knob segment draws the round knob at its right edge.
const R = 24;
const corners = { start: `android:topLeftRadius="${R}dp" android:bottomLeftRadius="${R}dp"`, mid: '', end: `android:topRightRadius="${R}dp" android:bottomRightRadius="${R}dp"` };
for (const [pos, c] of Object.entries(corners)) {
  const rect = (color) => `<shape android:shape="rectangle"><solid android:color="@color/${color}"/>${c ? `<corners ${c}/>` : ''}</shape>`;
  write(`drawable/zq_seg_track_${pos}.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item>${rect('zq_surface_hi').replace('<shape', '<shape xmlns:android="http://schemas.android.com/apk/res/android"')}</item></layer-list>\n`);
  write(`drawable/zq_seg_fill_${pos}.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item>${rect('zq_accent')}</item></layer-list>\n`);
  const knobCorners = `android:topRightRadius="${R}dp" android:bottomRightRadius="${R}dp"${pos === 'start' ? ` android:topLeftRadius="${R}dp" android:bottomLeftRadius="${R}dp"` : ''}`;
  write(`drawable/zq_seg_knob_${pos}.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n  <item><shape android:shape="rectangle"><solid android:color="@color/zq_accent"/><corners ${knobCorners}/></shape></item>\n  <item android:gravity="end|center_vertical" android:end="4dp" android:width="28dp" android:height="28dp"><shape android:shape="oval"><solid android:color="@color/zq_on_accent"/></shape></item>\n</layer-list>\n`);
}
const round = (name, color, r, stroke) => write(`drawable/${name}.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="@color/${color}"/><corners android:radius="${r}dp"/>${stroke ? `<stroke android:width="1dp" android:color="@color/${stroke}"/>` : ''}</shape>\n`);
round('zq_bg_widget', 'zq_bg', 26);
round('zq_bg_tile', 'zq_surface', 16);
round('zq_bg_tile_on', 'zq_accent', 16);
round('zq_bg_round', 'zq_surface', 999);

const pill = (height) => `<?xml version="1.0" encoding="utf-8"?>\n<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="0dp" android:layout_weight="1" android:layout_height="${height}dp" android:orientation="horizontal">\n${Array.from({ length: 20 }, (_, i) => `  <FrameLayout android:id="@+id/zq_seg_${i}" android:layout_width="0dp" android:layout_height="match_parent" android:layout_weight="1" android:background="@drawable/zq_seg_track_${i === 0 ? 'start' : i === 19 ? 'end' : 'mid'}" />`).join('\n')}\n</LinearLayout>\n`;
write('layout/zq_pill.xml', pill(44));
write('layout/zq_pill_tall.xml', pill(48));
console.log('quick resources written');
```
Run: `pnpm quick-res`. Expected: "quick resources written".

The track drawable's namespace hack writes `xmlns:android` twice. If `aapt` complains in Task 7's build, drop the `.replace(...)` on the track line (the layer-list already declares the namespace) and rerun. Ledger it.

- [ ] **Step 4: Run tests**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/projects/zapbar && git add -A && git commit -m "feat(quick): brand colours, icons and pill drawables for RemoteViews, generated from the app tokens

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 7: Widgets (4×2 and 4×1) and the shared tap actions

**Files (all under `apps/remote/modules/zapbar-quick/android/src/main/`):**
- Create: `java/expo/modules/zapbarquick/Pill.kt`, `QuickActions.kt`, `QuickReceiver.kt`, `widget/WidgetRenderer.kt`, `widget/LargeWidget.kt`, `widget/SmallWidget.kt`, `widget/WidgetUpdater.kt`
- Create: `res/layout/zq_widget_large.xml`, `res/layout/zq_widget_small.xml`, `res/xml/zq_widget_large_info.xml`, `res/xml/zq_widget_small_info.xml`, `res/values/zq_strings.xml`
- Modify: `AndroidManifest.xml`, `ZapbarQuickModule.kt` (`QuickHooks.refresh`)
- Test: `src/test/java/expo/modules/zapbarquick/PillTest.kt`, `QuickActionsTest.kt`

**Interfaces:**
- Consumes: `HeosLite`, `HeosQuick`, `UnreachableException` (Task 4); `QuickStore`, `QuickConfig`, `QuickState` (Task 5); the resources from Task 6.
- Produces:
  - `object Pill { SEGMENTS = 20; volumeFor(segment): Int; filled(volume): Int; segmentDrawable(index, volume): Int }`
  - `sealed class QuickAction { SetVolume(v); ToggleMute; PlayInput(mid); Refresh }`
  - `class QuickActions(store: QuickBackend, connect: (ip) -> HeosQuickLike)`:
    - `run(action): QuickState`, serialised and never throws
    - `QuickActions.forContext(ctx)` gives the production instance
  - `WidgetUpdater.updateAll(ctx)`, `QuickReceiver` (broadcast actions `expo.modules.zapbarquick.ACTION` with extras `type`, `value`, `mid`)

- [ ] **Step 1: Write the failing Kotlin tests**

`src/test/java/expo/modules/zapbarquick/PillTest.kt`:
```kotlin
package expo.modules.zapbarquick

import org.junit.Assert.assertEquals
import org.junit.Test

class PillTest {
  @Test fun `segment i sets volume 5 times i plus 1`() {
    assertEquals(5, Pill.volumeFor(0)); assertEquals(50, Pill.volumeFor(9)); assertEquals(100, Pill.volumeFor(19))
  }
  @Test fun `filled segments round to the nearest 5 and clamp`() {
    assertEquals(0, Pill.filled(0)); assertEquals(0, Pill.filled(2)); assertEquals(1, Pill.filled(3))
    assertEquals(8, Pill.filled(42)); assertEquals(20, Pill.filled(100)); assertEquals(20, Pill.filled(150)); assertEquals(0, Pill.filled(-5))
  }
  @Test fun `knob sits on the last filled segment`() {
    assertEquals(Pill.Kind.FILL, Pill.kind(0, 42)); assertEquals(Pill.Kind.KNOB, Pill.kind(7, 42)); assertEquals(Pill.Kind.TRACK, Pill.kind(8, 42))
    assertEquals(Pill.Kind.TRACK, Pill.kind(0, 0))
  }
}
```

`src/test/java/expo/modules/zapbarquick/QuickActionsTest.kt` (fakes, no Android):
```kotlin
package expo.modules.zapbarquick

import expo.modules.zapbarquick.heos.HeosException
import expo.modules.zapbarquick.heos.UnreachableException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class QuickActionsTest {
  private val config = QuickConfig("K", "K", "10.0.0.82", "Loving room", listOf(QuickInput("inputs/hdmi_in_1", "PS5", "playstation", false)), true, true)

  class MemBackend(var cfg: QuickConfig?) : QuickBackend {
    var st = QuickState()
    override fun config() = cfg
    override fun state() = st
    override fun saveState(s: QuickState) { st = s }
  }

  class FakeBar : HeosQuickLike {
    var volume = 30; var mute = false; var mid = "inputs/hdmi_in_2"; val log = mutableListOf<String>()
    override fun pidFor(serial: String) = 1
    override fun volume(pid: Int) = volume
    override fun setVolume(pid: Int, v: Int) { log += "vol $v"; Thread.sleep(20); volume = v }
    override fun mute(pid: Int) = mute
    override fun setMute(pid: Int, on: Boolean) { log += "mute $on"; mute = on }
    override fun playInput(pid: Int, mid: String) { log += "input $mid"; this.mid = mid }
    override fun nowPlayingMid(pid: Int) = mid
    override fun playState(pid: Int) = "play"
    override fun close() {}
  }

  @Test fun `set volume then reads back state`() {
    val bar = FakeBar(); val be = MemBackend(config)
    val s = QuickActions(be) { bar }.run(QuickAction.SetVolume(45))
    assertEquals(45, s.volume); assertEquals("inputs/hdmi_in_2", s.activeMid); assertEquals(s, be.st)
  }

  @Test fun `toggle mute flips the bar's current state`() {
    val bar = FakeBar(); bar.mute = true
    assertEquals(false, QuickActions(MemBackend(config)) { bar }.run(QuickAction.ToggleMute).mute)
  }

  @Test fun `no config asks to set up`() {
    assertEquals("Open Zapbar to set up", QuickActions(MemBackend(null)) { FakeBar() }.run(QuickAction.Refresh).message)
  }

  @Test fun `unreachable host reports reconnect, not a crash`() {
    val s = QuickActions(MemBackend(config)) { throw UnreachableException("x") }.run(QuickAction.SetVolume(10))
    assertEquals("Open Zapbar to reconnect", s.message)
  }

  @Test fun `a silent bar reports it did not respond`() {
    val bad = object : HeosQuickLike by FakeBar() { override fun setVolume(pid: Int, v: Int) { throw HeosException("timed out") } }
    assertEquals("Soundbar didn't respond", QuickActions(MemBackend(config)) { bad }.run(QuickAction.SetVolume(10)).message)
  }

  @Test fun `actions are serialised and the last read-back wins`() {
    val bar = FakeBar(); val be = MemBackend(config); val qa = QuickActions(be) { bar }
    val pool = Executors.newFixedThreadPool(4)
    listOf(10, 20, 30, 40).forEach { v -> pool.submit { qa.run(QuickAction.SetVolume(v)) } }
    pool.shutdown(); assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS))
    assertEquals(4, bar.log.size)
    assertEquals(bar.volume, be.st.volume)
  }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd ~/projects/zapbar/apps/remote/android && ./gradlew :zapbar-quick:testDebugUnitTest > ../../../.superpowers/kt-test.log 2>&1; echo "exit $?"`
Expected: `exit 1`. `Pill`, `QuickActions`, `QuickBackend` and `HeosQuickLike` are unresolved.

- [ ] **Step 3: Implement the pure parts**

`java/expo/modules/zapbarquick/Pill.kt`:
```kotlin
package expo.modules.zapbarquick

/** The tap-to-set volume pill shared by widgets and the notification (spec §5). */
object Pill {
  const val SEGMENTS = 20
  enum class Kind { TRACK, FILL, KNOB }

  fun volumeFor(segment: Int): Int = 5 * (segment.coerceIn(0, SEGMENTS - 1) + 1)
  fun filled(volume: Int): Int = ((volume.coerceIn(0, 100) + 2) / 5)
  fun kind(index: Int, volume: Int): Kind {
    val f = filled(volume)
    return when { index < f - 1 -> Kind.FILL; index == f - 1 -> Kind.KNOB; else -> Kind.TRACK }
  }

  fun drawable(index: Int, volume: Int): Int {
    val pos = when (index) { 0 -> 0; SEGMENTS - 1 -> 2; else -> 1 }
    return when (kind(index, volume)) {
      Kind.TRACK -> arrayOf(R.drawable.zq_seg_track_start, R.drawable.zq_seg_track_mid, R.drawable.zq_seg_track_end)[pos]
      Kind.FILL -> arrayOf(R.drawable.zq_seg_fill_start, R.drawable.zq_seg_fill_mid, R.drawable.zq_seg_fill_end)[pos]
      Kind.KNOB -> arrayOf(R.drawable.zq_seg_knob_start, R.drawable.zq_seg_knob_mid, R.drawable.zq_seg_knob_end)[pos]
    }
  }

  val SEGMENT_IDS = intArrayOf(
    R.id.zq_seg_0, R.id.zq_seg_1, R.id.zq_seg_2, R.id.zq_seg_3, R.id.zq_seg_4, R.id.zq_seg_5, R.id.zq_seg_6, R.id.zq_seg_7, R.id.zq_seg_8, R.id.zq_seg_9,
    R.id.zq_seg_10, R.id.zq_seg_11, R.id.zq_seg_12, R.id.zq_seg_13, R.id.zq_seg_14, R.id.zq_seg_15, R.id.zq_seg_16, R.id.zq_seg_17, R.id.zq_seg_18, R.id.zq_seg_19,
  )
}
```

`java/expo/modules/zapbarquick/QuickActions.kt`:
```kotlin
package expo.modules.zapbarquick

import android.content.Context
import expo.modules.zapbarquick.heos.HeosLite
import expo.modules.zapbarquick.heos.HeosQuick
import expo.modules.zapbarquick.heos.UnreachableException

interface QuickBackend {
  fun config(): QuickConfig?
  fun state(): QuickState
  fun saveState(s: QuickState)
}

/** The subset of HeosQuick the actions use, so tests can fake the bar. */
interface HeosQuickLike {
  fun pidFor(serial: String): Int
  fun volume(pid: Int): Int
  fun setVolume(pid: Int, v: Int)
  fun mute(pid: Int): Boolean
  fun setMute(pid: Int, on: Boolean)
  fun playInput(pid: Int, mid: String)
  fun nowPlayingMid(pid: Int): String?
  fun playState(pid: Int): String
  fun close()
}

sealed class QuickAction {
  data class SetVolume(val volume: Int) : QuickAction()
  object ToggleMute : QuickAction()
  data class PlayInput(val mid: String) : QuickAction()
  object Refresh : QuickAction()
}

/** One action at a time: connect, command, read back, disconnect. Never throws; failures become a header message. */
class QuickActions(private val backend: QuickBackend, private val connect: (String) -> HeosQuickLike) {
  fun run(action: QuickAction): QuickState = synchronized(LOCK) {
    val cfg = backend.config() ?: return message("Open Zapbar to set up")
    val bar = try { connect(cfg.lastIp) } catch (e: UnreachableException) { return message("Open Zapbar to reconnect") } catch (e: Exception) { return message("Soundbar didn't respond") }
    try {
      val pid = bar.pidFor(cfg.serial)
      when (action) {
        is QuickAction.SetVolume -> bar.setVolume(pid, action.volume.coerceIn(0, 100))
        is QuickAction.ToggleMute -> bar.setMute(pid, !bar.mute(pid))
        is QuickAction.PlayInput -> bar.playInput(pid, action.mid)
        is QuickAction.Refresh -> Unit
      }
      val s = QuickState(volume = bar.volume(pid), mute = bar.mute(pid), activeMid = bar.nowPlayingMid(pid), playState = bar.playState(pid))
      backend.saveState(s)
      s
    } catch (e: Exception) {
      message("Soundbar didn't respond")
    } finally {
      bar.close()
    }
  }

  private fun message(text: String): QuickState {
    val s = backend.state().copy(message = text, messageUntil = System.currentTimeMillis() + 3000)
    backend.saveState(s)
    return s
  }

  companion object {
    private val LOCK = Any()

    fun forContext(ctx: Context): QuickActions {
      val store = QuickStore(ctx)
      val backend = object : QuickBackend {
        override fun config() = store.config()
        override fun state() = store.state()
        override fun saveState(s: QuickState) = store.saveState(s)
      }
      return QuickActions(backend) { ip ->
        val lite = HeosLite(ip).also { it.connect() }
        val q = HeosQuick(lite)
        object : HeosQuickLike {
          override fun pidFor(serial: String) = q.pidFor(serial)
          override fun volume(pid: Int) = q.volume(pid)
          override fun setVolume(pid: Int, v: Int) = q.setVolume(pid, v)
          override fun mute(pid: Int) = q.mute(pid)
          override fun setMute(pid: Int, on: Boolean) = q.setMute(pid, on)
          override fun playInput(pid: Int, mid: String) = q.playInput(pid, mid)
          override fun nowPlayingMid(pid: Int) = q.nowPlayingMid(pid)
          override fun playState(pid: Int) = q.playState(pid)
          override fun close() = lite.close()
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run the Kotlin tests**

Run: `./gradlew :zapbar-quick:testDebugUnitTest > ../../../.superpowers/kt-test.log 2>&1; echo "exit $?"`
Expected: `exit 0`; Pill and QuickActions tests pass, alongside the earlier ones.

- [ ] **Step 5: Implement the widgets**

`res/values/zq_strings.xml`:
```xml
<resources>
  <string name="zq_widget_large">Zapbar remote</string>
  <string name="zq_widget_small">Zapbar volume</string>
  <string name="zq_mute">Mute</string>
</resources>
```

`res/xml/zq_widget_large_info.xml`:
```xml
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="250dp" android:minHeight="110dp" android:targetCellWidth="4" android:targetCellHeight="2"
  android:resizeMode="horizontal" android:updatePeriodMillis="0" android:widgetCategory="home_screen"
  android:initialLayout="@layout/zq_widget_large" android:previewLayout="@layout/zq_widget_large" android:description="@string/zq_widget_large" />
```
`res/xml/zq_widget_small_info.xml`: the same with `minHeight="40dp"`, `targetCellHeight="1"`, `@layout/zq_widget_small` and `@string/zq_widget_small`.

`res/layout/zq_widget_small.xml`:
```xml
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:id="@+id/zq_root" android:layout_width="match_parent" android:layout_height="match_parent"
  android:orientation="horizontal" android:gravity="center_vertical" android:padding="8dp" android:background="@drawable/zq_bg_widget">
  <ImageView android:layout_width="20dp" android:layout_height="20dp" android:layout_marginHorizontal="4dp" android:src="@drawable/zq_ic_z" android:tint="@color/zq_accent" />
  <ImageView android:id="@+id/zq_mute" android:layout_width="44dp" android:layout_height="44dp" android:padding="10dp" android:background="@drawable/zq_bg_round" android:src="@drawable/zq_ic_volume_high" android:tint="@color/zq_text" android:contentDescription="@string/zq_mute" />
  <include layout="@layout/zq_pill" android:layout_width="0dp" android:layout_height="44dp" android:layout_weight="1" android:layout_marginStart="6dp" />
  <TextView android:id="@+id/zq_volume" android:layout_width="44dp" android:layout_height="44dp" android:gravity="center" android:textColor="@color/zq_text" android:textSize="18sp" android:textStyle="bold" android:fontFamily="sans-serif-medium" />
</LinearLayout>
```

`res/layout/zq_widget_large.xml`:
```xml
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:id="@+id/zq_root" android:layout_width="match_parent" android:layout_height="match_parent"
  android:orientation="vertical" android:padding="10dp" android:background="@drawable/zq_bg_widget">
  <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical" android:paddingHorizontal="4dp">
    <ImageView android:layout_width="18dp" android:layout_height="18dp" android:src="@drawable/zq_ic_z" android:tint="@color/zq_accent" />
    <TextView android:id="@+id/zq_name" android:layout_width="0dp" android:layout_weight="1" android:layout_height="wrap_content" android:layout_marginStart="6dp" android:textColor="@color/zq_text" android:textSize="13sp" android:textStyle="bold" android:maxLines="1" android:ellipsize="end" />
    <TextView android:id="@+id/zq_status" android:layout_width="wrap_content" android:layout_height="wrap_content" android:textColor="@color/zq_muted" android:textSize="12sp" android:maxLines="1" android:ellipsize="end" />
  </LinearLayout>
  <LinearLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" android:orientation="horizontal" android:gravity="center_vertical" android:layout_marginTop="6dp">
    <ImageView android:id="@+id/zq_mute" android:layout_width="44dp" android:layout_height="44dp" android:padding="10dp" android:background="@drawable/zq_bg_round" android:src="@drawable/zq_ic_volume_high" android:tint="@color/zq_text" android:contentDescription="@string/zq_mute" />
    <include layout="@layout/zq_pill" android:layout_width="0dp" android:layout_height="44dp" android:layout_weight="1" android:layout_marginStart="6dp" />
    <TextView android:id="@+id/zq_volume" android:layout_width="44dp" android:layout_height="44dp" android:gravity="center" android:textColor="@color/zq_text" android:textSize="18sp" android:textStyle="bold" android:fontFamily="sans-serif-medium" />
  </LinearLayout>
  <LinearLayout android:layout_width="match_parent" android:layout_height="56dp" android:orientation="horizontal" android:layout_marginTop="6dp">
    <!-- four input tiles: zq_in_0..3, each an icon + label -->
    <LinearLayout android:id="@+id/zq_in_0" android:layout_width="0dp" android:layout_weight="1" android:layout_height="match_parent" android:layout_marginEnd="4dp" android:orientation="vertical" android:gravity="center" android:background="@drawable/zq_bg_tile">
      <ImageView android:id="@+id/zq_in_0_icon" android:layout_width="20dp" android:layout_height="20dp" /><TextView android:id="@+id/zq_in_0_label" android:layout_width="wrap_content" android:layout_height="wrap_content" android:textSize="11sp" android:textStyle="bold" android:maxLines="1" android:ellipsize="end" />
    </LinearLayout>
    <LinearLayout android:id="@+id/zq_in_1" android:layout_width="0dp" android:layout_weight="1" android:layout_height="match_parent" android:layout_marginEnd="4dp" android:orientation="vertical" android:gravity="center" android:background="@drawable/zq_bg_tile">
      <ImageView android:id="@+id/zq_in_1_icon" android:layout_width="20dp" android:layout_height="20dp" /><TextView android:id="@+id/zq_in_1_label" android:layout_width="wrap_content" android:layout_height="wrap_content" android:textSize="11sp" android:textStyle="bold" android:maxLines="1" android:ellipsize="end" />
    </LinearLayout>
    <LinearLayout android:id="@+id/zq_in_2" android:layout_width="0dp" android:layout_weight="1" android:layout_height="match_parent" android:layout_marginEnd="4dp" android:orientation="vertical" android:gravity="center" android:background="@drawable/zq_bg_tile">
      <ImageView android:id="@+id/zq_in_2_icon" android:layout_width="20dp" android:layout_height="20dp" /><TextView android:id="@+id/zq_in_2_label" android:layout_width="wrap_content" android:layout_height="wrap_content" android:textSize="11sp" android:textStyle="bold" android:maxLines="1" android:ellipsize="end" />
    </LinearLayout>
    <LinearLayout android:id="@+id/zq_in_3" android:layout_width="0dp" android:layout_weight="1" android:layout_height="match_parent" android:orientation="vertical" android:gravity="center" android:background="@drawable/zq_bg_tile">
      <ImageView android:id="@+id/zq_in_3_icon" android:layout_width="20dp" android:layout_height="20dp" /><TextView android:id="@+id/zq_in_3_label" android:layout_width="wrap_content" android:layout_height="wrap_content" android:textSize="11sp" android:textStyle="bold" android:maxLines="1" android:ellipsize="end" />
    </LinearLayout>
  </LinearLayout>
</LinearLayout>
```

`java/expo/modules/zapbarquick/widget/WidgetRenderer.kt`:
```kotlin
package expo.modules.zapbarquick.widget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import expo.modules.zapbarquick.Pill
import expo.modules.zapbarquick.QuickConfig
import expo.modules.zapbarquick.QuickReceiver
import expo.modules.zapbarquick.QuickState
import expo.modules.zapbarquick.R

object WidgetRenderer {
  private val INPUT_IDS = arrayOf(
    Triple(R.id.zq_in_0, R.id.zq_in_0_icon, R.id.zq_in_0_label), Triple(R.id.zq_in_1, R.id.zq_in_1_icon, R.id.zq_in_1_label),
    Triple(R.id.zq_in_2, R.id.zq_in_2_icon, R.id.zq_in_2_label), Triple(R.id.zq_in_3, R.id.zq_in_3_icon, R.id.zq_in_3_label),
  )

  fun iconFor(id: String): Int = when (id) {
    "tv" -> R.drawable.zq_ic_television
    "decoder" -> R.drawable.zq_ic_television_box
    "playstation" -> R.drawable.zq_ic_sony_playstation
    "xbox" -> R.drawable.zq_ic_microsoft_xbox
    "switch" -> R.drawable.zq_ic_nintendo_switch
    "appletv" -> R.drawable.zq_ic_apple
    "chromecast" -> R.drawable.zq_ic_cast
    "audio" -> R.drawable.zq_ic_audio_input_stereo_minijack
    else -> R.drawable.zq_ic_video_input_hdmi
  }

  fun broadcast(ctx: Context, request: Int, type: String, value: Int = 0, mid: String? = null): PendingIntent =
    PendingIntent.getBroadcast(ctx, request, Intent(ctx, QuickReceiver::class.java).setAction(QuickReceiver.ACTION).putExtra("type", type).putExtra("value", value).putExtra("mid", mid),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  fun openSlider(ctx: Context): PendingIntent =
    PendingIntent.getActivity(ctx, 900, Intent(ctx, expo.modules.zapbarquick.slider.SliderActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)

  fun openApp(ctx: Context): PendingIntent? =
    ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let { PendingIntent.getActivity(ctx, 901, it, PendingIntent.FLAG_IMMUTABLE) }

  /** Shared by widgets and the notification: mute, 20 pill segments, number. */
  fun bindVolumeRow(ctx: Context, v: RemoteViews, state: QuickState, enabled: Boolean) {
    for (i in 0 until Pill.SEGMENTS) {
      v.setInt(Pill.SEGMENT_IDS[i], "setBackgroundResource", Pill.drawable(i, state.volume))
      if (enabled) v.setOnClickPendingIntent(Pill.SEGMENT_IDS[i], broadcast(ctx, 100 + i, "volume", Pill.volumeFor(i)))
    }
    v.setImageViewResource(R.id.zq_mute, if (state.mute) R.drawable.zq_ic_volume_off else R.drawable.zq_ic_volume_high)
    v.setInt(R.id.zq_mute, "setColorFilter", ContextCompat.getColor(ctx, if (state.mute) R.color.zq_warn else R.color.zq_text))
    v.setTextViewText(R.id.zq_volume, state.volume.toString())
    if (enabled) {
      v.setOnClickPendingIntent(R.id.zq_mute, broadcast(ctx, 99, "mute"))
      v.setOnClickPendingIntent(R.id.zq_volume, openSlider(ctx))
    }
  }

  fun status(cfg: QuickConfig?, state: QuickState, now: Long = System.currentTimeMillis()): String {
    if (cfg == null) return "Open Zapbar to set up"
    if (state.message != null && now < state.messageUntil) return state.message
    return cfg.inputs.firstOrNull { it.mid == state.activeMid }?.label ?: ""
  }

  fun large(ctx: Context, cfg: QuickConfig?, state: QuickState): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.zq_widget_large)
    v.setTextViewText(R.id.zq_name, cfg?.name ?: "Zapbar")
    v.setTextViewText(R.id.zq_status, status(cfg, state))
    bindVolumeRow(ctx, v, state, cfg != null)
    val inputs = cfg?.visibleInputs()?.take(4) ?: emptyList()
    INPUT_IDS.forEachIndexed { i, (box, icon, label) ->
      val input = inputs.getOrNull(i)
      if (input == null) { v.setViewVisibility(box, android.view.View.INVISIBLE); return@forEachIndexed }
      val on = input.mid == state.activeMid
      v.setViewVisibility(box, android.view.View.VISIBLE)
      v.setInt(box, "setBackgroundResource", if (on) R.drawable.zq_bg_tile_on else R.drawable.zq_bg_tile)
      v.setImageViewResource(icon, iconFor(input.icon))
      val fg = ContextCompat.getColor(ctx, if (on) R.color.zq_on_accent else R.color.zq_text)
      v.setInt(icon, "setColorFilter", fg)
      v.setTextViewText(label, input.label)
      v.setTextColor(label, fg)
      v.setOnClickPendingIntent(box, broadcast(ctx, 200 + i, "input", mid = input.mid))
    }
    if (cfg == null) openApp(ctx)?.let { v.setOnClickPendingIntent(R.id.zq_root, it) }
    return v
  }

  fun small(ctx: Context, cfg: QuickConfig?, state: QuickState): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.zq_widget_small)
    bindVolumeRow(ctx, v, state, cfg != null)
    if (cfg == null) openApp(ctx)?.let { v.setOnClickPendingIntent(R.id.zq_root, it) }
    return v
  }
}
```

`java/expo/modules/zapbarquick/widget/WidgetUpdater.kt`:
```kotlin
package expo.modules.zapbarquick.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import expo.modules.zapbarquick.QuickStore

object WidgetUpdater {
  fun updateAll(ctx: Context) {
    val mgr = AppWidgetManager.getInstance(ctx)
    val store = QuickStore(ctx)
    val cfg = store.config()
    val state = store.state()
    mgr.getAppWidgetIds(ComponentName(ctx, LargeWidget::class.java)).forEach { mgr.updateAppWidget(it, WidgetRenderer.large(ctx, cfg, state)) }
    mgr.getAppWidgetIds(ComponentName(ctx, SmallWidget::class.java)).forEach { mgr.updateAppWidget(it, WidgetRenderer.small(ctx, cfg, state)) }
  }
}
```

`java/expo/modules/zapbarquick/widget/LargeWidget.kt` and `SmallWidget.kt`:
```kotlin
package expo.modules.zapbarquick.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import expo.modules.zapbarquick.QuickReceiver

class LargeWidget : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
    WidgetUpdater.updateAll(ctx)
    QuickReceiver.runAsync(ctx, null, expo.modules.zapbarquick.QuickAction.Refresh) // fresh state on placement
  }
}
```
`SmallWidget.kt` is the same class body, named `SmallWidget`.

`java/expo/modules/zapbarquick/QuickReceiver.kt`:
```kotlin
package expo.modules.zapbarquick

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import expo.modules.zapbarquick.widget.WidgetUpdater
import java.util.concurrent.Executors

/** Widget, notification and slider taps arrive here; work runs off the main thread under goAsync(). */
class QuickReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    val action = when (intent.getStringExtra("type")) {
      "volume" -> QuickAction.SetVolume(intent.getIntExtra("value", 0))
      "mute" -> QuickAction.ToggleMute
      "input" -> intent.getStringExtra("mid")?.let { QuickAction.PlayInput(it) } ?: return
      else -> QuickAction.Refresh
    }
    runAsync(ctx, goAsync(), action)
  }

  companion object {
    const val ACTION = "expo.modules.zapbarquick.ACTION"
    private val worker = Executors.newSingleThreadExecutor()

    fun runAsync(ctx: Context, pending: PendingResult?, action: QuickAction) {
      val app = ctx.applicationContext
      // Optimistic first paint for inputs and volume, then the read-back repaint.
      val store = QuickStore(app)
      val s = store.state()
      when (action) {
        is QuickAction.PlayInput -> store.saveState(s.copy(activeMid = action.mid))
        is QuickAction.SetVolume -> store.saveState(s.copy(volume = action.volume))
        else -> Unit
      }
      QuickHooks.refresh(app)
      worker.execute {
        try {
          QuickActions.forContext(app).run(action)
          QuickHooks.refresh(app)
        } finally {
          pending?.finish()
        }
      }
    }
  }
}
```
In `ZapbarQuickModule.kt`, change `QuickHooks.refresh` to call `expo.modules.zapbarquick.widget.WidgetUpdater.updateAll(ctx)`. Task 8 adds the slider; until then, create an empty `slider/SliderActivity.kt` (`class SliderActivity : android.app.Activity()`) so `WidgetRenderer` compiles.

`AndroidManifest.xml` of the module (replace):
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application>
    <receiver android:name="expo.modules.zapbarquick.QuickReceiver" android:exported="false">
      <intent-filter><action android:name="expo.modules.zapbarquick.ACTION" /></intent-filter>
    </receiver>
    <receiver android:name="expo.modules.zapbarquick.widget.LargeWidget" android:exported="true" android:label="@string/zq_widget_large">
      <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
      <meta-data android:name="android.appwidget.provider" android:resource="@xml/zq_widget_large_info" />
    </receiver>
    <receiver android:name="expo.modules.zapbarquick.widget.SmallWidget" android:exported="true" android:label="@string/zq_widget_small">
      <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
      <meta-data android:name="android.appwidget.provider" android:resource="@xml/zq_widget_small_info" />
    </receiver>
    <activity android:name="expo.modules.zapbarquick.slider.SliderActivity" android:exported="false" />
  </application>
</manifest>
```

- [ ] **Step 6: Build, run the tests and look at the widget on the emulator**

Run the Kotlin tests (expected `exit 0`), then `cd .. && pnpm test && pnpm typecheck` (all PASS). Build and install the x86_64 APK on the emulator. Long-press the home screen → Widgets → "Zapbar remote", then add both widgets. Screenshot them (`docs/quick-check/widgets-dark.png`, then `cmd uimode night no` for `widgets-light.png`) and compare against the mockup `widgets-v4.html`. Expected:
- the room name;
- the current input;
- the pill filled to the bar's volume;
- 4 input tiles with the active one lit.

Tap a pill segment near the middle and check (`adb exec-out screencap`) that the number changes to about 50. **This changes the real bar's volume. Set it back to its previous value from the app afterwards.** Do not tap input tiles from the emulator.

- [ ] **Step 7: Commit**

```bash
cd ~/projects/zapbar && git add -A && git commit -m "feat(quick): 4x2 and 4x1 widgets with tap-to-set volume pill, inputs and mute

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 8: Floating volume slider

**Files (under `apps/remote/modules/zapbar-quick/android/src/main/`):**
- Create/replace: `java/expo/modules/zapbarquick/slider/SliderActivity.kt`, `slider/PillSliderView.kt`, `slider/SliderMath.kt`, `res/layout/zq_slider.xml`, `res/values/zq_themes.xml`
- Modify: `AndroidManifest.xml` (activity theme and flags)
- Test: `src/test/java/expo/modules/zapbarquick/SliderMathTest.kt`

**Interfaces:**
- Consumes: `QuickActions`, `QuickAction`, `QuickStore`, `QuickHooks`, `Pill` (Tasks 5 and 7).
- Produces:
  - `object SliderMath { valueAt(x, width, knob): Int; knobCentre(value, width, knob): Float }` (0–100, knob centre travelling linearly from knob/2 to width − knob/2)
  - `class Coalescer(intervalMs: Long, clock: () -> Long, send: (Int) -> Unit)`: `push(v)`, `flush()`

- [ ] **Step 1: Write the failing test**

`src/test/java/expo/modules/zapbarquick/SliderMathTest.kt`:
```kotlin
package expo.modules.zapbarquick

import expo.modules.zapbarquick.slider.Coalescer
import expo.modules.zapbarquick.slider.SliderMath
import org.junit.Assert.assertEquals
import org.junit.Test

class SliderMathTest {
  @Test fun `finger position maps linearly between the knob centres`() {
    assertEquals(0, SliderMath.valueAt(24f, 300f, 48f)); assertEquals(0, SliderMath.valueAt(0f, 300f, 48f))
    assertEquals(50, SliderMath.valueAt(150f, 300f, 48f)); assertEquals(100, SliderMath.valueAt(276f, 300f, 48f)); assertEquals(100, SliderMath.valueAt(400f, 300f, 48f))
  }
  @Test fun `knob centre is the inverse of the finger mapping`() {
    assertEquals(150f, SliderMath.knobCentre(50, 300f, 48f), 0.01f)
    assertEquals(24f, SliderMath.knobCentre(0, 300f, 48f), 0.01f)
  }
  @Test fun `coalescer sends at most one value per interval plus the final value`() {
    var now = 0L; val sent = mutableListOf<Int>()
    val c = Coalescer(150, { now }) { sent += it }
    c.push(10); now = 50; c.push(20); now = 100; c.push(30); now = 160; c.push(40); c.flush()
    assertEquals(listOf(10, 40), sent)
  }
}
```
Expected values: `push(10)` sends immediately. 20 and 30 fall inside the window and only replace the pending value. At 160 ms the window has passed, so 40 is sent. `flush()` has nothing new to send, because 40 already went out.

- [ ] **Step 2: Run to verify it fails**

Run: `./gradlew :zapbar-quick:testDebugUnitTest`. Expected: FAIL, with `SliderMath` and `Coalescer` unresolved.

- [ ] **Step 3: Implement**

`slider/SliderMath.kt`:
```kotlin
package expo.modules.zapbarquick.slider

/** Same geometry as the app's PillSlider: the knob centre travels from knob/2 to width - knob/2. */
object SliderMath {
  fun valueAt(x: Float, width: Float, knob: Float): Int {
    val span = (width - knob).coerceAtLeast(1f)
    return (((x - knob / 2) / span) * 100).toInt().coerceIn(0, 100)
  }
  fun knobCentre(value: Int, width: Float, knob: Float): Float = knob / 2 + (value.coerceIn(0, 100) / 100f) * (width - knob)
}

/** At most one send per interval while dragging; flush() sends the last value if it was held back. */
class Coalescer(private val intervalMs: Long, private val clock: () -> Long, private val send: (Int) -> Unit) {
  private var lastSent = Long.MIN_VALUE / 2
  private var lastValue: Int? = null
  private var pending: Int? = null

  fun push(v: Int) {
    val now = clock()
    if (now - lastSent >= intervalMs) { lastSent = now; lastValue = v; pending = null; send(v) } else pending = v
  }

  fun flush() {
    val p = pending ?: return
    pending = null
    if (p != lastValue) { lastSent = clock(); lastValue = p; send(p) }
  }
}
```

`slider/PillSliderView.kt`:
```kotlin
package expo.modules.zapbarquick.slider

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import androidx.core.content.ContextCompat
import expo.modules.zapbarquick.R

class PillSliderView(ctx: Context, attrs: AttributeSet? = null) : View(ctx, attrs) {
  var value = 0; set(v) { field = v.coerceIn(0, 100); invalidate() }
  var onChange: ((Int) -> Unit)? = null
  var onRelease: ((Int) -> Unit)? = null
  private val d = resources.displayMetrics.density
  private val knob = 48 * d
  private val track = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ContextCompat.getColor(ctx, R.color.zq_surface_hi) }
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ContextCompat.getColor(ctx, R.color.zq_accent) }
  private val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ContextCompat.getColor(ctx, R.color.zq_on_accent) }

  init { contentDescription = "Volume"; isFocusable = true }

  override fun onDraw(c: Canvas) {
    val h = height.toFloat(); val r = h / 2
    c.drawRoundRect(RectF(0f, 0f, width.toFloat(), h), r, r, track)
    val centre = SliderMath.knobCentre(value, width.toFloat(), knob)
    c.drawRoundRect(RectF(0f, 0f, centre + knob / 2, h), r, r, fill)
    c.drawCircle(centre, r, 18 * d, dot)
  }

  override fun onTouchEvent(e: MotionEvent): Boolean {
    val v = SliderMath.valueAt(e.x, width.toFloat(), knob)
    when (e.actionMasked) {
      MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> { parent.requestDisallowInterceptTouchEvent(true); value = v; onChange?.invoke(v) }
      MotionEvent.ACTION_UP -> { value = v; onRelease?.invoke(v) }
    }
    return true
  }
}
```

`res/layout/zq_slider.xml`:
```xml
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="wrap_content"
  android:orientation="vertical" android:padding="16dp" android:background="@drawable/zq_bg_widget" android:layout_margin="16dp">
  <TextView android:id="@+id/zq_slider_name" android:layout_width="match_parent" android:layout_height="wrap_content" android:textColor="@color/zq_text" android:textSize="16sp" android:textStyle="bold" android:layout_marginBottom="12dp" />
  <LinearLayout android:layout_width="match_parent" android:layout_height="48dp" android:orientation="horizontal" android:gravity="center_vertical">
    <ImageView android:id="@+id/zq_slider_mute" android:layout_width="48dp" android:layout_height="48dp" android:padding="12dp" android:background="@drawable/zq_bg_round" android:src="@drawable/zq_ic_volume_high" android:contentDescription="@string/zq_mute" />
    <expo.modules.zapbarquick.slider.PillSliderView android:id="@+id/zq_slider_pill" android:layout_width="0dp" android:layout_weight="1" android:layout_height="48dp" android:layout_marginHorizontal="8dp" />
    <TextView android:id="@+id/zq_slider_value" android:layout_width="44dp" android:layout_height="wrap_content" android:gravity="center" android:textColor="@color/zq_text" android:textSize="20sp" android:textStyle="bold" />
  </LinearLayout>
</LinearLayout>
```

`res/values/zq_themes.xml`:
```xml
<resources>
  <style name="Theme.Zapbar.Floating" parent="@android:style/Theme.DeviceDefault.Dialog.NoActionBar">
    <item name="android:windowBackground">@android:color/transparent</item>
    <item name="android:windowIsFloating">false</item>
    <item name="android:windowCloseOnTouchOutside">true</item>
    <item name="android:backgroundDimEnabled">true</item>
  </style>
</resources>
```

`slider/SliderActivity.kt`:
```kotlin
package expo.modules.zapbarquick.slider

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import expo.modules.zapbarquick.QuickAction
import expo.modules.zapbarquick.QuickActions
import expo.modules.zapbarquick.QuickHooks
import expo.modules.zapbarquick.QuickStore
import expo.modules.zapbarquick.R
import java.util.concurrent.Executors

/** Native floating volume slider over whatever is on screen; works with the app closed. */
class SliderActivity : Activity() {
  private val worker = Executors.newSingleThreadExecutor()

  override fun onCreate(saved: Bundle?) {
    super.onCreate(saved)
    setContentView(R.layout.zq_slider)
    window.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT)
    window.setGravity(Gravity.BOTTOM)
    val store = QuickStore(this)
    val cfg = store.config() ?: run { finish(); return }
    val pill = findViewById<PillSliderView>(R.id.zq_slider_pill)
    val value = findViewById<TextView>(R.id.zq_slider_value)
    val mute = findViewById<ImageView>(R.id.zq_slider_mute)
    findViewById<TextView>(R.id.zq_slider_name).text = cfg.name
    val actions = QuickActions.forContext(applicationContext)
    fun show(v: Int, muted: Boolean) {
      pill.value = v; value.text = v.toString()
      mute.setImageResource(if (muted) R.drawable.zq_ic_volume_off else R.drawable.zq_ic_volume_high)
      mute.setColorFilter(ContextCompat.getColor(this, if (muted) R.color.zq_warn else R.color.zq_text))
    }
    store.state().let { show(it.volume, it.mute) }
    val send = { v: Int -> worker.execute { actions.run(QuickAction.SetVolume(v)); QuickHooks.refresh(applicationContext) } }
    val coalescer = Coalescer(150, System::currentTimeMillis, send)
    pill.onChange = { v -> value.text = v.toString(); coalescer.push(v) }
    pill.onRelease = { v -> coalescer.push(v); coalescer.flush() }
    mute.setOnClickListener {
      worker.execute {
        val s = actions.run(QuickAction.ToggleMute)
        runOnUiThread { show(s.volume, s.mute) }
        QuickHooks.refresh(applicationContext)
      }
    }
    worker.execute { val s = actions.run(QuickAction.Refresh); runOnUiThread { show(s.volume, s.mute) } }
  }

  override fun onDestroy() { worker.shutdown(); super.onDestroy() }
}
```

In the module manifest, replace the activity element with:
```xml
<activity android:name="expo.modules.zapbarquick.slider.SliderActivity" android:exported="false" android:theme="@style/Theme.Zapbar.Floating"
  android:excludeFromRecents="true" android:taskAffinity="expo.modules.zapbarquick.slider" android:launchMode="singleInstance" />
```

- [ ] **Step 4: Run tests, then check on the emulator**

Run the Kotlin tests (expected `exit 0`) and the JS suite (PASS). Build and install on the emulator, tap the widget's number, and screenshot the panel to `docs/quick-check/slider-dark.png`. Expected:
- a bottom panel with the room name, mute, the pill at the current volume and the number;
- tapping outside closes it.

Drag a little (`adb shell input swipe`) and confirm the number follows. Restore the bar's volume from the app afterwards.

- [ ] **Step 5: Commit**

```bash
cd ~/projects/zapbar && git add -A && git commit -m "feat(quick): floating native volume slider with coalesced drags

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 9: Live controls service (media session, notification, lifecycle)

**Files (module, under `android/src/main/`):**
- Create: `java/expo/modules/zapbarquick/live/LiveRules.kt`, `live/LiveControlsService.kt`, `live/NotificationRenderer.kt`, `res/layout/zq_notif_small.xml`, `res/layout/zq_notif_big.xml`
- Modify: `AndroidManifest.xml` (service and permissions), `ZapbarQuickModule.kt` (`QuickHooks`), `apps/remote/src/runtime/RuntimeProvider.tsx` (notification permission)
- Test: `src/test/java/expo/modules/zapbarquick/LiveRulesTest.kt`, `apps/remote/__tests__/runtime.test.tsx` (append)

**Interfaces:**
- Consumes: `HeosLite`/`HeosQuick` (Task 4), `QuickStore`/`QuickConfig`/`QuickState` (Task 5), `Pill`/`WidgetRenderer.bindVolumeRow`/`WidgetUpdater` (Task 7), `SliderActivity` (Task 8).
- Produces:
  - `data class LiveInputs(appForeground, playing, onLan, volumeKeys, notification, idleSinceMs: Long?)`
  - `object LiveRules { IDLE_MS; shouldRun(i, nowMs); stepVolume(current, direction): Int }`
  - `LiveControlsService.start(ctx)` and `LiveControlsService.reevaluate(ctx)`
  - TS: `requestNotificationPermissionOnce(memory, platform)` in `RuntimeProvider.tsx`

- [ ] **Step 1: Write the failing tests**

`src/test/java/expo/modules/zapbarquick/LiveRulesTest.kt`:
```kotlin
package expo.modules.zapbarquick

import expo.modules.zapbarquick.live.LiveInputs
import expo.modules.zapbarquick.live.LiveRules
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveRulesTest {
  private val on = LiveInputs(appForeground = false, playing = true, onLan = true, volumeKeys = true, notification = true, idleSinceMs = null)

  @Test fun `runs while the app is in the foreground`() = assertTrue(LiveRules.shouldRun(on.copy(appForeground = true, playing = false), 0))
  @Test fun `keeps running in the background while the bar plays`() = assertTrue(LiveRules.shouldRun(on, 0))
  @Test fun `stops when idle 5 minutes in background`() {
    val idle = on.copy(playing = false, idleSinceMs = 0)
    assertTrue(LiveRules.shouldRun(idle, LiveRules.IDLE_MS - 1))
    assertFalse(LiveRules.shouldRun(idle, LiveRules.IDLE_MS))
  }
  @Test fun `stops off the LAN`() = assertFalse(LiveRules.shouldRun(on.copy(appForeground = true, onLan = false), 0))
  @Test fun `does not run with both settings off`() = assertFalse(LiveRules.shouldRun(on.copy(appForeground = true, volumeKeys = false, notification = false), 0))
  @Test fun `volume-key steps clamp at 0 and 100`() {
    assertEquals(44, LiveRules.stepVolume(42, 1)); assertEquals(40, LiveRules.stepVolume(42, -1))
    assertEquals(100, LiveRules.stepVolume(99, 1)); assertEquals(0, LiveRules.stepVolume(1, -1)); assertEquals(42, LiveRules.stepVolume(42, 0))
  }
}
```

Append to `apps/remote/__tests__/runtime.test.tsx`:
```tsx
import { PermissionsAndroid } from 'react-native';
import { DeviceMemory, memoryKv } from '../src/runtime/memory';
import { requestNotificationPermissionOnce } from '../src/runtime/RuntimeProvider';

it('asks for the notification permission once, on Android 13+, only with the notification on', async () => {
  const req = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted');
  const mem = new DeviceMemory(memoryKv());
  await requestNotificationPermissionOnce(mem, { OS: 'android', Version: 34 });
  await requestNotificationPermissionOnce(mem, { OS: 'android', Version: 34 });
  expect(req).toHaveBeenCalledTimes(1);
  const mem2 = new DeviceMemory(memoryKv());
  mem2.setQuickSettings({ notification: false });
  await requestNotificationPermissionOnce(mem2, { OS: 'android', Version: 34 });
  await requestNotificationPermissionOnce(new DeviceMemory(memoryKv()), { OS: 'android', Version: 32 });
  expect(req).toHaveBeenCalledTimes(1);
  req.mockRestore();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `./gradlew :zapbar-quick:testDebugUnitTest` and `cd .. && pnpm test runtime`
Expected: both FAIL. `LiveRules` is missing and `requestNotificationPermissionOnce` is not exported.

- [ ] **Step 3: Implement the rules and the permission helper**

`live/LiveRules.kt`:
```kotlin
package expo.modules.zapbarquick.live

data class LiveInputs(
  val appForeground: Boolean,
  val playing: Boolean,
  val onLan: Boolean,
  val volumeKeys: Boolean,
  val notification: Boolean,
  val idleSinceMs: Long?,
)

/** Spec §2: live while the app is open, or while the bar plays, plus 5 minutes of idle; never off the LAN. */
object LiveRules {
  const val IDLE_MS = 5 * 60_000L

  fun shouldRun(i: LiveInputs, nowMs: Long): Boolean {
    if (!i.onLan || (!i.volumeKeys && !i.notification)) return false
    if (i.appForeground || i.playing) return true
    val since = i.idleSinceMs ?: return false
    return nowMs - since < IDLE_MS
  }

  /** Volume keys move 2 per press, clamped to 0–100. */
  fun stepVolume(current: Int, direction: Int): Int = (current + 2 * direction.coerceIn(-1, 1)).coerceIn(0, 100)
}
```

In `apps/remote/src/runtime/RuntimeProvider.tsx` (and the `K` keys of `memory.ts`, plus `DeviceMemory.flag(name)` / `setFlag(name)` helpers backed by `kv`):
```ts
/** Android 13+ needs POST_NOTIFICATIONS for the live-controls notification; ask once, only if it is wanted. */
export async function requestNotificationPermissionOnce(memory: DeviceMemory, platform: { OS: string; Version: number | string }): Promise<void> {
  if (platform.OS !== 'android' || Number(platform.Version) < 33) return;
  if (!memory.quickSettings().notification || memory.flag('askedNotifications')) return;
  memory.setFlag('askedNotifications');
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
}
```
`DeviceMemory.flag(name: string): boolean` reads `this.read(\`flag:${name}\`, false) === true`. `setFlag(name)` writes `true`.

`RuntimeProvider`'s default path calls `requestNotificationPermissionOnce(memory, Platform)` once on mount. The manager exposes its `DeviceMemory` as `m.memory` (a readonly getter over `d.memory`). Add it if it is missing.

- [ ] **Step 4: Run the tests**

Run: `./gradlew :zapbar-quick:testDebugUnitTest; cd .. && pnpm test && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 5: Implement the service and the notification**

`res/layout/zq_notif_small.xml`:
```xml
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical">
  <TextView android:id="@+id/zq_status" android:layout_width="match_parent" android:layout_height="wrap_content" android:textSize="13sp" android:maxLines="1" android:ellipsize="end" android:textAppearance="@android:style/TextAppearance.Material.Notification" />
  <LinearLayout android:layout_width="match_parent" android:layout_height="44dp" android:layout_marginTop="6dp" android:orientation="horizontal" android:gravity="center_vertical">
    <ImageView android:id="@+id/zq_mute" android:layout_width="44dp" android:layout_height="44dp" android:padding="10dp" android:background="@drawable/zq_bg_round" android:src="@drawable/zq_ic_volume_high" android:contentDescription="@string/zq_mute" />
    <include layout="@layout/zq_pill" android:layout_width="0dp" android:layout_height="40dp" android:layout_weight="1" android:layout_marginStart="6dp" />
    <TextView android:id="@+id/zq_volume" android:layout_width="44dp" android:layout_height="44dp" android:gravity="center" android:textSize="17sp" android:textStyle="bold" android:textAppearance="@android:style/TextAppearance.Material.Notification.Title" />
  </LinearLayout>
</LinearLayout>
```
`res/layout/zq_notif_big.xml` is the same content, plus an inputs row with three tiles: ids `zq_in_0..2` with `_icon`/`_label` children, the same markup as the large widget's tiles.

`live/NotificationRenderer.kt`:
```kotlin
package expo.modules.zapbarquick.live

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import expo.modules.zapbarquick.QuickConfig
import expo.modules.zapbarquick.QuickState
import expo.modules.zapbarquick.R
import expo.modules.zapbarquick.widget.WidgetRenderer

object NotificationRenderer {
  const val CHANNEL = "zapbar_live"
  const val ID = 4242

  fun ensureChannel(ctx: Context) {
    ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(
      NotificationChannel(CHANNEL, "Live controls", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false); setSound(null, null) })
  }

  fun line(cfg: QuickConfig, s: QuickState, soundMode: String?): String {
    val what = cfg.inputs.firstOrNull { it.mid == s.activeMid }?.label ?: "Streaming"
    return listOfNotNull(what, "Volume ${s.volume}", soundMode).joinToString(" · ")
  }

  /** full = false: the minimal notification Android requires when only volume keys are on (ruling). */
  fun build(ctx: Context, cfg: QuickConfig, s: QuickState, full: Boolean, soundMode: String? = null): Notification {
    ensureChannel(ctx)
    val b = NotificationCompat.Builder(ctx, CHANNEL).setSmallIcon(R.drawable.zq_ic_z).setOngoing(true).setSilent(true)
      .setContentTitle("Zapbar · ${cfg.name}").setColor(ContextCompat.getColor(ctx, R.color.zq_accent))
      .setContentIntent(WidgetRenderer.openApp(ctx)).setCategory(NotificationCompat.CATEGORY_SERVICE)
    if (!full) return b.setContentText("Volume keys control the soundbar").build()
    val small = RemoteViews(ctx.packageName, R.layout.zq_notif_small)
    small.setTextViewText(R.id.zq_status, line(cfg, s, soundMode))
    WidgetRenderer.bindVolumeRow(ctx, small, s, true)
    val big = RemoteViews(ctx.packageName, R.layout.zq_notif_big)
    big.setTextViewText(R.id.zq_status, line(cfg, s, soundMode))
    WidgetRenderer.bindVolumeRow(ctx, big, s, true)
    WidgetRenderer.bindInputs(ctx, big, cfg, s, 3)
    return b.setStyle(NotificationCompat.DecoratedCustomViewStyle()).setCustomContentView(small).setCustomBigContentView(big).build()
  }
}
```
Extract the input-tile loop from `WidgetRenderer.large` into `fun bindInputs(ctx, v: RemoteViews, cfg: QuickConfig, state: QuickState, count: Int)` and use it from both places, so it is not duplicated.

`live/LiveControlsService.kt`:
```kotlin
package expo.modules.zapbarquick.live

import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.content.ContextCompat
import androidx.media.VolumeProviderCompat
import expo.modules.zapbarquick.QuickHooks
import expo.modules.zapbarquick.QuickStore
import expo.modules.zapbarquick.heos.HeosLite
import expo.modules.zapbarquick.heos.HeosQuick
import java.util.concurrent.Executors

/** Spec §4: holds one CLI connection with events, the remote-volume media session and the notification. */
class LiveControlsService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor()
  private lateinit var store: QuickStore
  private var lite: HeosLite? = null
  private var quick: HeosQuick? = null
  private var pid = 0
  private var session: MediaSessionCompat? = null
  private var provider: VolumeProviderCompat? = null
  private var idleSince: Long? = null
  private var onLan = true
  private var netCallback: ConnectivityManager.NetworkCallback? = null
  private val tick = object : Runnable { override fun run() { evaluate(); main.postDelayed(this, 30_000) } }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    store = QuickStore(this)
    running = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val cfg = store.config() ?: run { stopSelf(); return START_NOT_STICKY }
    val n = NotificationRenderer.build(this, cfg, store.state(), full = cfg.notification && notificationsAllowed())
    if (Build.VERSION.SDK_INT >= 29) startForeground(NotificationRenderer.ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE) else startForeground(NotificationRenderer.ID, n)
    if (lite == null) connect()
    watchNetwork()
    main.removeCallbacks(tick); main.post(tick)
    return START_NOT_STICKY
  }

  private fun notificationsAllowed() = getSystemService(NotificationManager::class.java).areNotificationsEnabled()

  private fun connect() {
    val cfg = store.config() ?: return
    worker.execute {
      try {
        val l = HeosLite(cfg.lastIp).also { it.connect() }
        val q = HeosQuick(l)
        pid = q.pidFor(cfg.serial)
        l.onEvent = { event, msg -> worker.execute { onEvent(event, msg) } }
        q.registerEvents()
        lite = l; quick = q
        val s = store.state().copy(volume = q.volume(pid), mute = q.mute(pid), activeMid = q.nowPlayingMid(pid), playState = q.playState(pid), message = null)
        store.saveState(s)
        main.post { setupSession(); publish() }
      } catch (e: Exception) {
        main.post { stopSelf() }
      }
    }
  }

  private fun onEvent(event: String, msg: Map<String, String>) {
    val q = quick ?: return
    var s = store.state()
    when (event) {
      "player_volume_changed" -> s = s.copy(volume = msg["level"]?.toIntOrNull() ?: s.volume, mute = msg["mute"] == "on")
      "player_state_changed" -> s = s.copy(playState = msg["state"] ?: s.playState)
      "player_now_playing_changed" -> s = s.copy(activeMid = runCatching { q.nowPlayingMid(pid) }.getOrNull())
      else -> return
    }
    store.saveState(s)
    main.post { publish() }
  }

  /** [keys] Skip when Task 1 ruled BLOCKED. */
  private fun setupSession() {
    val cfg = store.config() ?: return
    if (!cfg.volumeKeys || session != null) return
    val p = object : VolumeProviderCompat(VOLUME_CONTROL_ABSOLUTE, 50, store.state().volume / 2) {
      override fun onSetVolumeTo(volume: Int) = setVolume((volume * 2).coerceIn(0, 100))
      override fun onAdjustVolume(direction: Int) = setVolume(LiveRules.stepVolume(store.state().volume, direction))
    }
    provider = p
    session = MediaSessionCompat(this, "Zapbar").apply {
      setPlaybackToRemote(p)
      setPlaybackState(PlaybackStateCompat.Builder().setState(PlaybackStateCompat.STATE_PLAYING, 0, 1f).build())
      isActive = true
    }
  }

  private fun setVolume(v: Int) {
    store.saveState(store.state().copy(volume = v))
    provider?.currentVolume = v / 2
    publish()
    worker.execute { runCatching { quick?.setVolume(pid, v) } }
  }

  private fun publish() {
    val cfg = store.config() ?: return
    val s = store.state()
    provider?.currentVolume = s.volume / 2
    idleSince = if (s.playState == "play") null else (idleSince ?: System.currentTimeMillis())
    getSystemService(NotificationManager::class.java).notify(NotificationRenderer.ID, NotificationRenderer.build(this, cfg, s, full = cfg.notification && notificationsAllowed()))
    QuickHooks.refresh(this)
    evaluate()
  }

  fun evaluate() {
    val cfg = store.config() ?: return stopSelf()
    val inputs = LiveInputs(QuickHooks.appForeground, store.state().playState == "play", onLan, cfg.volumeKeys, cfg.notification, idleSince)
    if (!LiveRules.shouldRun(inputs, System.currentTimeMillis())) stopSelf()
  }

  private fun watchNetwork() {
    if (netCallback != null) return
    val cm = getSystemService(ConnectivityManager::class.java)
    val cb = object : ConnectivityManager.NetworkCallback() {
      override fun onCapabilitiesChanged(n: Network, caps: NetworkCapabilities) {
        onLan = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
        main.post { evaluate() }
      }
      override fun onLost(n: Network) { onLan = false; main.post { evaluate() } }
    }
    cm.registerDefaultNetworkCallback(cb)
    netCallback = cb
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    QuickHooks.appForeground = false
    evaluate()
  }

  override fun onDestroy() {
    main.removeCallbacks(tick)
    netCallback?.let { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it) }
    session?.release()
    lite?.close()
    worker.shutdownNow()
    if (running === this) running = null
    super.onDestroy()
  }

  companion object {
    @Volatile private var running: LiveControlsService? = null

    fun start(ctx: Context) {
      val cfg = QuickStore(ctx).config() ?: return
      if (!cfg.volumeKeys && !cfg.notification) return
      ContextCompat.startForegroundService(ctx, Intent(ctx, LiveControlsService::class.java))
    }

    fun reevaluate(ctx: Context) {
      running?.let { s -> Handler(Looper.getMainLooper()).post { s.evaluate() } }
    }
  }
}
```

In `ZapbarQuickModule.kt`, update `QuickHooks`:
```kotlin
object QuickHooks {
  @Volatile var appForeground = false
  fun onConfigChanged(ctx: Context) { refresh(ctx); expo.modules.zapbarquick.live.LiveControlsService.reevaluate(ctx) }
  fun onAppForeground(ctx: Context, fg: Boolean) {
    appForeground = fg
    if (fg) expo.modules.zapbarquick.live.LiveControlsService.start(ctx) else expo.modules.zapbarquick.live.LiveControlsService.reevaluate(ctx)
  }
  fun refresh(ctx: Context) { expo.modules.zapbarquick.widget.WidgetUpdater.updateAll(ctx) }
}
```

Module manifest: add these permissions and the service.
```xml
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE" />
  <uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
  <!-- inside <application> -->
  <service android:name="expo.modules.zapbarquick.live.LiveControlsService" android:exported="false" android:foregroundServiceType="connectedDevice" />
```

**Ruling to ledger:** Android requires a visible notification for any foreground service. With "Notification" off and "Volume keys" on, the service shows the minimal "Volume keys control the soundbar" notification (`full = false`) instead of none. This deviates from spec §4, and the owner is told.

- [ ] **Step 6: Build and check on the emulator**

Run the Kotlin tests and the JS suite (all PASS). Build, install and open the app on the emulator. Expected:
- the notification appears;
- in the shade it shows the input line and the pill;
- expanding it shows 3 inputs.

Screenshot both to `docs/quick-check/notification-*.png`. Change the volume from the app and check that the notification's number follows.

Then press Home and wait. While the bar plays, the notification stays. Turn the TV off (or ask the owner to) or pause the stream: after 5 minutes it disappears. Toggle the emulator's Wi-Fi off (`adb shell svc wifi disable`): it disappears at once. Re-enable Wi-Fi.

- [ ] **Step 7: Commit**

```bash
cd ~/projects/zapbar && git add -A && git commit -m "feat(quick): live controls service with remote-volume media session and notification

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 10: Quick Settings mute tile

**Files (module):**
- Create: `java/expo/modules/zapbarquick/tile/MuteTileService.kt`, `tile/TileModel.kt`
- Modify: `AndroidManifest.xml`, `res/values/zq_strings.xml`
- Test: `src/test/java/expo/modules/zapbarquick/TileModelTest.kt`

**Interfaces:**
- Consumes: `QuickActions`, `QuickAction`, `QuickStore`, `QuickHooks`.
- Produces: `object TileModel { state(cfg: QuickConfig?, s: QuickState): TileLook }` with `data class TileLook(active: Boolean?, label: String, subtitle: String)`, where `active == null` means unavailable.

- [ ] **Step 1: Write the failing test**

`src/test/java/expo/modules/zapbarquick/TileModelTest.kt`:
```kotlin
package expo.modules.zapbarquick

import expo.modules.zapbarquick.tile.TileModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TileModelTest {
  private val cfg = QuickConfig("K", "K", "10.0.0.82", "Loving room", emptyList(), true, true)
  @Test fun `lit while muted, with the room as subtitle`() {
    val look = TileModel.state(cfg, QuickState(mute = true))
    assertEquals(true, look.active); assertEquals("Mute", look.label); assertEquals("Loving room", look.subtitle)
  }
  @Test fun `off while unmuted`() = assertEquals(false, TileModel.state(cfg, QuickState(mute = false)).active)
  @Test fun `unavailable without config`() = assertNull(TileModel.state(null, QuickState()).active)
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `./gradlew :zapbar-quick:testDebugUnitTest`. Expected: FAIL, with `TileModel` unresolved.

- [ ] **Step 3: Implement**

`tile/TileModel.kt`:
```kotlin
package expo.modules.zapbarquick.tile

import expo.modules.zapbarquick.QuickConfig
import expo.modules.zapbarquick.QuickState

data class TileLook(val active: Boolean?, val label: String, val subtitle: String)

object TileModel {
  fun state(cfg: QuickConfig?, s: QuickState): TileLook =
    if (cfg == null) TileLook(null, "Mute", "Open Zapbar to set up") else TileLook(s.mute, "Mute", cfg.name)
}
```

`tile/MuteTileService.kt`:
```kotlin
package expo.modules.zapbarquick.tile

import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import expo.modules.zapbarquick.QuickAction
import expo.modules.zapbarquick.QuickActions
import expo.modules.zapbarquick.QuickHooks
import expo.modules.zapbarquick.QuickState
import expo.modules.zapbarquick.QuickStore
import java.util.concurrent.Executors

/** Spec §8: one-tap mute toggle; lit while muted. */
class MuteTileService : TileService() {
  private val worker = Executors.newSingleThreadExecutor()

  override fun onStartListening() {
    show(QuickStore(this).state())
    worker.execute { val s = QuickActions.forContext(applicationContext).run(QuickAction.Refresh); show(s) }
  }

  override fun onClick() {
    val store = QuickStore(this)
    show(store.state().let { it.copy(mute = !it.mute) })
    worker.execute {
      val s = QuickActions.forContext(applicationContext).run(QuickAction.ToggleMute)
      show(s)
      QuickHooks.refresh(applicationContext)
    }
  }

  private fun show(s: QuickState) {
    val tile = qsTile ?: return
    val look = TileModel.state(QuickStore(this).config(), s)
    tile.state = when (look.active) { null -> Tile.STATE_UNAVAILABLE; true -> Tile.STATE_ACTIVE; false -> Tile.STATE_INACTIVE }
    tile.label = look.label
    if (Build.VERSION.SDK_INT >= 29) tile.subtitle = look.subtitle
    tile.updateTile()
  }

  override fun onDestroy() { worker.shutdown(); super.onDestroy() }
}
```

Add `<string name="zq_tile_mute">Mute</string>` to `zq_strings.xml`. Then add the service to the module manifest's `<application>`:
```xml
<service android:name="expo.modules.zapbarquick.tile.MuteTileService" android:exported="true" android:label="@string/zq_tile_mute"
  android:icon="@drawable/zq_ic_volume_off" android:permission="android.permission.BIND_QUICK_SETTINGS_TILE">
  <intent-filter><action android:name="android.service.quicksettings.action.QS_TILE" /></intent-filter>
  <meta-data android:name="android.service.quicksettings.TOGGLEABLE_TILE" android:value="true" />
</service>
```

- [ ] **Step 4: Run tests, then check on the emulator**

Run the Kotlin tests (expected `exit 0`) and the JS suite (PASS). Build and install, then pull down Quick Settings → edit → add "Mute". Expected: the tile shows "Mute · Loving room". **A tap toggles the real bar's mute; tap again to restore.** Screenshot it to `docs/quick-check/tile.png`.

- [ ] **Step 5: Commit**

```bash
cd ~/projects/zapbar && git add -A && git commit -m "feat(quick): mute Quick Settings tile

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F"
```

---

### Task 11: On-device verification with the owner (S24+)

**Files:**
- Create: `docs/quick-check.md` (results), `docs/quick-check/*.png` (emulator screenshots from Tasks 7–10)
- Modify: `apps/remote/app.json` (version `0.3.0`)

**Interfaces:**
- Consumes: the whole feature.
- Produces: the APK `E:\projects\zapbar\APK\zapbar-0.3.0-arm64.apk` and the filled checklist.

- [ ] **Step 1: Full suites and the phone build**

Run: `cd ~/projects/zapbar && pnpm test && pnpm typecheck && cd apps/remote/android && ./gradlew :zapbar-quick:testDebugUnitTest`
Expected: all PASS.

Bump `app.json` `version` to `0.3.0`, then run a clean prebuild and build the arm64 APK with the phone flags from Global Constraints. Verify it with `apksigner verify`, copy it to `E:\projects\zapbar\APK\zapbar-0.3.0-arm64.apk`, and remove `zapbar-0.2.0-arm64.apk` with a plain `rm`.

- [ ] **Step 2: Run the checklist with the owner**

Write `docs/quick-check.md` with one line per item (PASS/FAIL plus what was seen):
1. Install 0.3.0 over 0.2.0. Labels are kept, and Android asks for notification permission once.
2. Add both widgets. They show the room, current input, volume pill, and the 4 inputs on the 4×2.
3. **Swipe Zapbar away from recents.** Then tap a widget input tile: the bar switches in about 1 s. Tap a pill segment: the volume jumps there. Tap mute: the bar mutes and the icon turns to muted.
4. Tap the widget's number. The floating slider opens over the home screen, dragging changes the volume smoothly, and tapping outside closes it.
5. With the TV on and the app open, go Home and lock the phone. The volume keys change the bar's volume, if Task 1 said WORK.
6. The notification shows input and volume, and its pill and inputs work. A TV-remote volume change shows up in it within a few seconds.
7. The Quick Settings "Mute" tile toggles mute and lights up while muted.
8. Wi-Fi off on the phone: the notification disappears. TV off for 5 minutes: the notification disappears.
9. Settings → Soundbars → pencil → rename to something new, then ✓. The new name shows in Zapbar, on the widget and in the notification, and in the HEOS app if Task 2 found the bar supports it. Rename it back.
10. Settings switches: "Show notification" off hides it, and "Volume keys" off stops the keys controlling the bar.

Every FAIL becomes a fix: a failing test first when the cause is code (Kotlin or TypeScript), otherwise a rebuild and recheck.

- [ ] **Step 3: Commit and push**

```bash
cd ~/projects/zapbar && git add docs/quick-check.md docs/quick-check apps/remote/app.json && git commit -m "docs: quick access on-device checklist (S24+)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018r1QZJGpMEDSAZVp8Tom9F" && git push -u origin feat/quick
```
