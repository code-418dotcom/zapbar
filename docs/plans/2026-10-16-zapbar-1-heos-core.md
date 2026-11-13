# Zapbar Plan 1: heos-core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@zapbar/heos-core`, a pure-TypeScript library. It discovers, connects to, controls and mirrors the state of HEOS soundbars and speakers. It's proven against a fake device in Vitest and against the real DHT-S716H.

**Architecture:**
- The HEOS CLI (TCP 1255, line JSON) carries players, volume, mute, transport, inputs, Quick Selects and change events.
- UPnP SOAP (HTTP 60006, ACT + RenderingControl services) carries EQ, sound mode, dialogue and night mode.
- A capability probe turns what the device answers into a `Capabilities` object.
- `HeosDevice` owns one device's connection state machine and writes into a zustand vanilla store keyed by serial, with zones from day one.
- I/O is injected (`SocketFactory`, `HttpFn`), so the core has no React Native or Node dependencies. Node implementations live under `src/node` for tests and scripts.

**Tech Stack:** TypeScript 5, pnpm workspaces, Vitest 3, fast-xml-parser, zustand (vanilla), tsx for scripts, Node 22.

**Spec:** `docs/superpowers/specs/2026-10-16-zapbar-design.md` (copied into the zapbar repo in Task 1).

**Plan series:**
1. This plan: heos-core.
2. App shell and UI (Expo, discovery native module, main screen, EQ sheet, first run, settings, input labels).
3. Quick access (widget, media session for volume keys and notification, Quick Settings tile).
4. Release (tip jar, privacy tripwire, privacy page on zapbar.app, store listing, launch collateral).

Plans 2–4 are written after this plan's write-probe (Task 5) lands, because its results set the UI's ranges.

## Global Constraints

- The brand is **Zapbar**. "HEOS" and "Denon" never appear in a product or brand name, only in compatibility wording ("Remote for HEOS").
- `packages/heos-core/src/**` must not import Node, React or React Native modules. Only `src/node/**` may use `node:*`. A test enforces this.
- No network traffic leaves the LAN. heos-core talks only to device IPs it was given or discovered.
- Device memory is keyed by **serial** (`deviceKey()`: serial, or `pid:<pid>` when a player reports no serial).
- Command timeout is **3000 ms**. A timeout drops the connection, because HEOS replies carry no request ID, so a late reply could otherwise resolve the wrong command.
- Reconnect backoff is **1000/2000/5000/10000 ms**, capped at the last value. The heartbeat (`system/heart_beat`) runs every **30000 ms**. UPnP polling runs every **10000 ms** while the app is visible.
- Ranges: volume 0–100, bass 0–10 (5 = neutral), treble 0–10 (5 = neutral), subwoofer 0–30.
- Optimistic UI: a command patches the store immediately and rolls back on failure. Device events win.
- Offline: commands are never queued. They return `false` without sending.
- **Never call `system/check_account`**. It returns the HEOS account e-mail. Fixtures and logs must never contain a real serial or account e-mail; use `TESTSERIAL0001`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **An event arrives between a command and its reply.** It must reach `onEvent` and must not resolve the command. Covered by the Task 2 test "delivers an event that arrives before the reply".
2. **The connection drops mid-command.** Pending and queued commands must reject at once with `DisconnectedError`, not after the 3 s timeout. Covered by the Task 2 test "rejects in-flight and queued commands immediately".
3. **A rapid volume-slider drag (20+ calls).** The sends must coalesce, and the final device and store volume must equal the last value requested. Covered by the Task 9 test "coalesces a rapid volume drag".
4. **The device answers `result: fail`** (for example an unavailable input). The optimistic change must roll back and the error must carry the device's text. Covered by the Task 9 test "rolls back and reports the device's error".
5. **Mixed-content and unknown XML from firmware** (`<dialogueEnhance>2<level>2</level><enabled>1</enabled></dialogueEnhance>`, unknown tags, empty config). Parsing must yield the level and never throw. Covered by the Task 4 tests "parses mixed-content dialogue and night" and "tolerates empty and unknown config".

---

### Task 1: Scaffold the repo and the message codec

**Files:**
- Create (via `new.sh`): `~/projects/zapbar/` with Claudify, a Gitea origin and `.gitignore`.
- Create: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.gitea/workflows/ci.yml`
- Create: `docs/specs/2026-10-16-zapbar-design.md` (copy), `docs/plans/2026-10-16-zapbar-1-heos-core.md` (copy)
- Create: `packages/heos-core/package.json`, `packages/heos-core/tsconfig.json`
- Create: `packages/heos-core/src/util.ts`, `packages/heos-core/src/cli/message.ts`
- Test: `packages/heos-core/test/message.test.ts`

**Interfaces:**
- Produces:
  - `parseMessage(message: string): Record<string, string>`
  - `encodeValue(v: string): string`
  - `decodeValue(v: string): string`
  - `buildCommand(command: string, params?: Record<string, string | number | boolean>): string`
  - `clamp(n: number, lo: number, hi: number): number`
  - `sleep(ms: number): Promise<void>`

- [ ] **Step 1: Scaffold with the sanctioned tool**

```bash
~/projects/new.sh --name zapbar --desc "Zapbar: remote-first controller for HEOS soundbars (Expo/React Native)" \
  --type 5 --stack 6 --no-web --no-always-on --no-publish --no-ci --yes
cd ~/projects/zapbar && git remote -v
```
Expected: `origin https://github.com/code-418dotcom/zapbar` (or the SSH form on `<host-ip>:2222`).

- [ ] **Step 2: Create the workspace files**

`package.json`:
```json
{
  "name": "zapbar",
  "private": true,
  "packageManager": "pnpm@10.33.0",
  "scripts": {
    "test": "pnpm -r --if-present test",
    "typecheck": "pnpm -r --if-present typecheck"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
  - apps/*
```

`.npmrc` (Expo needs a hoisted layout in Plan 2):
```
node-linker=hoisted
```

`.gitea/workflows/ci.yml`: copy `~/projects/claudify/.claude/templates/ci/node.yml` verbatim:
```bash
mkdir -p .gitea/workflows && cp ~/projects/claudify/.claude/templates/ci/node.yml .gitea/workflows/ci.yml
mkdir -p docs/specs docs/plans
cp ~/projects/claudify/docs/superpowers/specs/2026-10-16-zapbar-design.md docs/specs/
cp ~/projects/claudify/docs/superpowers/plans/2026-10-16-zapbar-1-heos-core.md docs/plans/
```

`packages/heos-core/package.json`:
```json
{
  "name": "@zapbar/heos-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts", "./node": "./src/node/index.ts" },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" }
}
```

`packages/heos-core/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test", "scripts"]
}
```

```bash
pnpm --filter @zapbar/heos-core add fast-xml-parser zustand
pnpm --filter @zapbar/heos-core add -D typescript vitest @types/node tsx
```

- [ ] **Step 3: Write the failing test**

`packages/heos-core/test/message.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildCommand, decodeValue, encodeValue, parseMessage } from '../src/cli/message';

describe('parseMessage', () => {
  it('parses key=value pairs', () => {
    expect(parseMessage('pid=7331878&level=49&mute=off')).toEqual({ pid: '7331878', level: '49', mute: 'off' });
  });
  it('decodes HEOS escapes in values', () => {
    expect(parseMessage('pid=1&song=Rock %26 Roll %3D 100%25')).toEqual({ pid: '1', song: 'Rock & Roll = 100%' });
  });
  it('keeps bare flags as empty-string keys', () => {
    expect(parseMessage('command under process&pid=1')).toEqual({ 'command under process': '', pid: '1' });
  });
  it('returns an empty object for an empty message', () => {
    expect(parseMessage('')).toEqual({});
  });
});

describe('encodeValue/decodeValue', () => {
  it('round-trips the three reserved characters', () => {
    const raw = 'a&b=c%d';
    expect(encodeValue(raw)).toBe('a%26b%3Dc%25d');
    expect(decodeValue(encodeValue(raw))).toBe(raw);
  });
});

describe('buildCommand', () => {
  it('builds a command with encoded params and CRLF', () => {
    expect(buildCommand('player/set_volume', { pid: 1, level: 20 })).toBe('heos://player/set_volume?pid=1&level=20\r\n');
  });
  it('omits the query when there are no params', () => {
    expect(buildCommand('system/heart_beat')).toBe('heos://system/heart_beat\r\n');
  });
  it('leaves slashes in values alone', () => {
    expect(buildCommand('browse/play_input', { pid: 1, input: 'inputs/hdmi_in_1' })).toBe('heos://browse/play_input?pid=1&input=inputs/hdmi_in_1\r\n');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd ~/projects/zapbar && pnpm --filter @zapbar/heos-core test`
Expected: FAIL with "Failed to resolve import ../src/cli/message".

- [ ] **Step 5: Write the implementation**

`packages/heos-core/src/util.ts`:
```ts
export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
```

`packages/heos-core/src/cli/message.ts`:
```ts
// HEOS CLI messages are key=value pairs joined by '&'. Values escape exactly
// three characters: & → %26, = → %3D, % → %25.
const DECODE: Record<string, string> = { '%26': '&', '%3D': '=', '%25': '%' };

export function decodeValue(v: string): string {
  return v.replace(/%26|%3D|%25/gi, (m) => DECODE[m.toUpperCase()] ?? m);
}

export function encodeValue(v: string): string {
  return v.replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
}

export function parseMessage(message: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!message) return out;
  for (const part of message.split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    if (i === -1) out[decodeValue(part)] = '';
    else out[decodeValue(part.slice(0, i))] = decodeValue(part.slice(i + 1));
  }
  return out;
}

export function buildCommand(command: string, params: Record<string, string | number | boolean> = {}): string {
  const q = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeValue(String(v))}`)
    .join('&');
  return `heos://${command}${q ? `?${q}` : ''}\r\n`;
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: 8 tests PASS and the typecheck exits 0.

- [ ] **Step 7: Commit and push**

```bash
git add -A
git commit -m "feat(heos-core): workspace scaffold and HEOS message codec

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -u origin main
```

---

### Task 2: Transport interfaces, Node transport, CLI client

**Files:**
- Create: `packages/heos-core/src/transport.ts`
- Create: `packages/heos-core/src/node/transport.ts`, `packages/heos-core/src/node/index.ts`
- Create: `packages/heos-core/src/cli/client.ts`
- Test: `packages/heos-core/test/memory-socket.ts`, `packages/heos-core/test/client.test.ts`, `packages/heos-core/test/node-transport.test.ts`, `packages/heos-core/test/purity.test.ts`

**Interfaces:**
- Consumes: `buildCommand`, `parseMessage` (Task 1).
- Produces:
  - `interface LineSocket { write(line: string): void; onLine(cb: (line: string) => void): void; onClose(cb: (err?: Error) => void): void; close(): void }`
  - `type SocketFactory = (host: string, port: number) => Promise<LineSocket>`
  - `interface HttpRequest { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; timeoutMs: number }`
  - `type HttpFn = (url: string, req: HttpRequest) => Promise<{ status: number; text: string }>`
  - `nodeSocketFactory: SocketFactory`, `nodeHttp: HttpFn` (from `src/node`)
  - `CLI_PORT = 1255`
  - `interface CliResponse { command: string; result: 'success' | 'fail'; message: Record<string, string>; payload?: unknown; options?: unknown }`
  - `interface CliEvent { event: string; message: Record<string, string> }` (`event` has no `event/` prefix)
  - `class CliError extends Error { command; eid; text }`, `class TimeoutError extends Error { command }`, `class DisconnectedError extends Error`
  - `class HeosCliClient`:
    - `static connect(factory, host, opts?: { port?: number; timeoutMs?: number }): Promise<HeosCliClient>`
    - `send(command, params?): Promise<CliResponse>`
    - `onEvent(cb): () => void`, `onClose(cb): () => void`, `close(): void`, `get isClosed(): boolean`

- [ ] **Step 1: Write the in-memory socket helper and the failing tests**

`packages/heos-core/test/memory-socket.ts`:
```ts
import type { LineSocket, SocketFactory } from '../src/transport';

export function memorySocket() {
  const lineCbs: Array<(l: string) => void> = [];
  const closeCbs: Array<(e?: Error) => void> = [];
  const written: string[] = [];
  const sock: LineSocket = {
    write: (l) => { written.push(l); },
    onLine: (cb) => { lineCbs.push(cb); },
    onClose: (cb) => { closeCbs.push(cb); },
    close: () => closeCbs.forEach((cb) => cb()),
  };
  return {
    sock,
    written,
    factory: (async () => sock) as SocketFactory,
    push: (obj: unknown) => lineCbs.forEach((cb) => cb(typeof obj === 'string' ? obj : JSON.stringify(obj))),
    drop: (e?: Error) => closeCbs.forEach((cb) => cb(e)),
  };
}

export const reply = (command: string, message = '', result = 'success', payload?: unknown) =>
  ({ heos: { command, result, message }, ...(payload !== undefined ? { payload } : {}) });
```

`packages/heos-core/test/client.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CliError, DisconnectedError, HeosCliClient, TimeoutError, type CliEvent } from '../src/cli/client';
import { memorySocket, reply } from './memory-socket';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('HeosCliClient', () => {
  it('resolves the reply matching the in-flight command', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x');
    const p = c.send('player/get_volume', { pid: 1 });
    expect(m.written).toEqual(['heos://player/get_volume?pid=1\r\n']);
    m.push(reply('player/get_volume', 'pid=1&level=49'));
    await expect(p).resolves.toMatchObject({ result: 'success', message: { pid: '1', level: '49' } });
  });

  it('sends one command at a time', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x');
    const a = c.send('player/get_volume', { pid: 1 });
    const b = c.send('player/get_mute', { pid: 1 });
    expect(m.written).toHaveLength(1);
    m.push(reply('player/get_volume', 'pid=1&level=5'));
    await a;
    expect(m.written).toHaveLength(2);
    m.push(reply('player/get_mute', 'pid=1&state=off'));
    await expect(b).resolves.toMatchObject({ message: { state: 'off' } });
  });

  it('ignores "command under process" and waits for the final reply', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x');
    let done = false;
    const p = c.send('browse/play_input', { pid: 1, input: 'inputs/hdmi_in_1' }).then((r) => { done = true; return r; });
    m.push(reply('browse/play_input', 'command under process&pid=1'));
    await flush();
    expect(done).toBe(false);
    m.push(reply('browse/play_input', 'pid=1&input=inputs/hdmi_in_1'));
    await expect(p).resolves.toMatchObject({ message: { input: 'inputs/hdmi_in_1' } });
  });

  it('delivers an event that arrives before the reply and still resolves the reply', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x');
    const events: CliEvent[] = [];
    c.onEvent((e) => events.push(e));
    let done = false;
    const p = c.send('player/set_volume', { pid: 1, level: 20 }).then(() => { done = true; });
    m.push({ heos: { command: 'event/player_volume_changed', message: 'pid=1&level=20&mute=off' } });
    await flush();
    expect(done).toBe(false);
    expect(events).toEqual([{ event: 'player_volume_changed', message: { pid: '1', level: '20', mute: 'off' } }]);
    m.push(reply('player/set_volume', 'pid=1&level=20'));
    await p;
    expect(done).toBe(true);
  });

  it('rejects with CliError carrying the device text on result fail', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x');
    const p = c.send('browse/play_input', { pid: 1, input: 'inputs/nope' });
    m.push(reply('browse/play_input', 'eid=2&text=Invalid input', 'fail'));
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(CliError);
    expect(err).toMatchObject({ eid: '2', text: 'Invalid input' });
  });

  it('rejects in-flight and queued commands immediately when the socket drops', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x', { timeoutMs: 3000 });
    const a = c.send('player/get_volume', { pid: 1 });
    const b = c.send('player/get_mute', { pid: 1 });
    const t0 = Date.now();
    m.drop(new Error('ECONNRESET'));
    await expect(a).rejects.toBeInstanceOf(DisconnectedError);
    await expect(b).rejects.toBeInstanceOf(DisconnectedError);
    expect(Date.now() - t0).toBeLessThan(100);
    expect(c.isClosed).toBe(true);
    await expect(c.send('system/heart_beat')).rejects.toBeInstanceOf(DisconnectedError);
  });

  it('times out, rejects, and closes the connection', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x', { timeoutMs: 50 });
    const closed = new Promise<void>((r) => c.onClose(() => r()));
    const a = c.send('player/get_volume', { pid: 1 });
    const b = c.send('player/get_mute', { pid: 1 });
    await expect(a).rejects.toBeInstanceOf(TimeoutError);
    await expect(b).rejects.toBeInstanceOf(DisconnectedError);
    await closed;
    expect(c.isClosed).toBe(true);
  });

  it('ignores lines that are not HEOS JSON', async () => {
    const m = memorySocket();
    const c = await HeosCliClient.connect(m.factory, 'x');
    const p = c.send('system/heart_beat');
    m.push('garbage');
    m.push({ nope: true });
    m.push(reply('system/heart_beat'));
    await expect(p).resolves.toMatchObject({ result: 'success' });
  });
});
```

`packages/heos-core/test/node-transport.test.ts`:
```ts
import net from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { nodeSocketFactory } from '../src/node';

let server: net.Server | undefined;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

it('splits CRLF lines across chunk boundaries', async () => {
  server = net.createServer((s) => {
    s.write('{"a":1}\r\n{"b"');
    setTimeout(() => { s.write(':2}\r\n'); s.end(); }, 20);
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as net.AddressInfo).port;
  const sock = await nodeSocketFactory('127.0.0.1', port);
  const lines: string[] = [];
  sock.onLine((l) => lines.push(l));
  await new Promise<void>((r) => sock.onClose(() => r()));
  expect(lines).toEqual(['{"a":1}', '{"b":2}']);
});

it('rejects when nothing listens', async () => {
  await expect(nodeSocketFactory('127.0.0.1', 1)).rejects.toThrow();
});
```

`packages/heos-core/test/purity.test.ts`:
```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

it('core sources import no Node, React or React Native modules', () => {
  const offenders = files(SRC)
    .filter((f) => !relative(SRC, f).startsWith('node'))
    .filter((f) => /from ['"](node:|net['"]|dgram['"]|http['"]|fs['"]|react)|require\(/.test(readFileSync(f, 'utf8')))
    .map((f) => relative(SRC, f));
  expect(offenders).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zapbar/heos-core test`
Expected: FAIL with unresolved imports `../src/cli/client` and `../src/node`.

- [ ] **Step 3: Write the transport interfaces and Node implementation**

`packages/heos-core/src/transport.ts`:
```ts
// I/O is injected so heos-core runs unchanged on Node (tests, scripts) and React Native.
export interface LineSocket {
  write(line: string): void;
  onLine(cb: (line: string) => void): void;
  onClose(cb: (err?: Error) => void): void;
  close(): void;
}

export type SocketFactory = (host: string, port: number) => Promise<LineSocket>;

export interface HttpRequest {
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

export type HttpFn = (url: string, req: HttpRequest) => Promise<{ status: number; text: string }>;
```

`packages/heos-core/src/node/transport.ts`:
```ts
import net from 'node:net';
import type { HttpFn, LineSocket, SocketFactory } from '../transport';

export const nodeSocketFactory: SocketFactory = (host, port) =>
  new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    sock.setEncoding('utf8');
    sock.setTimeout(3000, () => sock.destroy(new Error('connect timeout')));
    const lineCbs: Array<(l: string) => void> = [];
    const closeCbs: Array<(e?: Error) => void> = [];
    let buf = '';
    let closed = false;
    let lastError: Error | undefined;
    const fireClose = () => {
      if (closed) return;
      closed = true;
      closeCbs.forEach((cb) => cb(lastError));
    };
    const api: LineSocket = {
      write: (line) => { if (!closed) sock.write(line); },
      onLine: (cb) => { lineCbs.push(cb); },
      onClose: (cb) => { closeCbs.push(cb); },
      close: () => { sock.destroy(); fireClose(); },
    };
    sock.once('connect', () => { sock.setTimeout(0); resolve(api); });
    sock.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line.trim()) lineCbs.forEach((cb) => cb(line));
      }
    });
    sock.on('error', (e) => {
      lastError = e;
      if (sock.connecting) reject(e);
    });
    sock.on('close', fireClose);
  });

export const nodeHttp: HttpFn = async (url, req) => {
  const res = await fetch(url, { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(req.timeoutMs) });
  return { status: res.status, text: await res.text() };
};
```

`packages/heos-core/src/node/index.ts`:
```ts
export { nodeHttp, nodeSocketFactory } from './transport';
```

- [ ] **Step 4: Write the CLI client**

`packages/heos-core/src/cli/client.ts`:
```ts
import type { LineSocket, SocketFactory } from '../transport';
import { buildCommand, parseMessage } from './message';

export const CLI_PORT = 1255;

export interface CliResponse {
  command: string;
  result: 'success' | 'fail';
  message: Record<string, string>;
  payload?: unknown;
  options?: unknown;
}

export interface CliEvent {
  event: string;
  message: Record<string, string>;
}

export class CliError extends Error {
  constructor(readonly command: string, readonly eid: string, readonly text: string) {
    super(`${command} failed: ${text || `eid ${eid}`}`);
    this.name = 'CliError';
  }
}

export class TimeoutError extends Error {
  constructor(readonly command: string) {
    super(`${command} timed out`);
    this.name = 'TimeoutError';
  }
}

export class DisconnectedError extends Error {
  constructor(message = 'Not connected') {
    super(message);
    this.name = 'DisconnectedError';
  }
}

interface Pending {
  command: string;
  line: string;
  resolve: (r: CliResponse) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

// One command in flight at a time: HEOS replies carry only the command name,
// so serialising is the only way to match a reply to its request.
export class HeosCliClient {
  private queue: Pending[] = [];
  private inflight: Pending | null = null;
  private eventCbs = new Set<(e: CliEvent) => void>();
  private closeCbs = new Set<(e?: Error) => void>();
  private closed = false;

  private constructor(private readonly sock: LineSocket, private readonly timeoutMs: number) {
    sock.onLine((l) => this.handleLine(l));
    sock.onClose((e) => this.handleClose(e));
  }

  static async connect(factory: SocketFactory, host: string, opts: { port?: number; timeoutMs?: number } = {}): Promise<HeosCliClient> {
    const sock = await factory(host, opts.port ?? CLI_PORT);
    return new HeosCliClient(sock, opts.timeoutMs ?? 3000);
  }

  get isClosed(): boolean {
    return this.closed;
  }

  send(command: string, params?: Record<string, string | number | boolean>): Promise<CliResponse> {
    if (this.closed) return Promise.reject(new DisconnectedError());
    return new Promise((resolve, reject) => {
      this.queue.push({ command, line: buildCommand(command, params), resolve, reject });
      this.pump();
    });
  }

  onEvent(cb: (e: CliEvent) => void): () => void {
    this.eventCbs.add(cb);
    return () => this.eventCbs.delete(cb);
  }

  onClose(cb: (e?: Error) => void): () => void {
    this.closeCbs.add(cb);
    return () => this.closeCbs.delete(cb);
  }

  close(): void {
    this.sock.close();
    this.handleClose();
  }

  private pump(): void {
    if (this.inflight || this.closed) return;
    const next = this.queue.shift();
    if (!next) return;
    this.inflight = next;
    this.armTimer(next);
    this.sock.write(next.line);
  }

  private armTimer(p: Pending): void {
    if (p.timer) clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      if (this.inflight !== p) return;
      this.inflight = null;
      p.reject(new TimeoutError(p.command));
      // A late reply would resolve the next command with the same name; drop the connection instead.
      this.close();
    }, this.timeoutMs);
  }

  private handleLine(line: string): void {
    let msg: { heos?: { command?: unknown; result?: unknown; message?: unknown }; payload?: unknown; options?: unknown };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const heos = msg?.heos;
    if (!heos || typeof heos.command !== 'string') return;
    const message = parseMessage(String(heos.message ?? ''));
    if (heos.command.startsWith('event/')) {
      const ev: CliEvent = { event: heos.command.slice('event/'.length), message };
      this.eventCbs.forEach((cb) => cb(ev));
      return;
    }
    const p = this.inflight;
    if (!p || p.command !== heos.command) return;
    if ('command under process' in message) {
      this.armTimer(p);
      return;
    }
    clearTimeout(p.timer);
    this.inflight = null;
    if (heos.result === 'fail') p.reject(new CliError(p.command, message.eid ?? '', message.text ?? ''));
    else p.resolve({ command: heos.command, result: 'success', message, payload: msg.payload, options: msg.options });
    this.pump();
  }

  private handleClose(err?: Error): void {
    if (this.closed) return;
    this.closed = true;
    const e = new DisconnectedError(err ? `Connection lost: ${err.message}` : 'Connection closed');
    if (this.inflight) {
      clearTimeout(this.inflight.timer);
      this.inflight.reject(e);
      this.inflight = null;
    }
    for (const p of this.queue.splice(0)) p.reject(e);
    this.closeCbs.forEach((cb) => cb(err));
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @zapbar/heos-core test && pnpm typecheck`
Expected: all PASS (message 8, client 8, node-transport 2, purity 1).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(heos-core): injected transports and serialised CLI client

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Fake HEOS device and typed CLI commands

**Files:**
- Create: `packages/heos-core/test/fake/fake-heos.ts`, `packages/heos-core/test/helpers.ts`
- Create: `packages/heos-core/src/cli/commands.ts`
- Test: `packages/heos-core/test/commands.test.ts`

**Interfaces:**
- Consumes: `HeosCliClient`, `nodeSocketFactory`, `nodeHttp`, `parseMessage`, `encodeValue`, `clamp`.
- Produces:
  - `interface PlayerInfo { pid: number; name: string; model: string; version: string; ip: string; network: string; serial?: string }`
  - `interface InputSource { mid: string; name: string }` (`name` has the player-name prefix stripped, for example `"HDMI 1"`)
  - `interface NowPlayingRaw { type: string; song: string; artist: string; album: string; image_url: string; mid: string; sid: number; station?: string }`
  - `interface QuickSelect { id: number; name: string }`
  - `type PlayState = 'play' | 'pause' | 'stop'`
  - `interface CliCommands` (methods listed in the code below), `createCliCommands(c: HeosCliClient): CliCommands`
  - `deviceKey(p: { pid: number; serial?: string }): string`
  - Test-only: `class FakeHeos`, `waitFor(cond, timeoutMs?)`. The fake serves both the CLI and UPnP SOAP; Tasks 4–10 use it.

- [ ] **Step 1: Write the fake device** (test infrastructure, written complete once)

`packages/heos-core/test/helpers.ts`:
```ts
export async function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}
```

`packages/heos-core/test/fake/fake-heos.ts`:
```ts
import http from 'node:http';
import net from 'node:net';
import { encodeValue, parseMessage } from '../../src/cli/message';

export interface FakeState {
  pid: number;
  name: string;
  model: string;
  serial: string;
  volume: number;
  mute: boolean;
  playState: 'play' | 'pause' | 'stop';
  nowPlayingMid: string;
  bass: number;
  treble: number;
  subwoofer: number;
  preset: string;
  soundMode: string;
  bassBoost: number;
  dialogueLevel: number;
  nightLevel: number;
}

export const FAKE_INPUTS: Array<[string, string]> = [
  ['inputs/hdmi_arc_1', 'HDMI OUT'],
  ['inputs/hdmi_in_1', 'HDMI 1'],
  ['inputs/hdmi_in_2', 'HDMI 2'],
  ['inputs/hdmi_in_3', 'HDMI 3'],
  ['inputs/hdmi_in_4', 'HDMI 4'],
  ['inputs/optical_in_1', 'Optical In'],
  ['inputs/coax_in_1', 'Coaxial In'],
  ['inputs/aux_in_1', 'AUX In'],
];

const DEFAULTS: FakeState = {
  pid: 7331878, name: 'Loving room', model: 'Denon DHT-S716H', serial: 'TESTSERIAL0001',
  volume: 49, mute: false, playState: 'play', nowPlayingMid: 'inputs/hdmi_in_1',
  bass: 5, treble: 5, subwoofer: 15, preset: '', soundMode: 'MOVIE_NORMAL', bassBoost: 0,
  dialogueLevel: 2, nightLevel: 0,
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];
// Accepts <x>3</x>, <x><level>3</level></x> and <x>3<level>3</level>…</x>; the <level> child wins.
const levelTag = (xml: string, name: string): number | null => {
  const m = xml.match(new RegExp(`<${name}>(\\d*)(?:<level>(\\d+)</level>)?`));
  if (!m) return null;
  const v = m[2] ?? m[1];
  return v ? Number(v) : null;
};

export class FakeHeos {
  state: FakeState;
  received: string[] = [];
  silenced = new Set<string>();
  faultActions = new Set<string>();
  upnpDown = false;
  connections = 0;
  cliPort = 0;
  httpPort = 0;
  private failures = new Map<string, { eid: string; text: string }>();
  private clients = new Set<net.Socket>();
  private cli: net.Server;
  private web: http.Server;

  private constructor(over: Partial<FakeState>) {
    this.state = { ...DEFAULTS, ...over };
    this.cli = net.createServer((s) => this.onClient(s));
    this.web = http.createServer((req, res) => this.onSoap(req, res));
  }

  static async start(over: Partial<FakeState> = {}): Promise<FakeHeos> {
    const f = new FakeHeos(over);
    await new Promise<void>((r) => f.cli.listen(0, '127.0.0.1', () => r()));
    await new Promise<void>((r) => f.web.listen(0, '127.0.0.1', () => r()));
    f.cliPort = (f.cli.address() as net.AddressInfo).port;
    f.httpPort = (f.web.address() as net.AddressInfo).port;
    return f;
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.httpPort}`;
  }

  failNext(command: string, eid: string, text: string): void {
    this.failures.set(command, { eid, text });
  }

  count(command: string): number {
    return this.received.filter((l) => l.startsWith(`heos://${command}`)).length;
  }

  emit(event: string, msg: Record<string, string | number>): void {
    const message = Object.entries(msg).map(([k, v]) => `${k}=${encodeValue(String(v))}`).join('&');
    const line = JSON.stringify({ heos: { command: `event/${event}`, message } }) + '\r\n';
    this.clients.forEach((s) => s.write(line));
  }

  dropConnections(): void {
    this.clients.forEach((s) => s.destroy());
    this.clients.clear();
  }

  async stop(): Promise<void> {
    this.dropConnections();
    this.web.closeAllConnections();
    await new Promise<void>((r) => this.cli.close(() => r()));
    await new Promise<void>((r) => this.web.close(() => r()));
  }

  private onClient(sock: net.Socket): void {
    this.connections++;
    this.clients.add(sock);
    sock.setEncoding('utf8');
    let buf = '';
    sock.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        this.handleCli(sock, line);
      }
    });
    sock.on('close', () => this.clients.delete(sock));
    sock.on('error', () => this.clients.delete(sock));
  }

  private reply(sock: net.Socket, command: string, result: string, message: string, payload?: unknown): void {
    sock.write(JSON.stringify({ heos: { command, result, message }, ...(payload !== undefined ? { payload } : {}) }) + '\r\n');
  }

  private nowPlaying(): Record<string, unknown> {
    const s = this.state;
    const input = FAKE_INPUTS.find(([mid]) => mid === s.nowPlayingMid);
    if (input) {
      const name = `${s.name} - ${input[1]}`;
      return { type: 'station', song: name, station: name, album: '', artist: '', image_url: '', album_id: 'inputs/', mid: s.nowPlayingMid, qid: 1, sid: 1027 };
    }
    return { type: 'song', song: 'Fake Song', album: 'Fake Album', artist: 'Fake Artist', image_url: 'https://i.scdn.co/image/fake', mid: s.nowPlayingMid, qid: 1, sid: 4 };
  }

  private handleCli(sock: net.Socket, line: string): void {
    this.received.push(line);
    const m = line.match(/^heos:\/\/([^?]+)\??(.*)$/);
    if (!m) return;
    const command = m[1]!;
    const q = parseMessage(m[2] ?? '');
    if (this.silenced.has(command)) return;
    const failure = this.failures.get(command);
    if (failure) {
      this.failures.delete(command);
      return this.reply(sock, command, 'fail', `eid=${failure.eid}&text=${encodeValue(failure.text)}`);
    }
    const s = this.state;
    const pid = s.pid;
    const volumeEvent = () => this.emit('player_volume_changed', { pid, level: s.volume, mute: s.mute ? 'on' : 'off' });
    switch (command) {
      case 'system/heart_beat':
        return this.reply(sock, command, 'success', '');
      case 'system/register_for_change_events':
        return this.reply(sock, command, 'success', `enable=${q.enable ?? ''}`);
      case 'player/get_players':
        return this.reply(sock, command, 'success', '', [{ name: s.name, pid, model: s.model, version: '3.139.170', ip: '127.0.0.1', network: 'wired', lineout: 0, serial: s.serial }]);
      case 'player/get_volume':
        return this.reply(sock, command, 'success', `pid=${pid}&level=${s.volume}`);
      case 'player/set_volume':
        s.volume = Number(q.level);
        this.reply(sock, command, 'success', `pid=${pid}&level=${s.volume}`);
        return volumeEvent();
      case 'player/get_mute':
        return this.reply(sock, command, 'success', `pid=${pid}&state=${s.mute ? 'on' : 'off'}`);
      case 'player/set_mute':
        s.mute = q.state === 'on';
        this.reply(sock, command, 'success', `pid=${pid}&state=${q.state}`);
        return volumeEvent();
      case 'player/get_play_state':
        return this.reply(sock, command, 'success', `pid=${pid}&state=${s.playState}`);
      case 'player/set_play_state':
        s.playState = (q.state as FakeState['playState']) ?? 'stop';
        this.reply(sock, command, 'success', `pid=${pid}&state=${s.playState}`);
        return this.emit('player_state_changed', { pid, state: s.playState });
      case 'player/play_next':
      case 'player/play_previous':
        return this.reply(sock, command, 'success', `pid=${pid}`);
      case 'player/get_now_playing_media':
        return this.reply(sock, command, 'success', `pid=${pid}`, this.nowPlaying());
      case 'browse/browse':
        return this.reply(sock, command, 'success', `sid=${q.sid}&returned=8&count=8`,
          FAKE_INPUTS.map(([mid, label]) => ({ container: 'no', mid, type: 'station', playable: 'yes', name: `${s.name} - ${label}`, image_url: '' })));
      case 'browse/play_input':
        this.reply(sock, command, 'success', `command under process&pid=${pid}&input=${q.input}`);
        s.nowPlayingMid = q.input ?? '';
        this.reply(sock, command, 'success', `pid=${pid}&input=${q.input}`);
        return this.emit('player_now_playing_changed', { pid });
      case 'player/get_quickselects':
        return this.reply(sock, command, 'success', `pid=${pid}`, [
          { id: 1, name: 'Watch TV' }, { id: 2, name: 'Quick Select 2' }, { id: 3, name: 'Quick Select 3' },
          { id: 4, name: 'Quick Select 4' }, { id: 5, name: 'Quick Select 5' }, { id: 6, name: 'Quick Select 6' },
        ]);
      case 'player/play_quickselect':
        return this.reply(sock, command, 'success', `pid=${pid}&id=${q.id}`);
      default:
        return this.reply(sock, command, 'fail', 'eid=1&text=Unrecognized Command');
    }
  }

  private audioXml(): string {
    const s = this.state;
    return `<AudioConfig><highpass>0</highpass><lowpass>80</lowpass><subwooferEnable>0</subwooferEnable><outputMode>STEREO</outputMode><ampBridged>0</ampBridged><soundMode>${s.soundMode}</soundMode><impedance></impedance><ampPower>1</ampPower><availableSoundModes>MUSIC_NORMAL,MOVIE_NORMAL</availableSoundModes><sourceDirect>0</sourceDirect><bassBoost>${s.bassBoost}</bassBoost><speakerOption></speakerOption><toneControlOption></toneControlOption><tilt>0</tilt><phase>0</phase></AudioConfig>`;
  }

  private tvXml(): string {
    const { dialogueLevel: d, nightLevel: n } = this.state;
    return `<TvConfig><input>HDMI-ARC</input><hdmiConnection>ARC</hdmiConnection><dialogueEnhance>${d}<level>${d}</level><enabled>1</enabled></dialogueEnhance><nightMode>${n}<level>${n}</level><enabled>1</enabled></nightMode><audioDelay>0</audioDelay><syncMode>VIDEO</syncMode><irCodeHdmi1>1</irCodeHdmi1></TvConfig>`;
  }

  private onSoap(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => (body += c));
    req.on('end', () => {
      if (this.upnpDown) {
        res.writeHead(503);
        res.end('unavailable');
        return;
      }
      const action = String(req.headers['soapaction'] ?? '').replace(/"/g, '').split('#')[1] ?? '';
      const arg = (name: string) => unesc(body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? '');
      const ok = (inner: string) => {
        res.writeHead(200, { 'Content-Type': 'text/xml; charset="utf-8"' });
        res.end(`<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:${action}Response xmlns:u="urn:fake">${inner}</u:${action}Response></s:Body></s:Envelope>`);
      };
      const fault = (code: number, text: string) => {
        res.writeHead(500, { 'Content-Type': 'text/xml; charset="utf-8"' });
        res.end(`<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>${code}</errorCode><errorDescription>${text}</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>`);
      };
      if (this.faultActions.has(action)) return fault(401, 'Invalid Action');
      const s = this.state;
      switch (action) {
        case 'GetAudioConfig':
          return ok(`<AudioConfig>${esc(this.audioXml())}</AudioConfig>`);
        case 'SetAudioConfig': {
          const x = arg('AudioConfig');
          const mode = tag(x, 'soundMode');
          if (mode) s.soundMode = mode;
          const boost = tag(x, 'bassBoost');
          if (boost) s.bassBoost = Number(boost);
          return ok('');
        }
        case 'GetTvConfig':
          return ok(`<TvConfig>${esc(this.tvXml())}</TvConfig>`);
        case 'SetTvConfig': {
          const x = arg('TvConfig');
          const d = levelTag(x, 'dialogueEnhance');
          if (d !== null) s.dialogueLevel = d;
          const n = levelTag(x, 'nightMode');
          if (n !== null) s.nightLevel = n;
          return ok('');
        }
        case 'X_GetBass': return ok(`<CurrentBass>${s.bass}</CurrentBass>`);
        case 'X_SetBass': s.bass = Number(arg('DesiredBass')); return ok('');
        case 'X_GetTreble': return ok(`<CurrentTreble>${s.treble}</CurrentTreble>`);
        case 'X_SetTreble': s.treble = Number(arg('DesiredTreble')); return ok('');
        case 'X_GetSubwoofer': return ok(`<CurrentLevel>${s.subwoofer}</CurrentLevel>`);
        case 'X_SetSubwoofer': s.subwoofer = Number(arg('DesiredLevel')); return ok('');
        case 'ListPresets':
          return ok('<CurrentPresetNameList>FactoryDefaults,InstallationDefaults,Disabled,Accoustic,Classical,Jazz,Pop,Rock</CurrentPresetNameList>');
        case 'X_GetPreset': return ok(`<CurrentPreset>${s.preset}</CurrentPreset>`);
        case 'SelectPreset': s.preset = arg('PresetName'); return ok('');
        default:
          return fault(401, 'Invalid Action');
      }
    });
  }
}
```

- [ ] **Step 2: Write the failing test**

`packages/heos-core/test/commands.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HeosCliClient } from '../src/cli/client';
import { createCliCommands, deviceKey, type CliCommands } from '../src/cli/commands';
import { nodeSocketFactory } from '../src/node';
import { FakeHeos } from './fake/fake-heos';

let fake: FakeHeos;
let client: HeosCliClient;
let cmds: CliCommands;
const PID = 7331878;

beforeEach(async () => {
  fake = await FakeHeos.start();
  client = await HeosCliClient.connect(nodeSocketFactory, '127.0.0.1', { port: fake.cliPort });
  cmds = createCliCommands(client);
});
afterEach(async () => {
  client.close();
  await fake.stop();
});

describe('CLI commands against the fake device', () => {
  it('maps get_players including the serial', async () => {
    expect(await cmds.getPlayers()).toEqual([
      { pid: PID, name: 'Loving room', model: 'Denon DHT-S716H', version: '3.139.170', ip: '127.0.0.1', network: 'wired', serial: 'TESTSERIAL0001' },
    ]);
  });

  it('lists inputs with the player-name prefix stripped', async () => {
    const inputs = await cmds.getInputs(PID, 'Loving room');
    expect(inputs).toHaveLength(8);
    expect(inputs[1]).toEqual({ mid: 'inputs/hdmi_in_1', name: 'HDMI 1' });
  });

  it('reads and sets volume, clamping to 0-100', async () => {
    expect(await cmds.getVolume(PID)).toBe(49);
    await cmds.setVolume(PID, 150);
    expect(fake.state.volume).toBe(100);
  });

  it('reads and sets mute', async () => {
    await cmds.setMute(PID, true);
    expect(await cmds.getMute(PID)).toBe(true);
  });

  it('plays an input through the "command under process" reply', async () => {
    await cmds.playInput(PID, 'inputs/hdmi_in_3');
    expect(fake.state.nowPlayingMid).toBe('inputs/hdmi_in_3');
  });

  it('returns now-playing for inputs and streams', async () => {
    expect(await cmds.getNowPlaying(PID)).toMatchObject({ mid: 'inputs/hdmi_in_1', sid: 1027 });
    fake.state.nowPlayingMid = 'spotify:track:1';
    expect(await cmds.getNowPlaying(PID)).toMatchObject({ song: 'Fake Song', artist: 'Fake Artist', sid: 4 });
  });

  it('reads play state and quick selects', async () => {
    expect(await cmds.getPlayState(PID)).toBe('play');
    const qs = await cmds.getQuickSelects(PID);
    expect(qs[0]).toEqual({ id: 1, name: 'Watch TV' });
    await cmds.playQuickSelect(PID, 1);
    expect(fake.count('player/play_quickselect')).toBe(1);
  });

  it('deviceKey prefers the serial and falls back to the pid', () => {
    expect(deviceKey({ pid: 1, serial: 'ABC' })).toBe('ABC');
    expect(deviceKey({ pid: 1 })).toBe('pid:1');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @zapbar/heos-core test commands`
Expected: FAIL with an unresolved import `../src/cli/commands`.

- [ ] **Step 4: Write the implementation**

`packages/heos-core/src/cli/commands.ts`:
```ts
import { clamp } from '../util';
import type { HeosCliClient } from './client';

export interface PlayerInfo {
  pid: number;
  name: string;
  model: string;
  version: string;
  ip: string;
  network: string;
  serial?: string;
}

export interface InputSource {
  mid: string;
  name: string;
}

export interface NowPlayingRaw {
  type: string;
  song: string;
  artist: string;
  album: string;
  image_url: string;
  mid: string;
  sid: number;
  station?: string;
}

export interface QuickSelect {
  id: number;
  name: string;
}

export type PlayState = 'play' | 'pause' | 'stop';

export interface CliCommands {
  heartbeat(): Promise<void>;
  registerForChangeEvents(on: boolean): Promise<void>;
  getPlayers(): Promise<PlayerInfo[]>;
  getVolume(pid: number): Promise<number>;
  setVolume(pid: number, level: number): Promise<void>;
  getMute(pid: number): Promise<boolean>;
  setMute(pid: number, on: boolean): Promise<void>;
  getPlayState(pid: number): Promise<PlayState>;
  setPlayState(pid: number, state: PlayState): Promise<void>;
  playNext(pid: number): Promise<void>;
  playPrevious(pid: number): Promise<void>;
  getNowPlaying(pid: number): Promise<NowPlayingRaw | null>;
  getInputs(pid: number, playerName: string): Promise<InputSource[]>;
  playInput(pid: number, mid: string): Promise<void>;
  getQuickSelects(pid: number): Promise<QuickSelect[]>;
  playQuickSelect(pid: number, id: number): Promise<void>;
}

export const deviceKey = (p: { pid: number; serial?: string }): string => (p.serial ? p.serial : `pid:${p.pid}`);

type Obj = Record<string, unknown>;
const list = (payload: unknown): Obj[] => (Array.isArray(payload) ? (payload.filter((x) => x && typeof x === 'object') as Obj[]) : []);
const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

export function createCliCommands(c: HeosCliClient): CliCommands {
  const ok = async (cmd: string, params?: Record<string, string | number>) => {
    await c.send(cmd, params);
  };
  return {
    heartbeat: () => ok('system/heart_beat'),
    registerForChangeEvents: (on) => ok('system/register_for_change_events', { enable: on ? 'on' : 'off' }),
    async getPlayers() {
      const r = await c.send('player/get_players');
      return list(r.payload).map((p) => ({
        pid: Number(p.pid),
        name: str(p.name),
        model: str(p.model),
        version: str(p.version),
        ip: str(p.ip),
        network: str(p.network),
        ...(p.serial ? { serial: str(p.serial) } : {}),
      }));
    },
    async getVolume(pid) {
      const r = await c.send('player/get_volume', { pid });
      return Number(r.message.level ?? 0);
    },
    setVolume: (pid, level) => ok('player/set_volume', { pid, level: clamp(Math.round(level), 0, 100) }),
    async getMute(pid) {
      const r = await c.send('player/get_mute', { pid });
      return r.message.state === 'on';
    },
    setMute: (pid, on) => ok('player/set_mute', { pid, state: on ? 'on' : 'off' }),
    async getPlayState(pid) {
      const r = await c.send('player/get_play_state', { pid });
      const s = r.message.state;
      return s === 'play' || s === 'pause' ? s : 'stop';
    },
    setPlayState: (pid, state) => ok('player/set_play_state', { pid, state }),
    playNext: (pid) => ok('player/play_next', { pid }),
    playPrevious: (pid) => ok('player/play_previous', { pid }),
    async getNowPlaying(pid) {
      const r = await c.send('player/get_now_playing_media', { pid });
      const p = r.payload;
      if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
      const o = p as Obj;
      return {
        type: str(o.type),
        song: str(o.song),
        artist: str(o.artist),
        album: str(o.album),
        image_url: str(o.image_url),
        mid: str(o.mid),
        sid: Number(o.sid ?? 0),
        ...(o.station ? { station: str(o.station) } : {}),
      };
    },
    async getInputs(pid, playerName) {
      const r = await c.send('browse/browse', { sid: pid });
      const prefix = `${playerName} - `;
      return list(r.payload)
        .filter((i) => str(i.mid).startsWith('inputs/'))
        .map((i) => {
          const name = str(i.name) || str(i.mid);
          return { mid: str(i.mid), name: name.startsWith(prefix) ? name.slice(prefix.length) : name };
        });
    },
    playInput: (pid, mid) => ok('browse/play_input', { pid, input: mid }),
    async getQuickSelects(pid) {
      const r = await c.send('player/get_quickselects', { pid });
      return list(r.payload).map((q) => ({ id: Number(q.id), name: str(q.name) }));
    },
    playQuickSelect: (pid, id) => ok('player/play_quickselect', { pid, id }),
  };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @zapbar/heos-core test && pnpm typecheck`
Expected: all PASS, including 8 new command tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(heos-core): typed CLI commands and a fake HEOS device for tests

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: UPnP SOAP, XML parsing, ACT readers, RenderingControl

**Files:**
- Create: `packages/heos-core/src/upnp/xml.ts`, `packages/heos-core/src/upnp/soap.ts`, `packages/heos-core/src/upnp/act.ts`, `packages/heos-core/src/upnp/rendering.ts`
- Create: `packages/heos-core/test/fixtures/dht-s716h.ts`
- Test: `packages/heos-core/test/upnp.test.ts`

**Interfaces:**
- Consumes: `HttpFn`, `nodeHttp`, `clamp`, `FakeHeos`.
- Produces:
  - xml: `parseXml(xml): Record<string, unknown>`, `xmlEscape(s)`, `textOf(n: unknown): string`, `child(n: unknown, key: string): unknown`, `numOrNull(s: string): number | null`
  - soap: `UPNP_PORT = 60006`, `interface UpnpEndpoint { http: HttpFn; baseUrl: string; timeoutMs?: number }`, `interface UpnpService { path: string; type: string }`, `ACT`, `RENDERING`
  - soap: `class UpnpFault extends Error { action; code; description }` (the device rejected the action or argument), `class UpnpUnreachable extends Error { action }` (network error, timeout, or a non-SOAP reply)
  - soap: `soapCall(ep, svc, action, args?): Promise<Record<string, string>>`
  - act: `interface AudioConfig { soundMode: string | null; availableSoundModes: string[]; bassBoost: number | null; rawXml: string }`
  - act: `interface LevelSetting { level: number; supported: boolean }`
  - act: `interface TvConfig { dialogue: LevelSetting | null; night: LevelSetting | null; audioDelay: number | null; rawXml: string }`
  - act: `parseAudioConfig(xml)`, `parseTvConfig(xml)`, `getAudioConfig(ep)`, `getTvConfig(ep)`
  - rendering: `TONE_RANGE`, `getBass/setBass`, `getTreble/setTreble`, `getSubwoofer/setSubwoofer`, `listEqPresets(ep): Promise<string[]>`, `getEqPreset(ep): Promise<string | null>`, `selectEqPreset(ep, id)`, `presetLabel(id): string`

- [ ] **Step 1: Write fixtures recorded from the real device**

These were recorded 2026-10-16 from the DHT-S716H, firmware 3.139.170. TvConfig is trimmed of most `irCode*` fields. There is no serial or account data in them.

`packages/heos-core/test/fixtures/dht-s716h.ts`:
```ts
export const AUDIO_CONFIG_XML =
  '<AudioConfig><highpass>0</highpass><lowpass>80</lowpass><subwooferEnable>0</subwooferEnable><outputMode>STEREO</outputMode><ampBridged>0</ampBridged><soundMode>MOVIE_NORMAL</soundMode><impedance></impedance><ampPower>1</ampPower><availableSoundModes>MUSIC_NORMAL,MOVIE_NORMAL</availableSoundModes><sourceDirect>0</sourceDirect><bassBoost>0</bassBoost><speakerOption></speakerOption><toneControlOption></toneControlOption><tilt>0</tilt><phase>0</phase></AudioConfig>';

export const TV_CONFIG_XML =
  '<TvConfig><input>HDMI-ARC</input><connectedInputs>HDMI-ARC-CEC-AUDIO-ARC</connectedInputs><hdmiVolume>0</hdmiVolume><hdmiConnection>ARC</hdmiConnection><remoteVolume>0</remoteVolume><autoPlay>0</autoPlay><irFlasherFeedback>1</irFlasherFeedback><allowZoning>0</allowZoning><dialogueEnhance>2<level>2</level><enabled>1</enabled></dialogueEnhance><nightMode>0<level>0</level><enabled>1</enabled></nightMode><audioDelay>0</audioDelay><syncMode>VIDEO</syncMode><bilingualMode>MAIN_VOICE</bilingualMode><irCodeVolPlus>1</irCodeVolPlus><irCodeHdmi1>1</irCodeHdmi1></TvConfig>';
```

- [ ] **Step 2: Write the failing tests**

`packages/heos-core/test/upnp.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeHttp } from '../src/node';
import { getAudioConfig, getTvConfig, parseAudioConfig, parseTvConfig } from '../src/upnp/act';
import { getBass, getEqPreset, getSubwoofer, listEqPresets, presetLabel, selectEqPreset, setBass, setSubwoofer, setTreble, getTreble } from '../src/upnp/rendering';
import { ACT, soapCall, UpnpFault, UpnpUnreachable, type UpnpEndpoint } from '../src/upnp/soap';
import { FakeHeos } from './fake/fake-heos';
import { AUDIO_CONFIG_XML, TV_CONFIG_XML } from './fixtures/dht-s716h';

describe('ACT config parsing (real fixtures)', () => {
  it('parses the audio config', () => {
    expect(parseAudioConfig(AUDIO_CONFIG_XML)).toMatchObject({ soundMode: 'MOVIE_NORMAL', availableSoundModes: ['MUSIC_NORMAL', 'MOVIE_NORMAL'], bassBoost: 0 });
  });

  it('parses mixed-content dialogue and night', () => {
    expect(parseTvConfig(TV_CONFIG_XML)).toMatchObject({ dialogue: { level: 2, supported: true }, night: { level: 0, supported: true }, audioDelay: 0 });
  });

  it('accepts a config wrapped in its root twice', () => {
    expect(parseAudioConfig(`<AudioConfig>${AUDIO_CONFIG_XML}</AudioConfig>`).soundMode).toBe('MOVIE_NORMAL');
  });

  it('tolerates empty and unknown config', () => {
    expect(parseAudioConfig('')).toMatchObject({ soundMode: null, availableSoundModes: [], bassBoost: null });
    expect(parseTvConfig('<TvConfig><futureThing>7</futureThing><dialogueEnhance>3</dialogueEnhance></TvConfig>')).toMatchObject({
      dialogue: { level: 3, supported: true },
      night: null,
      audioDelay: null,
    });
  });
});

describe('UPnP against the fake device', () => {
  let fake: FakeHeos;
  let ep: UpnpEndpoint;
  beforeEach(async () => {
    fake = await FakeHeos.start();
    ep = { http: nodeHttp, baseUrl: fake.baseUrl, timeoutMs: 1000 };
  });
  afterEach(() => fake.stop());

  it('reads the embedded ACT configs', async () => {
    expect((await getAudioConfig(ep)).soundMode).toBe('MOVIE_NORMAL');
    expect((await getTvConfig(ep)).dialogue).toEqual({ level: 2, supported: true });
  });

  it('reads and sets tone controls, clamping to range', async () => {
    expect(await getBass(ep)).toBe(5);
    await setBass(ep, 7);
    expect(fake.state.bass).toBe(7);
    await setTreble(ep, -3);
    expect(await getTreble(ep)).toBe(0);
    await setSubwoofer(ep, 40);
    expect(await getSubwoofer(ep)).toBe(30);
  });

  it('lists only real EQ presets and selects one', async () => {
    expect(await listEqPresets(ep)).toEqual(['Accoustic', 'Classical', 'Jazz', 'Pop', 'Rock']);
    expect(await getEqPreset(ep)).toBeNull();
    await selectEqPreset(ep, 'Rock');
    expect(await getEqPreset(ep)).toBe('Rock');
    expect(presetLabel('Accoustic')).toBe('Acoustic');
  });

  it('raises UpnpFault for an action the device rejects', async () => {
    await expect(soapCall(ep, ACT, 'NoSuchAction')).rejects.toBeInstanceOf(UpnpFault);
  });

  it('raises UpnpUnreachable when the service is down', async () => {
    fake.upnpDown = true;
    await expect(getBass(ep)).rejects.toBeInstanceOf(UpnpUnreachable);
  });

  it('raises UpnpUnreachable when nothing listens', async () => {
    await expect(getBass({ http: nodeHttp, baseUrl: 'http://127.0.0.1:1', timeoutMs: 500 })).rejects.toBeInstanceOf(UpnpUnreachable);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @zapbar/heos-core test upnp`
Expected: FAIL with unresolved imports under `../src/upnp/`.

- [ ] **Step 4: Write the implementation**

`packages/heos-core/src/upnp/xml.ts`:
```ts
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  textNodeName: '#text',
});

export function parseXml(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Text of a node that is a plain value or mixed content such as {'#text': '2', level: '2'}. */
export function textOf(n: unknown): string {
  if (n === undefined || n === null) return '';
  if (typeof n === 'string' || typeof n === 'number' || typeof n === 'boolean') return String(n);
  if (typeof n === 'object' && '#text' in (n as Record<string, unknown>)) return String((n as Record<string, unknown>)['#text']);
  return '';
}

export function child(n: unknown, key: string): unknown {
  return n && typeof n === 'object' ? (n as Record<string, unknown>)[key] : undefined;
}

export function numOrNull(s: string): number | null {
  if (s.trim() === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
```

`packages/heos-core/src/upnp/soap.ts`:
```ts
import type { HttpFn } from '../transport';
import { child, parseXml, textOf, xmlEscape } from './xml';

export const UPNP_PORT = 60006;

export interface UpnpEndpoint {
  http: HttpFn;
  baseUrl: string;
  timeoutMs?: number;
}

export interface UpnpService {
  path: string;
  type: string;
}

export const ACT: UpnpService = { path: '/ACT/control', type: 'urn:schemas-denon-com:service:ACT:1' };
export const RENDERING: UpnpService = {
  path: '/upnp/control/renderer_dvc/RenderingControl',
  type: 'urn:schemas-upnp-org:service:RenderingControl:1',
};

/** The device answered with a SOAP fault: the action or argument is not supported. */
export class UpnpFault extends Error {
  constructor(readonly action: string, readonly code: string, readonly description: string) {
    super(`${action}: UPnP fault ${code} ${description}`.trim());
    this.name = 'UpnpFault';
  }
}

/** The device could not be reached or did not answer with SOAP. */
export class UpnpUnreachable extends Error {
  constructor(readonly action: string, cause: string) {
    super(`${action}: ${cause}`);
    this.name = 'UpnpUnreachable';
  }
}

export async function soapCall(
  ep: UpnpEndpoint,
  svc: UpnpService,
  action: string,
  args: Record<string, string | number> = {},
): Promise<Record<string, string>> {
  const argXml = Object.entries(args)
    .map(([k, v]) => `<${k}>${xmlEscape(String(v))}</${k}>`)
    .join('');
  const body =
    `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
    `<s:Body><u:${action} xmlns:u="${svc.type}">${argXml}</u:${action}></s:Body></s:Envelope>`;
  let res: { status: number; text: string };
  try {
    res = await ep.http(ep.baseUrl + svc.path, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: `"${svc.type}#${action}"` },
      body,
      timeoutMs: ep.timeoutMs ?? 3000,
    });
  } catch (e) {
    throw new UpnpUnreachable(action, (e as Error).message);
  }
  let doc: Record<string, unknown>;
  try {
    doc = parseXml(res.text);
  } catch {
    throw new UpnpUnreachable(action, `HTTP ${res.status}, unparseable body`);
  }
  const bodyNode = child(doc.Envelope, 'Body');
  if (!bodyNode || typeof bodyNode !== 'object') throw new UpnpUnreachable(action, `HTTP ${res.status}, no SOAP body`);
  const fault = child(bodyNode, 'Fault');
  if (fault) {
    const err = child(child(fault, 'detail'), 'UPnPError');
    throw new UpnpFault(action, textOf(child(err, 'errorCode')), textOf(child(err, 'errorDescription')));
  }
  const out = child(bodyNode, `${action}Response`);
  const result: Record<string, string> = {};
  if (out && typeof out === 'object') for (const [k, v] of Object.entries(out)) result[k] = textOf(v);
  return result;
}
```

`packages/heos-core/src/upnp/act.ts`:
```ts
import { ACT, soapCall, type UpnpEndpoint } from './soap';
import { child, numOrNull, parseXml, textOf } from './xml';

export interface AudioConfig {
  soundMode: string | null;
  availableSoundModes: string[];
  bassBoost: number | null;
  rawXml: string;
}

export interface LevelSetting {
  level: number;
  supported: boolean;
}

export interface TvConfig {
  dialogue: LevelSetting | null;
  night: LevelSetting | null;
  audioDelay: number | null;
  rawXml: string;
}

// ACT out-args are XML documents embedded as text; some firmware wraps the root twice.
function innerConfig(xml: string, root: string): Record<string, unknown> {
  if (!xml.trim()) return {};
  let node: unknown = parseXml(xml)[root];
  const nested = child(node, root);
  if (nested && typeof nested === 'object') node = nested;
  return node && typeof node === 'object' ? (node as Record<string, unknown>) : {};
}

// Mixed content: <dialogueEnhance>2<level>2</level><enabled>1</enabled></dialogueEnhance>.
// The <level> child wins over the leading text; <enabled>0 marks the feature unsupported.
function levelSetting(n: unknown): LevelSetting | null {
  if (n === undefined) return null;
  const level = numOrNull(textOf(child(n, 'level')) || textOf(n));
  if (level === null) return null;
  return { level, supported: textOf(child(n, 'enabled')) !== '0' };
}

export function parseAudioConfig(xml: string): AudioConfig {
  const c = innerConfig(xml, 'AudioConfig');
  return {
    soundMode: textOf(c.soundMode) || null,
    availableSoundModes: textOf(c.availableSoundModes).split(',').map((s) => s.trim()).filter(Boolean),
    bassBoost: numOrNull(textOf(c.bassBoost)),
    rawXml: xml,
  };
}

export function parseTvConfig(xml: string): TvConfig {
  const c = innerConfig(xml, 'TvConfig');
  return {
    dialogue: levelSetting(c.dialogueEnhance),
    night: levelSetting(c.nightMode),
    audioDelay: numOrNull(textOf(c.audioDelay)),
    rawXml: xml,
  };
}

export async function getAudioConfig(ep: UpnpEndpoint): Promise<AudioConfig> {
  const r = await soapCall(ep, ACT, 'GetAudioConfig');
  return parseAudioConfig(r.AudioConfig ?? '');
}

export async function getTvConfig(ep: UpnpEndpoint): Promise<TvConfig> {
  const r = await soapCall(ep, ACT, 'GetTvConfig');
  return parseTvConfig(r.TvConfig ?? '');
}
```

`packages/heos-core/src/upnp/rendering.ts`:
```ts
import { clamp } from '../util';
import { RENDERING, soapCall, UpnpFault, type UpnpEndpoint } from './soap';
import { numOrNull } from './xml';

// Ranges from the device SCPD (allowedValueRange), DHT-S716H firmware 3.139.170.
export const TONE_RANGE = {
  bass: { min: 0, max: 10, neutral: 5 },
  treble: { min: 0, max: 10, neutral: 5 },
  subwoofer: { min: 0, max: 30 },
} as const;

const CHANNEL = { InstanceID: 0, Channel: 'Master' };
const NON_EQ_PRESETS = new Set(['FactoryDefaults', 'InstallationDefaults', 'Disabled']);

async function getNumber(ep: UpnpEndpoint, action: string, outArg: string): Promise<number> {
  const r = await soapCall(ep, RENDERING, action, CHANNEL);
  const n = numOrNull(r[outArg] ?? '');
  if (n === null) throw new UpnpFault(action, 'parse', `missing ${outArg}`);
  return n;
}

export const getBass = (ep: UpnpEndpoint) => getNumber(ep, 'X_GetBass', 'CurrentBass');
export const getTreble = (ep: UpnpEndpoint) => getNumber(ep, 'X_GetTreble', 'CurrentTreble');
export const getSubwoofer = (ep: UpnpEndpoint) => getNumber(ep, 'X_GetSubwoofer', 'CurrentLevel');

export async function setBass(ep: UpnpEndpoint, v: number): Promise<void> {
  await soapCall(ep, RENDERING, 'X_SetBass', { ...CHANNEL, DesiredBass: clamp(Math.round(v), TONE_RANGE.bass.min, TONE_RANGE.bass.max) });
}

export async function setTreble(ep: UpnpEndpoint, v: number): Promise<void> {
  await soapCall(ep, RENDERING, 'X_SetTreble', { ...CHANNEL, DesiredTreble: clamp(Math.round(v), TONE_RANGE.treble.min, TONE_RANGE.treble.max) });
}

export async function setSubwoofer(ep: UpnpEndpoint, v: number): Promise<void> {
  await soapCall(ep, RENDERING, 'X_SetSubwoofer', { ...CHANNEL, DesiredLevel: clamp(Math.round(v), TONE_RANGE.subwoofer.min, TONE_RANGE.subwoofer.max) });
}

export async function listEqPresets(ep: UpnpEndpoint): Promise<string[]> {
  const r = await soapCall(ep, RENDERING, 'ListPresets', { InstanceID: 0 });
  return (r.CurrentPresetNameList ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !NON_EQ_PRESETS.has(s));
}

export async function getEqPreset(ep: UpnpEndpoint): Promise<string | null> {
  const r = await soapCall(ep, RENDERING, 'X_GetPreset', { InstanceID: 0 });
  return r.CurrentPreset || null;
}

export async function selectEqPreset(ep: UpnpEndpoint, id: string): Promise<void> {
  await soapCall(ep, RENDERING, 'SelectPreset', { InstanceID: 0, PresetName: id });
}

/** Display label for a device preset id; the firmware misspells "Acoustic". */
export const presetLabel = (id: string): string => (id === 'Accoustic' ? 'Acoustic' : id);
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @zapbar/heos-core test && pnpm typecheck`
Expected: all PASS, including 10 new UPnP tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(heos-core): UPnP SOAP client, ACT config parsing, tone and EQ presets

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Live write-probe on the real soundbar

The probe changes soundbar settings for a second or two and then restores them, so run it while nobody is watching TV. Its output decides the ACT setter formats (Task 6) and the dialogue and night ranges.

**Files:**
- Create: `packages/heos-core/scripts/probe-writes.ts`
- Create (by running the script): `docs/probe-results.md`

**Interfaces:**
- Consumes: `HeosCliClient`, `createCliCommands`, `nodeSocketFactory`, `nodeHttp`, `soapCall`, `ACT`, `getAudioConfig`, `getTvConfig`, `getBass`, `getTreble`, `setBass`, `setTreble`, `getEqPreset`, `selectEqPreset`, `sleep`.
- Produces: `docs/probe-results.md`. It records the winning payload per setting, the accepted dialogue and night ranges, preset side effects, Quick Select behaviour, Spotify Connect control, and the events seen.

- [ ] **Step 1: Write the probe script**

`packages/heos-core/scripts/probe-writes.ts`:
```ts
/**
 * Live write-probe against a real HEOS soundbar: changes each setting briefly, reads it back, restores it.
 * Usage (from packages/heos-core):
 *   pnpm exec tsx scripts/probe-writes.ts <ip> [--quickselect] [--spotify] [--listen <seconds>]
 * Never calls system/check_account (it returns the HEOS account e-mail).
 */
import { writeFileSync } from 'node:fs';
import { HeosCliClient } from '../src/cli/client';
import { createCliCommands } from '../src/cli/commands';
import { nodeHttp, nodeSocketFactory } from '../src/node';
import { getAudioConfig, getTvConfig } from '../src/upnp/act';
import { getBass, getEqPreset, getTreble, selectEqPreset, setBass, setTreble } from '../src/upnp/rendering';
import { ACT, soapCall, type UpnpEndpoint } from '../src/upnp/soap';
import { sleep } from '../src/util';

const args = process.argv.slice(2);
const ip = args[0] ?? '10.0.0.82';
const flag = (f: string) => args.includes(f);
const listenSec = Number(args[args.indexOf('--listen') + 1] ?? 0);
const ep: UpnpEndpoint = { http: nodeHttp, baseUrl: `http://${ip}:60006`, timeoutMs: 5000 };
const out: string[] = ['# Write-probe results', '', `Device ${ip}, run ${new Date().toISOString()}`, ''];
const log = (...lines: string[]) => {
  for (const s of lines) {
    console.log(s);
    out.push(s);
  }
};

interface Candidate { name: string; write: (v: string) => Promise<unknown> }

const setAudio = (xml: string) => soapCall(ep, ACT, 'SetAudioConfig', { AudioConfig: xml });
const setTv = (xml: string) => soapCall(ep, ACT, 'SetTvConfig', { TvConfig: xml });
const withApply = async (fn: () => Promise<unknown>) => {
  const t = await soapCall(ep, ACT, 'GetConfigurationToken');
  await fn();
  await soapCall(ep, ACT, 'ApplyChanges', { configurationToken: t.configurationToken ?? '' });
};

async function tryCandidates(label: string, read: () => Promise<string>, target: string, original: string, candidates: Candidate[]): Promise<Candidate | null> {
  for (const c of candidates) {
    try {
      await c.write(target);
    } catch (e) {
      log(`| ${label} | ${c.name} | error: ${(e as Error).message} |`);
      continue;
    }
    await sleep(800);
    const got = await read();
    const works = got === target;
    log(`| ${label} | ${c.name} | wrote ${target}, read back ${got} → ${works ? 'WORKS' : 'no effect'} |`);
    if (works) {
      await c.write(original);
      await sleep(800);
      log(`| ${label} | restore | read back ${await read()} (original ${original}) |`);
      return c;
    }
  }
  log(`| ${label} | — | NO CANDIDATE WORKED |`);
  return null;
}

async function scanRange(label: string, winner: Candidate, read: () => Promise<string>, original: string, values: number[]) {
  const accepted: number[] = [];
  for (const v of values) {
    try {
      await winner.write(String(v));
      await sleep(600);
      if ((await read()) === String(v)) accepted.push(v);
    } catch {
      /* rejected value */
    }
  }
  await winner.write(original);
  await sleep(600);
  log(`- ${label} accepted values: [${accepted.join(', ')}] (restored to ${await read()})`);
}

const levelCandidates = (tag: string): Candidate[] => [
  { name: 'partial-nested', write: (v) => setTv(`<TvConfig><${tag}><level>${v}</level></${tag}></TvConfig>`) },
  { name: 'partial-text', write: (v) => setTv(`<TvConfig><${tag}>${v}</${tag}></TvConfig>`) },
  {
    name: 'full-echo',
    write: async (v) => setTv((await getTvConfig(ep)).rawXml.replace(new RegExp(`<${tag}>\\d*<level>\\d+</level>`), `<${tag}>${v}<level>${v}</level>`)),
  },
  { name: 'partial-nested+ApplyChanges', write: (v) => withApply(() => setTv(`<TvConfig><${tag}><level>${v}</level></${tag}></TvConfig>`)) },
];

async function main() {
  log('## ACT setter formats', '');
  log('| setting | candidate | result |');
  log('|---|---|---|');

  const audio = await getAudioConfig(ep);
  const mode0 = audio.soundMode ?? '';
  const modeTarget = audio.availableSoundModes.find((m) => m !== mode0) ?? mode0;
  const readMode = async () => (await getAudioConfig(ep)).soundMode ?? '';
  await tryCandidates('soundMode', readMode, modeTarget, mode0, [
    { name: 'partial', write: (v) => setAudio(`<AudioConfig><soundMode>${v}</soundMode></AudioConfig>`) },
    { name: 'full-echo', write: async (v) => setAudio((await getAudioConfig(ep)).rawXml.replace(/<soundMode>[^<]*<\/soundMode>/, `<soundMode>${v}</soundMode>`)) },
    { name: 'partial+ApplyChanges', write: (v) => withApply(() => setAudio(`<AudioConfig><soundMode>${v}</soundMode></AudioConfig>`)) },
  ]);

  const tv = await getTvConfig(ep);
  const readDialogue = async () => String((await getTvConfig(ep)).dialogue?.level ?? '');
  const d0 = String(tv.dialogue?.level ?? 0);
  const dWin = await tryCandidates('dialogue', readDialogue, d0 === '1' ? '2' : '1', d0, levelCandidates('dialogueEnhance'));

  const readNight = async () => String((await getTvConfig(ep)).night?.level ?? '');
  const n0 = String(tv.night?.level ?? 0);
  const nWin = await tryCandidates('night', readNight, n0 === '0' ? '1' : '0', n0, levelCandidates('nightMode'));

  log('', '## Ranges', '');
  if (dWin) await scanRange('dialogue', dWin, readDialogue, d0, [0, 1, 2, 3, 4, 5]);
  if (nWin) await scanRange('night', nWin, readNight, n0, [0, 1, 2, 3]);

  log('', '## Tone and presets', '');
  const b0 = await getBass(ep);
  const t0 = await getTreble(ep);
  const p0 = await getEqPreset(ep);
  await setBass(ep, b0 === 10 ? 9 : b0 + 1);
  await sleep(600);
  log(`- X_SetBass ${b0}→${b0 === 10 ? 9 : b0 + 1}: read back ${await getBass(ep)}`);
  for (const p of ['Rock', 'Disabled']) {
    await selectEqPreset(ep, p);
    await sleep(800);
    log(`- SelectPreset(${p}): bass ${await getBass(ep)}, treble ${await getTreble(ep)}, X_GetPreset "${(await getEqPreset(ep)) ?? ''}"`);
  }
  if (p0) await selectEqPreset(ep, p0);
  await setBass(ep, b0);
  await setTreble(ep, t0);
  await sleep(600);
  log(`- restored: bass ${await getBass(ep)} (was ${b0}), treble ${await getTreble(ep)} (was ${t0}), preset "${(await getEqPreset(ep)) ?? ''}" (was "${p0 ?? ''}")`);

  const client = await HeosCliClient.connect(nodeSocketFactory, ip, { timeoutMs: 5000 });
  const cmds = createCliCommands(client);
  const players = await cmds.getPlayers();
  const me = players.find((p) => p.ip === ip) ?? players[0];
  if (!me) throw new Error('no player found');
  const pid = me.pid;

  if (flag('--quickselect')) {
    log('', '## Quick Select', '');
    const vol0 = await cmds.getVolume(pid);
    const np0 = await cmds.getNowPlaying(pid);
    await cmds.playQuickSelect(pid, 1);
    await sleep(2500);
    const np1 = await cmds.getNowPlaying(pid);
    log(`- play_quickselect id=1: volume ${vol0}→${await cmds.getVolume(pid)}, mid "${np0?.mid}"→"${np1?.mid}"`);
    if (np0?.mid.startsWith('inputs/')) await cmds.playInput(pid, np0.mid);
    await cmds.setVolume(pid, vol0);
    log(`- restored volume ${await cmds.getVolume(pid)}, mid "${(await cmds.getNowPlaying(pid))?.mid}"`);
  }

  if (flag('--spotify')) {
    log('', '## Spotify Connect control via CLI', '');
    const np = await cmds.getNowPlaying(pid);
    if (!np || np.mid.startsWith('inputs/')) {
      log('- skipped: start Spotify on the soundbar via Spotify Connect first');
    } else {
      log(`- now playing: sid ${np.sid}, type ${np.type}, song "${np.song}", has art ${np.image_url ? 'yes' : 'no'}`);
      await cmds.setPlayState(pid, 'pause');
      await sleep(1500);
      log(`- set_play_state pause → get_play_state ${await cmds.getPlayState(pid)}`);
      await cmds.setPlayState(pid, 'play');
      await sleep(1500);
      log(`- set_play_state play → get_play_state ${await cmds.getPlayState(pid)}`);
      await cmds.playNext(pid);
      await sleep(2500);
      log(`- play_next → song "${(await cmds.getNowPlaying(pid))?.song}"`);
    }
  }

  if (listenSec > 0) {
    log('', `## Events (${listenSec}s)`, '');
    await cmds.registerForChangeEvents(true);
    client.onEvent((e) => log(`- ${new Date().toISOString().slice(11, 19)} event/${e.event} ${JSON.stringify(e.message)}`));
    client.onClose(() => log(`- ${new Date().toISOString().slice(11, 19)} CLI connection closed`));
    console.log('\nNOW, in order: change bass in the HEOS app, switch input on the IR remote, press power (standby), press power again.\n');
    await sleep(listenSec * 1000);
    try {
      log(`- after listening: get_play_state ${await cmds.getPlayState(pid)}`);
    } catch (e) {
      log(`- after listening: CLI error ${(e as Error).message}`);
    }
  }
  client.close();
}

main()
  .catch((e) => log(`\nFAILED: ${(e as Error).stack ?? e}`))
  .finally(() => {
    const path = new URL('../../../docs/probe-results.md', import.meta.url);
    writeFileSync(path, out.join('\n') + '\n');
    console.log(`\nwrote ${path.pathname}`);
  });
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 3: Run the base probe (formats, ranges, presets)**

Before running, give a one-line heads-up that the soundbar's settings will flicker for about 30 seconds.

Run: `cd packages/heos-core && pnpm exec tsx scripts/probe-writes.ts 10.0.0.82`
Expected:
- A table with at least one `WORKS` row for each of soundMode, dialogue and night.
- Range lines for dialogue and night.
- Every `restored` line matching its original.

If any restore line does **not** match, fix that setting by hand in the HEOS app and note it in the results.

- [ ] **Step 4: Run the Quick Select, Spotify and event probes**

These need the user:
1. `pnpm exec tsx scripts/probe-writes.ts 10.0.0.82 --quickselect`, with no extra action needed.
2. Ask the user to start Spotify on "Loving room" through Spotify Connect, then run `pnpm exec tsx scripts/probe-writes.ts 10.0.0.82 --spotify`.
3. Run `pnpm exec tsx scripts/probe-writes.ts 10.0.0.82 --listen 60` and ask the user to follow the on-screen sequence: bass in the HEOS app, input on the IR remote, power off, power on.

Each run overwrites `docs/probe-results.md`. Copy each run's output into one combined file after every run:
```bash
cp ../../docs/probe-results.md ../../docs/probe-results-$(date +%H%M%S).md
```
Then merge them by hand into `docs/probe-results.md`, with sections "ACT setter formats", "Ranges", "Tone and presets", "Quick Select", "Spotify Connect control via CLI" and "Events", and delete the timestamped copies.

- [ ] **Step 5: Add a decisions section to `docs/probe-results.md`**

Append this, filled from the results above:
```markdown
## Decisions (feed Task 6 and Plans 2–3)
- soundMode setter: <winning candidate name>
- dialogue setter: <winning candidate name>; DIALOGUE_RANGE = { min: <lowest accepted>, max: <highest accepted> }
- night setter: <winning candidate name>; NIGHT_RANGE = { min: <lowest accepted>, max: <highest accepted> }
- SelectPreset side effects: <does it change bass/treble? does 'Disabled' reset to flat?> → the "Flat" chip calls <SelectPreset('Disabled') | resetTone()>
- Quick Select via CLI play_quickselect: <works | does not work>
- Spotify Connect via CLI: pause/play <works|not>, next <works|not>, Spotify sid = <n>
- Events on HEOS-app bass change: <seen / none> → UPnP polling <required | not required>
- Power/standby: <what happened: event name / connection closed / nothing>; power control in scope: <yes|no>
```

- [ ] **Step 6: Commit**

```bash
cd ~/projects/zapbar
git add packages/heos-core/scripts/probe-writes.ts docs/probe-results.md
git commit -m "chore(heos-core): live write-probe and recorded results for DHT-S716H

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: ACT setters

**Files:**
- Modify: `packages/heos-core/src/upnp/act.ts` (append)
- Test: `packages/heos-core/test/act-setters.test.ts`

**Interfaces:**
- Consumes: `soapCall`, `ACT`, `getAudioConfig`, `getTvConfig`, `xmlEscape`; `docs/probe-results.md` → Decisions.
- Produces:
  - `interface AudioPatch { soundMode?: string; bassBoost?: number }`
  - `interface TvPatch { dialogueLevel?: number; nightLevel?: number; audioDelay?: number }`
  - `audioPatchXml(p: AudioPatch): string`, `tvPatchXml(p: TvPatch): string`
  - `setAudioConfig(ep, p: AudioPatch): Promise<void>`, `setTvConfig(ep, p: TvPatch): Promise<void>`
  - `DIALOGUE_RANGE: { min: number; max: number }`, `NIGHT_RANGE: { min: number; max: number }`

- [ ] **Step 1: Write the failing test**

`packages/heos-core/test/act-setters.test.ts`:
```ts
import { afterEach, beforeEach, expect, it } from 'vitest';
import { nodeHttp } from '../src/node';
import { audioPatchXml, getAudioConfig, getTvConfig, setAudioConfig, setTvConfig, tvPatchXml } from '../src/upnp/act';
import type { UpnpEndpoint } from '../src/upnp/soap';
import { FakeHeos } from './fake/fake-heos';

let fake: FakeHeos;
let ep: UpnpEndpoint;
beforeEach(async () => {
  fake = await FakeHeos.start();
  ep = { http: nodeHttp, baseUrl: fake.baseUrl, timeoutMs: 1000 };
});
afterEach(() => fake.stop());

it('builds patch XML containing only the changed fields', () => {
  expect(audioPatchXml({ soundMode: 'MUSIC_NORMAL' })).toContain('<soundMode>MUSIC_NORMAL</soundMode>');
  expect(audioPatchXml({ soundMode: 'MUSIC_NORMAL' })).not.toContain('bassBoost');
  expect(tvPatchXml({ nightLevel: 1 })).toContain('nightMode');
  expect(tvPatchXml({ nightLevel: 1 })).not.toContain('dialogueEnhance');
});

it('sets the sound mode', async () => {
  await setAudioConfig(ep, { soundMode: 'MUSIC_NORMAL' });
  expect((await getAudioConfig(ep)).soundMode).toBe('MUSIC_NORMAL');
});

it('sets dialogue and night levels', async () => {
  await setTvConfig(ep, { dialogueLevel: 3 });
  await setTvConfig(ep, { nightLevel: 1 });
  const tv = await getTvConfig(ep);
  expect(tv.dialogue?.level).toBe(3);
  expect(tv.night?.level).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zapbar/heos-core test act-setters`
Expected: FAIL with "audioPatchXml is not a function" (or a missing-export error).

- [ ] **Step 3: Write the implementation, using the format recorded in Decisions**

Append to `packages/heos-core/src/upnp/act.ts` (also add `xmlEscape` to the `./xml` import):
```ts
export interface AudioPatch {
  soundMode?: string;
  bassBoost?: number;
}

export interface TvPatch {
  dialogueLevel?: number;
  nightLevel?: number;
  audioDelay?: number;
}

// Probe-confirmed ranges (docs/probe-results.md → Decisions).
export const DIALOGUE_RANGE = { min: 0, max: 3 };
export const NIGHT_RANGE = { min: 0, max: 1 };

export function audioPatchXml(p: AudioPatch): string {
  const f: string[] = [];
  if (p.soundMode !== undefined) f.push(`<soundMode>${xmlEscape(p.soundMode)}</soundMode>`);
  if (p.bassBoost !== undefined) f.push(`<bassBoost>${Math.round(p.bassBoost)}</bassBoost>`);
  return `<AudioConfig>${f.join('')}</AudioConfig>`;
}

export function tvPatchXml(p: TvPatch): string {
  const f: string[] = [];
  if (p.dialogueLevel !== undefined) f.push(`<dialogueEnhance><level>${Math.round(p.dialogueLevel)}</level></dialogueEnhance>`);
  if (p.nightLevel !== undefined) f.push(`<nightMode><level>${Math.round(p.nightLevel)}</level></nightMode>`);
  if (p.audioDelay !== undefined) f.push(`<audioDelay>${Math.round(p.audioDelay)}</audioDelay>`);
  return `<TvConfig>${f.join('')}</TvConfig>`;
}

export async function setAudioConfig(ep: UpnpEndpoint, p: AudioPatch): Promise<void> {
  await soapCall(ep, ACT, 'SetAudioConfig', { AudioConfig: audioPatchXml(p) });
}

export async function setTvConfig(ep: UpnpEndpoint, p: TvPatch): Promise<void> {
  await soapCall(ep, ACT, 'SetTvConfig', { TvConfig: tvPatchXml(p) });
}
```

Then apply the Decisions section:
- **`DIALOGUE_RANGE` / `NIGHT_RANGE`:** set both to the accepted min and max recorded there.
- **Dialogue or night winner is `partial-text`:** replace the two `f.push` lines in `tvPatchXml` with:
  ```ts
  if (p.dialogueLevel !== undefined) f.push(`<dialogueEnhance>${Math.round(p.dialogueLevel)}</dialogueEnhance>`);
  if (p.nightLevel !== undefined) f.push(`<nightMode>${Math.round(p.nightLevel)}</nightMode>`);
  ```
- **A winner is `full-echo`:** replace `setAudioConfig` / `setTvConfig` with read-modify-write versions:
  ```ts
  export async function setAudioConfig(ep: UpnpEndpoint, p: AudioPatch): Promise<void> {
    let xml = (await getAudioConfig(ep)).rawXml;
    if (p.soundMode !== undefined) xml = xml.replace(/<soundMode>[^<]*<\/soundMode>/, `<soundMode>${xmlEscape(p.soundMode)}</soundMode>`);
    if (p.bassBoost !== undefined) xml = xml.replace(/<bassBoost>[^<]*<\/bassBoost>/, `<bassBoost>${Math.round(p.bassBoost)}</bassBoost>`);
    await soapCall(ep, ACT, 'SetAudioConfig', { AudioConfig: xml });
  }

  export async function setTvConfig(ep: UpnpEndpoint, p: TvPatch): Promise<void> {
    let xml = (await getTvConfig(ep)).rawXml;
    const lvl = (x: string, tag: string, v: number) => x.replace(new RegExp(`<${tag}>\\d*<level>\\d+</level>`), `<${tag}>${v}<level>${v}</level>`);
    if (p.dialogueLevel !== undefined) xml = lvl(xml, 'dialogueEnhance', Math.round(p.dialogueLevel));
    if (p.nightLevel !== undefined) xml = lvl(xml, 'nightMode', Math.round(p.nightLevel));
    if (p.audioDelay !== undefined) xml = xml.replace(/<audioDelay>[^<]*<\/audioDelay>/, `<audioDelay>${Math.round(p.audioDelay)}</audioDelay>`);
    await soapCall(ep, ACT, 'SetTvConfig', { TvConfig: xml });
  }
  ```
- **A winner is `+ApplyChanges`:** wrap the `soapCall` in each setter:
  ```ts
  const t = await soapCall(ep, ACT, 'GetConfigurationToken');
  await soapCall(ep, ACT, 'SetTvConfig', { TvConfig: tvPatchXml(p) });
  await soapCall(ep, ACT, 'ApplyChanges', { configurationToken: t.configurationToken ?? '' });
  ```
  Then add `case 'GetConfigurationToken': return ok('<configurationToken>fake</configurationToken>');` and `case 'ApplyChanges': return ok('');` to the fake's `onSoap` switch.

The fake accepts every format, so the tests above stay valid whichever variant wins. If a variant replaced `audioPatchXml`/`tvPatchXml` usage, keep the first test as it is: the builders are still exported and used by the partial variants.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @zapbar/heos-core test && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 5: Verify on the real device**

Run once by hand to confirm the chosen format works end to end; it restores the original values:
```bash
cd packages/heos-core && pnpm exec tsx -e "
import { nodeHttp } from './src/node';
import { getTvConfig, setTvConfig } from './src/upnp/act';
const ep = { http: nodeHttp, baseUrl: 'http://10.0.0.82:60006', timeoutMs: 5000 };
const t0 = await getTvConfig(ep); const n0 = t0.night?.level ?? 0;
await setTvConfig(ep, { nightLevel: n0 === 0 ? 1 : 0 }); await new Promise(r => setTimeout(r, 800));
console.log('night now', (await getTvConfig(ep)).night?.level);
await setTvConfig(ep, { nightLevel: n0 }); await new Promise(r => setTimeout(r, 800));
console.log('night restored', (await getTvConfig(ep)).night?.level, 'was', n0);
"
```
Expected: `night now` differs from `was`, and `night restored` equals `was`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(heos-core): ACT setters for sound mode, dialogue and night (probe-confirmed format)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: State types and capability probe

**Files:**
- Create: `packages/heos-core/src/state/types.ts`, `packages/heos-core/src/capabilities.ts`
- Test: `packages/heos-core/test/capabilities.test.ts`

**Interfaces:**
- Consumes: `CliCommands`, `PlayerInfo`, `InputSource`, `QuickSelect`, `PlayState`; `UpnpEndpoint`, `UpnpUnreachable`; `getBass`, `getTreble`, `getSubwoofer`, `listEqPresets`, `getEqPreset`, `TONE_RANGE`; `getAudioConfig`, `getTvConfig`, `DIALOGUE_RANGE`, `NIGHT_RANGE`.
- Produces:
  - `type ConnectionStatus = 'connecting' | 'probing' | 'ready' | 'degraded' | 'offline'`
  - `interface NowPlaying { sourceId: number; sourceName: string; title: string; artist: string; album: string; artUrl: string | null }`
  - `interface DeviceSettings { volume: number; mute: boolean; playState: PlayState; activeInput: string | null; nowPlaying: NowPlaying | null; bass: number | null; treble: number | null; subwoofer: number | null; eqPreset: string | null; soundMode: string | null; dialogueLevel: number | null; nightLevel: number | null }`
  - `interface DeviceError { id: number; text: string }`
  - `interface DeviceState { key: string; pid: number | null; name: string; model: string; ip: string; status: ConnectionStatus; caps: Capabilities | null; settings: DeviceSettings; lastError: DeviceError | null }`
  - `interface Zone { id: string; name: string; memberKeys: string[] }`
  - `interface PlaybackTarget { playUrl(zoneId: string, url: string, meta: { title: string; artist?: string; artUrl?: string }): Promise<void> }` (the v2 Subsonic hook; no implementation in v1)
  - `EMPTY_SETTINGS: DeviceSettings`
  - `interface Range { min: number; max: number }`
  - `interface Capabilities { inputs: InputSource[]; quickSelects: Array<QuickSelect & { used: boolean }>; upnpReachable: boolean; tone: { bass: Range; treble: Range; subwoofer: Range | null } | null; eqPresets: string[]; soundModes: string[]; dialogue: Range | null; night: Range | null }`
  - `probeCapabilities(cmds: CliCommands, ep: UpnpEndpoint, player: PlayerInfo): Promise<{ caps: Capabilities; settings: Partial<DeviceSettings> }>`

- [ ] **Step 1: Write the failing test**

`packages/heos-core/test/capabilities.test.ts`:
```ts
import { afterEach, beforeEach, expect, it } from 'vitest';
import { probeCapabilities } from '../src/capabilities';
import { HeosCliClient } from '../src/cli/client';
import { createCliCommands, type CliCommands, type PlayerInfo } from '../src/cli/commands';
import { nodeHttp, nodeSocketFactory } from '../src/node';
import type { UpnpEndpoint } from '../src/upnp/soap';
import { FakeHeos } from './fake/fake-heos';

let fake: FakeHeos;
let client: HeosCliClient;
let cmds: CliCommands;
let ep: UpnpEndpoint;
let player: PlayerInfo;

beforeEach(async () => {
  fake = await FakeHeos.start();
  client = await HeosCliClient.connect(nodeSocketFactory, '127.0.0.1', { port: fake.cliPort });
  cmds = createCliCommands(client);
  ep = { http: nodeHttp, baseUrl: fake.baseUrl, timeoutMs: 500 };
  player = (await cmds.getPlayers())[0]!;
});
afterEach(async () => {
  client.close();
  await fake.stop();
});

it('detects every soundbar capability and snapshots the settings', async () => {
  const { caps, settings } = await probeCapabilities(cmds, ep, player);
  expect(caps.upnpReachable).toBe(true);
  expect(caps.inputs).toHaveLength(8);
  expect(caps.quickSelects.filter((q) => q.used).map((q) => q.name)).toEqual(['Watch TV']);
  expect(caps.tone).toEqual({ bass: { min: 0, max: 10, neutral: 5 }, treble: { min: 0, max: 10, neutral: 5 }, subwoofer: { min: 0, max: 30 } });
  expect(caps.eqPresets).toEqual(['Accoustic', 'Classical', 'Jazz', 'Pop', 'Rock']);
  expect(caps.soundModes).toEqual(['MUSIC_NORMAL', 'MOVIE_NORMAL']);
  expect(caps.dialogue).not.toBeNull();
  expect(caps.night).not.toBeNull();
  expect(settings).toMatchObject({ bass: 5, treble: 5, subwoofer: 15, eqPreset: null, soundMode: 'MOVIE_NORMAL', dialogueLevel: 2, nightLevel: 0 });
});

it('keeps CLI capabilities and drops UPnP ones when UPnP is unreachable', async () => {
  fake.upnpDown = true;
  const { caps } = await probeCapabilities(cmds, ep, player);
  expect(caps.upnpReachable).toBe(false);
  expect(caps.inputs).toHaveLength(8);
  expect(caps.tone).toBeNull();
  expect(caps.eqPresets).toEqual([]);
  expect(caps.dialogue).toBeNull();
});

it('drops only the features whose actions fault', async () => {
  fake.faultActions.add('GetTvConfig');
  fake.faultActions.add('ListPresets');
  const { caps } = await probeCapabilities(cmds, ep, player);
  expect(caps.upnpReachable).toBe(true);
  expect(caps.tone).not.toBeNull();
  expect(caps.eqPresets).toEqual([]);
  expect(caps.dialogue).toBeNull();
  expect(caps.night).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zapbar/heos-core test capabilities`
Expected: FAIL with an unresolved import `../src/capabilities`.

- [ ] **Step 3: Write the implementation**

`packages/heos-core/src/state/types.ts`:
```ts
import type { Capabilities } from '../capabilities';
import type { PlayState } from '../cli/commands';

export type ConnectionStatus = 'connecting' | 'probing' | 'ready' | 'degraded' | 'offline';

export interface NowPlaying {
  sourceId: number;
  sourceName: string;
  title: string;
  artist: string;
  album: string;
  artUrl: string | null;
}

export interface DeviceSettings {
  volume: number;
  mute: boolean;
  playState: PlayState;
  activeInput: string | null;
  nowPlaying: NowPlaying | null;
  bass: number | null;
  treble: number | null;
  subwoofer: number | null;
  eqPreset: string | null;
  soundMode: string | null;
  dialogueLevel: number | null;
  nightLevel: number | null;
}

export interface DeviceError {
  id: number;
  text: string;
}

export interface DeviceState {
  key: string;
  pid: number | null;
  name: string;
  model: string;
  ip: string;
  status: ConnectionStatus;
  caps: Capabilities | null;
  settings: DeviceSettings;
  lastError: DeviceError | null;
}

/** A group of players. v1 creates exactly one single-member zone per device. */
export interface Zone {
  id: string;
  name: string;
  memberKeys: string[];
}

/** v2 hook for Subsonic playback; v1 ships the interface only. */
export interface PlaybackTarget {
  playUrl(zoneId: string, url: string, meta: { title: string; artist?: string; artUrl?: string }): Promise<void>;
}

export const EMPTY_SETTINGS: DeviceSettings = {
  volume: 0,
  mute: false,
  playState: 'stop',
  activeInput: null,
  nowPlaying: null,
  bass: null,
  treble: null,
  subwoofer: null,
  eqPreset: null,
  soundMode: null,
  dialogueLevel: null,
  nightLevel: null,
};
```

`packages/heos-core/src/capabilities.ts`:
```ts
import type { CliCommands, InputSource, PlayerInfo, QuickSelect } from './cli/commands';
import type { DeviceSettings } from './state/types';
import { DIALOGUE_RANGE, getAudioConfig, getTvConfig, NIGHT_RANGE } from './upnp/act';
import { getBass, getEqPreset, getSubwoofer, getTreble, listEqPresets, TONE_RANGE } from './upnp/rendering';
import { UpnpUnreachable, type UpnpEndpoint } from './upnp/soap';

export interface Range {
  min: number;
  max: number;
}

export interface Capabilities {
  inputs: InputSource[];
  quickSelects: Array<QuickSelect & { used: boolean }>;
  upnpReachable: boolean;
  tone: { bass: Range; treble: Range; subwoofer: Range | null } | null;
  eqPresets: string[];
  soundModes: string[];
  dialogue: Range | null;
  night: Range | null;
}

// A slot the user never stored keeps its factory name.
const UNUSED_QUICK_SELECT = /^Quick Select \d+$/;

export async function probeCapabilities(
  cmds: CliCommands,
  ep: UpnpEndpoint,
  player: PlayerInfo,
): Promise<{ caps: Capabilities; settings: Partial<DeviceSettings> }> {
  const inputs = await cmds.getInputs(player.pid, player.name).catch(() => []);
  const quickSelects = await cmds.getQuickSelects(player.pid).catch(() => []);

  // A fault means "this model lacks the feature"; unreachable means "stop probing UPnP".
  let reachable = true;
  const attempt = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    if (!reachable) return null;
    try {
      return await fn();
    } catch (e) {
      if (e instanceof UpnpUnreachable) reachable = false;
      return null;
    }
  };

  const bass = await attempt(() => getBass(ep));
  const treble = await attempt(() => getTreble(ep));
  const subwoofer = await attempt(() => getSubwoofer(ep));
  const eqPresets = (await attempt(() => listEqPresets(ep))) ?? [];
  const eqPreset = eqPresets.length ? await attempt(() => getEqPreset(ep)) : null;
  const audio = await attempt(() => getAudioConfig(ep));
  const tv = await attempt(() => getTvConfig(ep));

  const caps: Capabilities = {
    inputs,
    quickSelects: quickSelects.map((q) => ({ ...q, used: !UNUSED_QUICK_SELECT.test(q.name) })),
    upnpReachable: reachable,
    tone:
      bass !== null && treble !== null
        ? { bass: TONE_RANGE.bass, treble: TONE_RANGE.treble, subwoofer: subwoofer !== null ? TONE_RANGE.subwoofer : null }
        : null,
    eqPresets,
    soundModes: audio && audio.availableSoundModes.length > 1 ? audio.availableSoundModes : [],
    dialogue: tv?.dialogue?.supported ? DIALOGUE_RANGE : null,
    night: tv?.night?.supported ? NIGHT_RANGE : null,
  };
  const settings: Partial<DeviceSettings> = {
    bass,
    treble,
    subwoofer,
    eqPreset,
    soundMode: audio?.soundMode ?? null,
    dialogueLevel: tv?.dialogue?.level ?? null,
    nightLevel: tv?.night?.level ?? null,
  };
  return { caps, settings };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @zapbar/heos-core test && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(heos-core): device state types and capability probe

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Store, now-playing mapping, device connection lifecycle

**Files:**
- Create: `packages/heos-core/src/state/store.ts`, `packages/heos-core/src/state/now-playing.ts`, `packages/heos-core/src/device.ts`
- Test: `packages/heos-core/test/now-playing.test.ts`, `packages/heos-core/test/device-lifecycle.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–7.
- Produces:
  - `interface HeosState { devices: Record<string, DeviceState>; zones: Zone[] }`
  - `createHeosStore()`, `type HeosStore`
  - `upsertDevice(store, key, patch: Partial<Omit<DeviceState, 'key' | 'settings'>>)`, `patchSettings(store, key, patch: Partial<DeviceSettings>)`
  - `toPlayback(raw: NowPlayingRaw | null): Pick<DeviceSettings, 'activeInput' | 'nowPlaying'>`
  - `interface DeviceOptions { socketFactory: SocketFactory; http: HttpFn; store: HeosStore; resolveIp?: (key: string) => Promise<string | null>; cliPort?: number; upnpPort?: number; timeoutMs?: number; backoffMs?: number[]; heartbeatMs?: number; upnpPollMs?: number }`
  - `interface DeviceIdent { key: string; ip: string }`
  - `class HeosDevice`:
    - `constructor(o: DeviceOptions, ident: DeviceIdent)`, `readonly key`, `get state(): DeviceState`
    - `start(): void`, `stop(): void`, `reconnectNow(): void`, `setVisible(v: boolean): void`
    - `refreshUpnp(): Promise<void>`
    - Task 9 adds the command methods.

- [ ] **Step 1: Write the failing tests**

`packages/heos-core/test/now-playing.test.ts`:
```ts
import { expect, it } from 'vitest';
import { toPlayback } from '../src/state/now-playing';

const raw = { type: 'song', song: 'S', artist: 'A', album: 'B', image_url: 'http://x/a.jpg', mid: 'track:1', sid: 4 };

it('maps an input to activeInput with no now-playing strip', () => {
  expect(toPlayback({ ...raw, mid: 'inputs/hdmi_in_2', sid: 1027 })).toEqual({ activeInput: 'inputs/hdmi_in_2', nowPlaying: null });
});

it('maps a stream to now-playing with a source name', () => {
  expect(toPlayback(raw)).toEqual({
    activeInput: null,
    nowPlaying: { sourceId: 4, sourceName: 'Spotify', title: 'S', artist: 'A', album: 'B', artUrl: 'http://x/a.jpg' },
  });
});

it('names unknown sources "Stream" and handles nothing playing', () => {
  expect(toPlayback({ ...raw, sid: 999, image_url: '' }).nowPlaying).toMatchObject({ sourceName: 'Stream', artUrl: null });
  expect(toPlayback(null)).toEqual({ activeInput: null, nowPlaying: null });
  expect(toPlayback({ ...raw, mid: '', song: '' })).toEqual({ activeInput: null, nowPlaying: null });
});
```

`packages/heos-core/test/device-lifecycle.test.ts`:
```ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HeosDevice, type DeviceOptions } from '../src/device';
import { nodeHttp, nodeSocketFactory } from '../src/node';
import { createHeosStore, type HeosStore } from '../src/state/store';
import { FakeHeos } from './fake/fake-heos';
import { waitFor } from './helpers';

const KEY = 'TESTSERIAL0001';
let fake: FakeHeos;
let store: HeosStore;
let dev: HeosDevice | undefined;

const make = (over: Partial<DeviceOptions> = {}, ident = { key: KEY, ip: '127.0.0.1' }) =>
  new HeosDevice(
    { socketFactory: nodeSocketFactory, http: nodeHttp, store, cliPort: fake.cliPort, upnpPort: fake.httpPort, timeoutMs: 300, backoffMs: [20, 40], heartbeatMs: 10_000, upnpPollMs: 50, ...over },
    ident,
  );
const st = () => store.getState().devices[KEY]!;

beforeEach(async () => {
  fake = await FakeHeos.start();
  store = createHeosStore();
});
afterEach(async () => {
  dev?.stop();
  dev = undefined;
  await fake.stop();
});

it('connects, probes and reaches ready with state and a zone', async () => {
  dev = make();
  dev.start();
  await waitFor(() => st().status === 'ready');
  expect(st()).toMatchObject({ pid: 7331878, name: 'Loving room', model: 'Denon DHT-S716H', ip: '127.0.0.1' });
  expect(st().settings).toMatchObject({ volume: 49, mute: false, playState: 'play', activeInput: 'inputs/hdmi_in_1', nowPlaying: null, bass: 5, dialogueLevel: 2 });
  expect(st().caps?.inputs).toHaveLength(8);
  expect(store.getState().zones).toEqual([{ id: `zone:${KEY}`, name: 'Loving room', memberKeys: [KEY] }]);
  expect(fake.count('system/register_for_change_events')).toBe(1);
});

it('is degraded when UPnP is down but the CLI works', async () => {
  fake.upnpDown = true;
  dev = make();
  dev.start();
  await waitFor(() => st().status === 'degraded');
  expect(st().caps?.inputs).toHaveLength(8);
  expect(st().caps?.tone).toBeNull();
});

it('goes offline when the connection drops and reconnects', async () => {
  dev = make();
  dev.start();
  await waitFor(() => st().status === 'ready');
  fake.dropConnections();
  await waitFor(() => fake.connections === 2 && st().status === 'ready');
});

it('drops and recovers the connection when heartbeats stop answering', async () => {
  dev = make({ heartbeatMs: 50, timeoutMs: 100 });
  dev.start();
  await waitFor(() => st().status === 'ready');
  fake.silenced.add('system/heart_beat');
  // The offline window between drop and reconnect is ~20 ms; watch the reconnect instead.
  await waitFor(() => fake.connections >= 2);
  fake.silenced.delete('system/heart_beat');
  await waitFor(() => st().status === 'ready');
});

it('re-discovers a changed IP by key after repeated failures', async () => {
  const resolveIp = vi.fn(async () => '127.0.0.1');
  dev = make({ resolveIp }, { key: KEY, ip: '127.0.0.9' });
  dev.start();
  await waitFor(() => st().status === 'ready');
  expect(resolveIp).toHaveBeenCalledWith(KEY);
  expect(st().ip).toBe('127.0.0.1');
});

it('never reaches ready when the device at the IP has a different key', async () => {
  const resolveIp = vi.fn(async () => null);
  dev = new HeosDevice(
    { socketFactory: nodeSocketFactory, http: nodeHttp, store, cliPort: fake.cliPort, upnpPort: fake.httpPort, timeoutMs: 300, backoffMs: [20], resolveIp },
    { key: 'OTHERSERIAL', ip: '127.0.0.1' },
  );
  dev.start();
  await waitFor(() => resolveIp.mock.calls.length > 0);
  expect(store.getState().devices.OTHERSERIAL!.status).not.toBe('ready');
});

it('reconnectNow reconnects without waiting for backoff', async () => {
  dev = make({ backoffMs: [5000] });
  dev.start();
  await waitFor(() => st().status === 'ready');
  dev.reconnectNow();
  await waitFor(() => fake.connections === 2, 1000);
  await waitFor(() => st().status === 'ready', 1000);
});

it('stop() goes offline and stops reconnecting', async () => {
  dev = make();
  dev.start();
  await waitFor(() => st().status === 'ready');
  dev.stop();
  expect(st().status).toBe('offline');
  const n = fake.connections;
  await new Promise((r) => setTimeout(r, 150));
  expect(fake.connections).toBe(n);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zapbar/heos-core test now-playing device-lifecycle`
Expected: FAIL with unresolved imports `../src/state/now-playing`, `../src/device`, `../src/state/store`.

- [ ] **Step 3: Write the store and now-playing mapping**

`packages/heos-core/src/state/store.ts`:
```ts
import { createStore } from 'zustand/vanilla';
import { EMPTY_SETTINGS, type DeviceSettings, type DeviceState, type Zone } from './types';

export interface HeosState {
  devices: Record<string, DeviceState>;
  zones: Zone[];
}

export const createHeosStore = () => createStore<HeosState>()(() => ({ devices: {}, zones: [] }));
export type HeosStore = ReturnType<typeof createHeosStore>;

export function upsertDevice(store: HeosStore, key: string, patch: Partial<Omit<DeviceState, 'key' | 'settings'>>): void {
  store.setState((s) => {
    const prev: DeviceState = s.devices[key] ?? {
      key, pid: null, name: '', model: '', ip: '', status: 'offline', caps: null, settings: { ...EMPTY_SETTINGS }, lastError: null,
    };
    const next: DeviceState = { ...prev, ...patch };
    const hasZone = s.zones.some((z) => z.memberKeys.includes(key));
    const zones = hasZone
      ? s.zones.map((z) => (z.memberKeys.length === 1 && z.memberKeys[0] === key && next.name ? { ...z, name: next.name } : z))
      : [...s.zones, { id: `zone:${key}`, name: next.name, memberKeys: [key] }];
    return { devices: { ...s.devices, [key]: next }, zones };
  });
}

export function patchSettings(store: HeosStore, key: string, patch: Partial<DeviceSettings>): void {
  store.setState((s) => {
    const d = s.devices[key];
    if (!d) return s;
    return { devices: { ...s.devices, [key]: { ...d, settings: { ...d.settings, ...patch } } } };
  });
}
```

`packages/heos-core/src/state/now-playing.ts`:
```ts
import type { NowPlayingRaw } from '../cli/commands';
import type { DeviceSettings } from './types';

// HEOS source ids (sid) as reported by browse/get_music_sources.
const SOURCE_NAMES: Record<number, string> = {
  1: 'Pandora', 3: 'TuneIn', 4: 'Spotify', 5: 'Deezer', 9: 'SoundCloud', 10: 'Tidal', 13: 'Amazon Music', 30: 'Qobuz', 1024: 'Local Music',
};

/** Inputs light an input tile; anything else is a stream shown in the now-playing strip. */
export function toPlayback(raw: NowPlayingRaw | null): Pick<DeviceSettings, 'activeInput' | 'nowPlaying'> {
  if (!raw || (!raw.mid && !raw.song)) return { activeInput: null, nowPlaying: null };
  if (raw.mid.startsWith('inputs/')) return { activeInput: raw.mid, nowPlaying: null };
  return {
    activeInput: null,
    nowPlaying: {
      sourceId: raw.sid,
      sourceName: SOURCE_NAMES[raw.sid] ?? 'Stream',
      title: raw.song,
      artist: raw.artist,
      album: raw.album,
      artUrl: raw.image_url || null,
    },
  };
}
```

- [ ] **Step 4: Write the device lifecycle**

`packages/heos-core/src/device.ts`:
```ts
import { probeCapabilities } from './capabilities';
import { CLI_PORT, HeosCliClient, type CliEvent } from './cli/client';
import { createCliCommands, deviceKey, type CliCommands, type PlayerInfo } from './cli/commands';
import { toPlayback } from './state/now-playing';
import { patchSettings, upsertDevice, type HeosStore } from './state/store';
import type { ConnectionStatus, DeviceSettings, DeviceState } from './state/types';
import type { HttpFn, SocketFactory } from './transport';
import { getAudioConfig, getTvConfig } from './upnp/act';
import { getBass, getEqPreset, getSubwoofer, getTreble } from './upnp/rendering';
import { UPNP_PORT, UpnpUnreachable, type UpnpEndpoint } from './upnp/soap';

export interface DeviceOptions {
  socketFactory: SocketFactory;
  http: HttpFn;
  store: HeosStore;
  /** Re-discover the device's IP by key; called from the second failed connect onwards. */
  resolveIp?: (key: string) => Promise<string | null>;
  cliPort?: number;
  upnpPort?: number;
  timeoutMs?: number;
  backoffMs?: number[];
  heartbeatMs?: number;
  upnpPollMs?: number;
}

export interface DeviceIdent {
  key: string;
  ip: string;
}

const DEFAULT_BACKOFF = [1000, 2000, 5000, 10000];

export class HeosDevice {
  readonly key: string;
  protected ip: string;
  protected pid: number | null = null;
  protected player: PlayerInfo | null = null;
  protected client: HeosCliClient | null = null;
  protected cmds: CliCommands | null = null;
  protected confirmedVolume = 0;
  private stopped = true;
  private attempt = 0;
  private skipDelay = false;
  private wake: (() => void) | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private visible = false;
  private refreshing = false;

  constructor(protected readonly o: DeviceOptions, ident: DeviceIdent) {
    this.key = ident.key;
    this.ip = ident.ip;
    upsertDevice(o.store, this.key, { ip: this.ip, status: 'offline' });
  }

  get state(): DeviceState {
    return this.o.store.getState().devices[this.key]!;
  }

  protected get ep(): UpnpEndpoint {
    return { http: this.o.http, baseUrl: `http://${this.ip}:${this.o.upnpPort ?? UPNP_PORT}`, timeoutMs: this.o.timeoutMs ?? 3000 };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    this.stopPoll();
    this.client?.close();
    this.wake?.();
    this.setStatus('offline');
  }

  /** App resume or Wi-Fi change: drop the connection and reconnect without backoff. */
  reconnectNow(): void {
    this.attempt = 0;
    this.skipDelay = true;
    this.client?.close();
    this.wake?.();
  }

  /** While visible, UPnP-side settings are polled; HEOS sends no events for them. */
  setVisible(v: boolean): void {
    this.visible = v;
    if (v && this.client && !this.client.isClosed) this.startPoll();
    else this.stopPoll();
  }

  protected setStatus(status: ConnectionStatus): void {
    if (this.state.status !== status) upsertDevice(this.o.store, this.key, { status });
  }

  protected patch(p: Partial<DeviceSettings>): void {
    patchSettings(this.o.store, this.key, p);
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.session();
      } catch {
        // connect or probe failed; fall through to backoff
      }
      this.teardown();
      if (this.stopped) break;
      this.setStatus('offline');
      if (this.skipDelay) {
        this.skipDelay = false;
        continue;
      }
      const backoff = this.o.backoffMs ?? DEFAULT_BACKOFF;
      const delay = backoff[Math.min(this.attempt, backoff.length - 1)]!;
      this.attempt++;
      if (this.attempt >= 2 && this.o.resolveIp) {
        const ip = await this.o.resolveIp(this.key).catch(() => null);
        if (ip && ip !== this.ip) {
          this.ip = ip;
          upsertDevice(this.o.store, this.key, { ip });
        }
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, delay);
        this.wake = () => {
          clearTimeout(t);
          resolve();
        };
      });
      this.wake = null;
    }
  }

  /** Connects, probes, goes ready, then resolves when the connection closes. */
  private async session(): Promise<void> {
    this.setStatus('connecting');
    const client = await HeosCliClient.connect(this.o.socketFactory, this.ip, { port: this.o.cliPort ?? CLI_PORT, timeoutMs: this.o.timeoutMs ?? 3000 });
    const closed = new Promise<void>((r) => client.onClose(() => r()));
    if (this.stopped) {
      client.close();
      return;
    }
    this.client = client;
    const cmds = createCliCommands(client);
    this.cmds = cmds;
    client.onEvent((e) => void this.onEvent(e));
    try {
      this.setStatus('probing');
      const me = (await cmds.getPlayers()).find((p) => deviceKey(p) === this.key);
      if (!me) throw new Error(`device ${this.key} not found at ${this.ip}`);
      this.player = me;
      this.pid = me.pid;
      await cmds.registerForChangeEvents(true);
      const probe = await probeCapabilities(cmds, this.ep, me);
      const volume = await cmds.getVolume(me.pid);
      const mute = await cmds.getMute(me.pid);
      const playState = await cmds.getPlayState(me.pid);
      const np = await cmds.getNowPlaying(me.pid);
      this.confirmedVolume = volume;
      upsertDevice(this.o.store, this.key, { pid: me.pid, name: me.name, model: me.model, ip: this.ip, caps: probe.caps });
      this.patch({ ...probe.settings, volume, mute, playState, ...toPlayback(np) });
      this.setStatus(probe.caps.upnpReachable ? 'ready' : 'degraded');
      this.attempt = 0;
      this.startHeartbeat();
      if (this.visible) this.startPoll();
    } catch (e) {
      client.close();
      throw e;
    }
    await closed;
  }

  private teardown(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.stopPoll();
    this.client = null;
    this.cmds = null;
  }

  private startHeartbeat(): void {
    this.heartbeat = setInterval(() => {
      this.cmds?.heartbeat().catch(() => this.client?.close());
    }, this.o.heartbeatMs ?? 30_000);
  }

  private startPoll(): void {
    this.stopPoll();
    void this.refreshUpnp();
    this.poll = setInterval(() => void this.refreshUpnp(), this.o.upnpPollMs ?? 10_000);
  }

  private stopPoll(): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  /** Re-reads UPnP-side settings; re-probes capabilities if UPnP was unreachable at connect. */
  async refreshUpnp(): Promise<void> {
    const caps = this.state.caps;
    if (!caps || !this.cmds || !this.player || this.refreshing) return;
    this.refreshing = true;
    try {
      if (!caps.upnpReachable) {
        const probe = await probeCapabilities(this.cmds, this.ep, this.player);
        if (probe.caps.upnpReachable) {
          upsertDevice(this.o.store, this.key, { caps: probe.caps });
          this.patch(probe.settings);
          this.setStatus('ready');
        }
        return;
      }
      const p: Partial<DeviceSettings> = {};
      if (caps.tone) {
        p.bass = await getBass(this.ep);
        p.treble = await getTreble(this.ep);
        if (caps.tone.subwoofer) p.subwoofer = await getSubwoofer(this.ep);
      }
      if (caps.eqPresets.length) p.eqPreset = await getEqPreset(this.ep);
      if (caps.soundModes.length) p.soundMode = (await getAudioConfig(this.ep)).soundMode;
      if (caps.dialogue || caps.night) {
        const tv = await getTvConfig(this.ep);
        if (caps.dialogue) p.dialogueLevel = tv.dialogue?.level ?? null;
        if (caps.night) p.nightLevel = tv.night?.level ?? null;
      }
      this.patch(p);
      if (this.state.status === 'degraded') this.setStatus('ready');
    } catch (e) {
      if (e instanceof UpnpUnreachable && this.state.status === 'ready') this.setStatus('degraded');
    } finally {
      this.refreshing = false;
    }
  }

  protected async onEvent(_e: CliEvent): Promise<void> {
    // Task 9 handles device events.
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @zapbar/heos-core test && pnpm typecheck`
Expected: all PASS (3 now-playing tests, 8 lifecycle tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(heos-core): zustand store with zones and the device connection state machine

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Device commands, events, polling

**Files:**
- Modify: `packages/heos-core/src/device.ts` (replace the `onEvent` stub and add command methods)
- Test: `packages/heos-core/test/device-commands.test.ts`

**Interfaces:**
- Consumes: `HeosDevice` internals from Task 8 (`cmds`, `pid`, `ep`, `patch`, `setStatus`, `confirmedVolume`, `refreshUpnp`); `CliError`; `setBass`, `setTreble`, `setSubwoofer`, `selectEqPreset`, `TONE_RANGE`; `setAudioConfig`, `setTvConfig`; `clamp`.
- Produces these `HeosDevice` methods, all returning `Promise<boolean>`:
  - `setVolume(level)`, `volumeStep(delta)`, `setMute(on)`
  - `playInput(mid)`, `setPlayState(s: PlayState)`, `next()`, `previous()`, `recallQuickSelect(id)`
  - `setBass(v)`, `setTreble(v)`, `setSubwoofer(v)`, `resetTone()`, `selectEqPreset(id)`
  - `setSoundMode(mode)`, `setDialogue(level)`, `setNight(level)`
  - `true` means the device accepted the command. `false` means it was not sent (offline or unsupported) or it failed; failures are reported in `state.lastError`.

- [ ] **Step 1: Write the failing tests**

`packages/heos-core/test/device-commands.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HeosDevice } from '../src/device';
import { nodeHttp, nodeSocketFactory } from '../src/node';
import { createHeosStore, type HeosStore } from '../src/state/store';
import { FakeHeos } from './fake/fake-heos';
import { waitFor } from './helpers';

const KEY = 'TESTSERIAL0001';
const PID = 7331878;
let fake: FakeHeos;
let store: HeosStore;
let dev: HeosDevice;
const st = () => store.getState().devices[KEY]!;

async function ready(status: 'ready' | 'degraded' = 'ready') {
  dev = new HeosDevice(
    { socketFactory: nodeSocketFactory, http: nodeHttp, store, cliPort: fake.cliPort, upnpPort: fake.httpPort, timeoutMs: 500, backoffMs: [20], upnpPollMs: 50 },
    { key: KEY, ip: '127.0.0.1' },
  );
  dev.start();
  await waitFor(() => st().status === status);
}

beforeEach(async () => {
  fake = await FakeHeos.start();
  store = createHeosStore();
});
afterEach(async () => {
  dev?.stop();
  await fake.stop();
});

describe('CLI commands', () => {
  it('applies mute optimistically before the device confirms', async () => {
    await ready();
    const p = dev.setMute(true);
    expect(st().settings.mute).toBe(true);
    expect(await p).toBe(true);
    expect(fake.state.mute).toBe(true);
  });

  it('switches input and keeps it after the now-playing event', async () => {
    await ready();
    expect(await dev.playInput('inputs/hdmi_in_2')).toBe(true);
    expect(fake.state.nowPlayingMid).toBe('inputs/hdmi_in_2');
    await new Promise((r) => setTimeout(r, 50));
    expect(st().settings.activeInput).toBe('inputs/hdmi_in_2');
  });

  it("rolls back and reports the device's error", async () => {
    await ready();
    fake.failNext('browse/play_input', '2', 'Invalid input');
    expect(await dev.playInput('inputs/hdmi_in_4')).toBe(false);
    expect(st().settings.activeInput).toBe('inputs/hdmi_in_1');
    expect(st().lastError?.text).toBe("Couldn't change input: Invalid input");
  });

  it('reports a timeout as "soundbar didn\'t respond" and rolls back', async () => {
    await ready();
    fake.silenced.add('player/set_mute');
    expect(await dev.setMute(true)).toBe(false);
    expect(st().settings.mute).toBe(false);
    expect(st().lastError?.text).toBe("Couldn't change mute, soundbar didn't respond");
  });

  it('coalesces a rapid volume drag and lands on the last value', async () => {
    await ready();
    const calls: Promise<boolean>[] = [];
    for (let v = 10; v <= 30; v++) calls.push(dev.setVolume(v));
    await Promise.all(calls);
    await waitFor(() => fake.state.volume === 30);
    expect(fake.count('player/set_volume')).toBeLessThan(21);
    expect(st().settings.volume).toBe(30);
  });

  it('volumeStep moves relative to the current volume and clamps', async () => {
    await ready();
    await dev.volumeStep(5);
    expect(fake.state.volume).toBe(54);
    await dev.setVolume(250);
    expect(fake.state.volume).toBe(100);
  });

  it('applies external changes from device events', async () => {
    await ready();
    fake.state.volume = 12;
    fake.emit('player_volume_changed', { pid: PID, level: 12, mute: 'on' });
    await waitFor(() => st().settings.volume === 12);
    expect(st().settings.mute).toBe(true);
  });

  it('ignores events for other players', async () => {
    await ready();
    fake.emit('player_volume_changed', { pid: 999, level: 1, mute: 'on' });
    await new Promise((r) => setTimeout(r, 50));
    expect(st().settings.volume).toBe(49);
  });

  it('shows a stream in now-playing when the source changes', async () => {
    await ready();
    fake.state.nowPlayingMid = 'spotify:track:1';
    fake.emit('player_now_playing_changed', { pid: PID });
    await waitFor(() => st().settings.nowPlaying !== null);
    expect(st().settings).toMatchObject({ activeInput: null, nowPlaying: { title: 'Fake Song', sourceName: 'Spotify' } });
  });

  it('sends nothing while offline', async () => {
    await ready();
    dev.stop();
    const before = fake.received.length;
    expect(await dev.setVolume(10)).toBe(false);
    expect(await dev.setBass(7)).toBe(false);
    expect(fake.received.length).toBe(before);
  });
});

describe('UPnP commands', () => {
  it('sets tone, sound mode, dialogue and night', async () => {
    await ready();
    expect(await dev.setBass(8)).toBe(true);
    expect(await dev.setTreble(2)).toBe(true);
    expect(await dev.setSubwoofer(20)).toBe(true);
    expect(await dev.setSoundMode('MUSIC_NORMAL')).toBe(true);
    expect(await dev.setDialogue(3)).toBe(true);
    expect(await dev.setNight(1)).toBe(true);
    expect(fake.state).toMatchObject({ bass: 8, treble: 2, subwoofer: 20, soundMode: 'MUSIC_NORMAL', dialogueLevel: 3, nightLevel: 1 });
    expect(st().settings).toMatchObject({ bass: 8, treble: 2, subwoofer: 20, soundMode: 'MUSIC_NORMAL', dialogueLevel: 3, nightLevel: 1 });
  });

  it('resets tone to neutral and selects an EQ preset', async () => {
    await ready();
    await dev.setBass(9);
    expect(await dev.resetTone()).toBe(true);
    expect(fake.state).toMatchObject({ bass: 5, treble: 5 });
    expect(await dev.selectEqPreset('Jazz')).toBe(true);
    expect(st().settings.eqPreset).toBe('Jazz');
  });

  it('blocks UPnP commands while degraded but keeps CLI commands working', async () => {
    fake.upnpDown = true;
    await ready('degraded');
    expect(await dev.setBass(7)).toBe(false);
    expect(st().lastError?.text).toBe('Soundbar settings unavailable');
    expect(await dev.setVolume(20)).toBe(true);
    expect(fake.state.volume).toBe(20);
  });

  it('polls UPnP settings while visible', async () => {
    await ready();
    dev.setVisible(true);
    fake.state.bass = 8;
    await waitFor(() => st().settings.bass === 8);
    dev.setVisible(false);
  });

  it('recovers from degraded to ready when UPnP comes back', async () => {
    fake.upnpDown = true;
    await ready('degraded');
    dev.setVisible(true);
    fake.upnpDown = false;
    await waitFor(() => st().status === 'ready');
    expect(st().caps?.tone).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zapbar/heos-core test device-commands`
Expected: FAIL with "dev.setMute is not a function" (and similar).

- [ ] **Step 3: Write the implementation**

In `packages/heos-core/src/device.ts`, extend the imports:
```ts
import { CLI_PORT, CliError, HeosCliClient, type CliEvent } from './cli/client';
import { createCliCommands, deviceKey, type CliCommands, type PlayState, type PlayerInfo } from './cli/commands';
import { getAudioConfig, getTvConfig, setAudioConfig, setTvConfig } from './upnp/act';
import { getBass, getEqPreset, getSubwoofer, getTreble, selectEqPreset, setBass, setSubwoofer, setTreble, TONE_RANGE } from './upnp/rendering';
import { clamp } from './util';
```

Add these private fields next to the others:
```ts
  private errorSeq = 0;
  private volumeInFlight = false;
  private volumePending: number | null = null;
```

Replace the `onEvent` stub with the following, and add the command methods to the class:
```ts
  protected async onEvent(e: CliEvent): Promise<void> {
    const pid = this.pid;
    const cmds = this.cmds;
    if (pid === null || !cmds) return;
    // Events are system-wide on every HEOS connection; keep only this player's.
    if (e.message.pid !== undefined && Number(e.message.pid) !== pid) return;
    switch (e.event) {
      case 'player_volume_changed': {
        const level = Number(e.message.level);
        if (Number.isFinite(level)) {
          this.confirmedVolume = level;
          if (!this.volumeInFlight) this.patch({ volume: level });
        }
        this.patch({ mute: e.message.mute === 'on' });
        break;
      }
      case 'player_state_changed': {
        const s = e.message.state;
        this.patch({ playState: s === 'play' || s === 'pause' ? s : 'stop' });
        break;
      }
      case 'player_now_playing_changed': {
        const np = await cmds.getNowPlaying(pid).catch(() => undefined);
        if (np !== undefined) this.patch(toPlayback(np));
        break;
      }
      case 'players_changed': {
        const me = (await cmds.getPlayers().catch(() => [])).find((p) => deviceKey(p) === this.key);
        if (me) upsertDevice(this.o.store, this.key, { name: me.name });
        break;
      }
    }
  }

  private report(text: string): void {
    upsertDevice(this.o.store, this.key, { lastError: { id: ++this.errorSeq, text } });
  }

  private failText(base: string, e: unknown): string {
    return e instanceof CliError && e.text ? `${base}: ${e.text}` : `${base}, soundbar didn't respond`;
  }

  private cli(): CliCommands | null {
    const s = this.state.status;
    return (s === 'ready' || s === 'degraded') && this.cmds && this.pid !== null ? this.cmds : null;
  }

  private upnpAllowed(): boolean {
    if (this.state.status === 'ready') return true;
    if (this.state.status === 'degraded') this.report('Soundbar settings unavailable');
    return false;
  }

  /** Patch the store now; roll back on failure unless something newer already replaced the value. */
  private async optimistic<K extends keyof DeviceSettings>(
    key: K,
    value: DeviceSettings[K],
    kind: 'cli' | 'upnp',
    action: () => Promise<unknown>,
    failBase: string,
  ): Promise<boolean> {
    if (kind === 'cli' ? !this.cli() : !this.upnpAllowed()) return false;
    const prev = this.state.settings[key];
    this.patch({ [key]: value } as Partial<DeviceSettings>);
    try {
      await action();
      return true;
    } catch (e) {
      if (this.state.settings[key] === value) this.patch({ [key]: prev } as Partial<DeviceSettings>);
      if (e instanceof UpnpUnreachable) this.setStatus('degraded');
      this.report(this.failText(failBase, e));
      return false;
    }
  }

  private async run(kind: 'cli' | 'upnp', action: () => Promise<unknown>, failBase: string): Promise<boolean> {
    if (kind === 'cli' ? !this.cli() : !this.upnpAllowed()) return false;
    try {
      await action();
      return true;
    } catch (e) {
      if (e instanceof UpnpUnreachable) this.setStatus('degraded');
      this.report(this.failText(failBase, e));
      return false;
    }
  }

  /** Slider-safe: while a set is in flight, only the latest requested level is sent next. */
  async setVolume(level: number): Promise<boolean> {
    const cmds = this.cli();
    if (!cmds) return false;
    const target = clamp(Math.round(level), 0, 100);
    this.patch({ volume: target });
    if (this.volumeInFlight) {
      this.volumePending = target;
      return true;
    }
    this.volumeInFlight = true;
    let next: number | null = target;
    try {
      while (next !== null) {
        this.volumePending = null;
        await cmds.setVolume(this.pid!, next);
        this.confirmedVolume = next;
        next = this.volumePending;
      }
      return true;
    } catch (e) {
      this.patch({ volume: this.confirmedVolume });
      this.report(this.failText("Couldn't change volume", e));
      return false;
    } finally {
      this.volumeInFlight = false;
      this.volumePending = null;
    }
  }

  volumeStep(delta: number): Promise<boolean> {
    return this.setVolume(this.state.settings.volume + delta);
  }

  setMute(on: boolean): Promise<boolean> {
    return this.optimistic('mute', on, 'cli', () => this.cmds!.setMute(this.pid!, on), "Couldn't change mute");
  }

  playInput(mid: string): Promise<boolean> {
    return this.optimistic('activeInput', mid, 'cli', async () => {
      await this.cmds!.playInput(this.pid!, mid);
      this.patch({ nowPlaying: null });
    }, "Couldn't change input");
  }

  setPlayState(s: PlayState): Promise<boolean> {
    return this.optimistic('playState', s, 'cli', () => this.cmds!.setPlayState(this.pid!, s), "Couldn't change playback");
  }

  next(): Promise<boolean> {
    return this.run('cli', () => this.cmds!.playNext(this.pid!), "Couldn't skip");
  }

  previous(): Promise<boolean> {
    return this.run('cli', () => this.cmds!.playPrevious(this.pid!), "Couldn't go back");
  }

  recallQuickSelect(id: number): Promise<boolean> {
    return this.run('cli', () => this.cmds!.playQuickSelect(this.pid!, id), "Couldn't recall Quick Select");
  }

  setBass(v: number): Promise<boolean> {
    const n = clamp(Math.round(v), TONE_RANGE.bass.min, TONE_RANGE.bass.max);
    return this.optimistic('bass', n, 'upnp', () => setBass(this.ep, n), "Couldn't change bass");
  }

  setTreble(v: number): Promise<boolean> {
    const n = clamp(Math.round(v), TONE_RANGE.treble.min, TONE_RANGE.treble.max);
    return this.optimistic('treble', n, 'upnp', () => setTreble(this.ep, n), "Couldn't change treble");
  }

  setSubwoofer(v: number): Promise<boolean> {
    const n = clamp(Math.round(v), TONE_RANGE.subwoofer.min, TONE_RANGE.subwoofer.max);
    return this.optimistic('subwoofer', n, 'upnp', () => setSubwoofer(this.ep, n), "Couldn't change subwoofer");
  }

  async resetTone(): Promise<boolean> {
    const bass = await this.setBass(TONE_RANGE.bass.neutral);
    const treble = await this.setTreble(TONE_RANGE.treble.neutral);
    return bass && treble;
  }

  selectEqPreset(id: string): Promise<boolean> {
    return this.optimistic('eqPreset', id, 'upnp', async () => {
      await selectEqPreset(this.ep, id);
      await this.refreshUpnp();
    }, "Couldn't change EQ preset");
  }

  setSoundMode(mode: string): Promise<boolean> {
    return this.optimistic('soundMode', mode, 'upnp', () => setAudioConfig(this.ep, { soundMode: mode }), "Couldn't change sound mode");
  }

  setDialogue(level: number): Promise<boolean> {
    const r = this.state.caps?.dialogue;
    if (!r) return Promise.resolve(false);
    const n = clamp(Math.round(level), r.min, r.max);
    return this.optimistic('dialogueLevel', n, 'upnp', () => setTvConfig(this.ep, { dialogueLevel: n }), "Couldn't change dialogue enhancer");
  }

  setNight(level: number): Promise<boolean> {
    const r = this.state.caps?.night;
    if (!r) return Promise.resolve(false);
    const n = clamp(Math.round(level), r.min, r.max);
    return this.optimistic('nightLevel', n, 'upnp', () => setTvConfig(this.ep, { nightLevel: n }), "Couldn't change night mode");
  }
```

`selectEqPreset` calls `refreshUpnp()`, which returns early while a poll is in flight. That's acceptable: the next poll picks up the preset's tone change.

The test "sets tone, sound mode, dialogue and night" calls `setDialogue(3)` and `setNight(1)`. If the probe ranges in Task 6 cap dialogue below 3 or night below 1, change those two arguments and their expectations to the probe's `max` values.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @zapbar/heos-core test && pnpm typecheck`
Expected: all PASS (15 new command tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(heos-core): optimistic device commands, volume coalescing, events and UPnP polling

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Discovery helpers

**Files:**
- Create: `packages/heos-core/src/discovery/ssdp.ts`, `packages/heos-core/src/node/ssdp.ts`
- Modify: `packages/heos-core/src/node/index.ts`
- Test: `packages/heos-core/test/discovery.test.ts`

**Interfaces:**
- Consumes: `HeosCliClient`, `CLI_PORT`, `createCliCommands`, `deviceKey`, `SocketFactory`.
- Produces:
  - `SSDP_ADDR = '239.255.255.250'`, `SSDP_PORT = 1900`, `HEOS_ST = 'urn:schemas-denon-com:device:ACT-Denon:1'`
  - `buildMSearch(mx?: number): string`
  - `interface SsdpHit { ip: string; location: string }`, `parseSsdpResponse(text: string, fromIp: string): SsdpHit | null`
  - `uniqueIps(hits: SsdpHit[]): string[]`
  - `interface FoundPlayer extends PlayerInfo { key: string }`
  - `listPlayers(ips: string[], factory: SocketFactory, port?: number): Promise<FoundPlayer[]>`: every player in the HEOS system(s) reachable through the given IPs, de-duplicated by key. First run (Plan 2) uses this.
  - `findIpByKey(ips: string[], key: string, factory: SocketFactory, port?: number): Promise<string | null>`
  - Node only: `nodeSsdpSearch(timeoutMs?: number): Promise<SsdpHit[]>`

- [ ] **Step 1: Write the failing test**

`packages/heos-core/test/discovery.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMSearch, findIpByKey, HEOS_ST, listPlayers, parseSsdpResponse, uniqueIps } from '../src/discovery/ssdp';
import { nodeSocketFactory } from '../src/node';
import { FakeHeos } from './fake/fake-heos';

const RESPONSE = [
  'HTTP/1.1 200 OK',
  'CACHE-CONTROL: max-age=180',
  'LOCATION: http://10.0.0.82:60006/upnp/desc/aios_device/aios_device.xml',
  `ST: ${HEOS_ST}`,
  'USN: uuid:test::urn:schemas-denon-com:device:ACT-Denon:1',
  '',
  '',
].join('\r\n');

it('builds an M-SEARCH for HEOS devices', () => {
  const m = buildMSearch();
  expect(m.startsWith('M-SEARCH * HTTP/1.1\r\n')).toBe(true);
  expect(m).toContain(`ST: ${HEOS_ST}\r\n`);
  expect(m.endsWith('\r\n\r\n')).toBe(true);
});

it('parses a HEOS SSDP response and rejects others', () => {
  expect(parseSsdpResponse(RESPONSE, '10.0.0.82')).toEqual({ ip: '10.0.0.82', location: 'http://10.0.0.82:60006/upnp/desc/aios_device/aios_device.xml' });
  expect(parseSsdpResponse(RESPONSE.replace(HEOS_ST, 'upnp:rootdevice'), '10.0.0.5')).toBeNull();
  expect(parseSsdpResponse('NOTIFY * HTTP/1.1\r\n\r\n', '10.0.0.5')).toBeNull();
});

it('de-duplicates IPs', () => {
  expect(uniqueIps([{ ip: 'a', location: '1' }, { ip: 'a', location: '2' }, { ip: 'b', location: '3' }])).toEqual(['a', 'b']);
});

describe('against the fake device', () => {
  let fake: FakeHeos;
  beforeEach(async () => { fake = await FakeHeos.start(); });
  afterEach(() => fake.stop());

  it('lists players through any reachable IP', async () => {
    const players = await listPlayers(['127.0.0.9', '127.0.0.1'], nodeSocketFactory, fake.cliPort);
    expect(players).toEqual([expect.objectContaining({ key: 'TESTSERIAL0001', name: 'Loving room', ip: '127.0.0.1' })]);
  });

  it('finds the current IP of a device by key', async () => {
    expect(await findIpByKey(['127.0.0.9', '127.0.0.1'], 'TESTSERIAL0001', nodeSocketFactory, fake.cliPort)).toBe('127.0.0.1');
    expect(await findIpByKey(['127.0.0.1'], 'UNKNOWN', nodeSocketFactory, fake.cliPort)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zapbar/heos-core test discovery`
Expected: FAIL with an unresolved import `../src/discovery/ssdp`.

- [ ] **Step 3: Write the implementation**

`packages/heos-core/src/discovery/ssdp.ts`:
```ts
import { CLI_PORT, HeosCliClient } from '../cli/client';
import { createCliCommands, deviceKey, type PlayerInfo } from '../cli/commands';
import type { SocketFactory } from '../transport';

export const SSDP_ADDR = '239.255.255.250';
export const SSDP_PORT = 1900;
export const HEOS_ST = 'urn:schemas-denon-com:device:ACT-Denon:1';

export interface SsdpHit {
  ip: string;
  location: string;
}

export interface FoundPlayer extends PlayerInfo {
  key: string;
}

export function buildMSearch(mx = 2): string {
  return ['M-SEARCH * HTTP/1.1', `HOST: ${SSDP_ADDR}:${SSDP_PORT}`, 'MAN: "ssdp:discover"', `MX: ${mx}`, `ST: ${HEOS_ST}`, '', ''].join('\r\n');
}

export function parseSsdpResponse(text: string, fromIp: string): SsdpHit | null {
  const lines = text.split(/\r?\n/);
  if (!/^HTTP\/1\.1 200/i.test(lines[0] ?? '')) return null;
  const headers: Record<string, string> = {};
  for (const l of lines.slice(1)) {
    const i = l.indexOf(':');
    if (i > 0) headers[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
  }
  if (headers.st !== HEOS_ST || !headers.location) return null;
  return { ip: fromIp, location: headers.location };
}

export const uniqueIps = (hits: SsdpHit[]): string[] => [...new Set(hits.map((h) => h.ip))];

// get_players on any HEOS device lists every player in that HEOS system, with its IP.
export async function listPlayers(ips: string[], factory: SocketFactory, port = CLI_PORT): Promise<FoundPlayer[]> {
  const found = new Map<string, FoundPlayer>();
  for (const ip of ips) {
    let client: HeosCliClient | null = null;
    try {
      client = await HeosCliClient.connect(factory, ip, { port, timeoutMs: 2000 });
      for (const p of await createCliCommands(client).getPlayers()) {
        const key = deviceKey(p);
        if (!found.has(key)) found.set(key, { ...p, key, ip: p.ip || ip });
      }
    } catch {
      // unreachable or not HEOS; try the next IP
    } finally {
      client?.close();
    }
  }
  return [...found.values()];
}

export async function findIpByKey(ips: string[], key: string, factory: SocketFactory, port = CLI_PORT): Promise<string | null> {
  const players = await listPlayers(ips, factory, port);
  return players.find((p) => p.key === key)?.ip ?? null;
}
```

`packages/heos-core/src/node/ssdp.ts`:
```ts
import dgram from 'node:dgram';
import { buildMSearch, parseSsdpResponse, SSDP_ADDR, SSDP_PORT, type SsdpHit } from '../discovery/ssdp';

export function nodeSsdpSearch(timeoutMs = 3000): Promise<SsdpHit[]> {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const hits: SsdpHit[] = [];
    const finish = () => {
      try {
        sock.close();
      } catch {
        // already closed
      }
      resolve(hits);
    };
    sock.on('message', (msg, rinfo) => {
      const h = parseSsdpResponse(msg.toString(), rinfo.address);
      if (h) hits.push(h);
    });
    sock.on('error', finish);
    sock.bind(0, () => {
      sock.setMulticastTTL(2);
      const m = Buffer.from(buildMSearch());
      sock.send(m, SSDP_PORT, SSDP_ADDR);
      setTimeout(() => sock.send(m, SSDP_PORT, SSDP_ADDR), 500);
    });
    setTimeout(finish, timeoutMs);
  });
}
```

`packages/heos-core/src/node/index.ts`:
```ts
export { nodeSsdpSearch } from './ssdp';
export { nodeHttp, nodeSocketFactory } from './transport';
```

- [ ] **Step 4: Run tests, typecheck, and a live discovery check**

Run: `pnpm --filter @zapbar/heos-core test && pnpm typecheck`
Expected: all PASS.

Run: `cd packages/heos-core && pnpm exec tsx -e "import { nodeSsdpSearch } from './src/node'; console.log(await nodeSsdpSearch());"`
Expected: `[ { ip: '10.0.0.82', location: 'http://10.0.0.82:60006/upnp/desc/aios_device/aios_device.xml' }, ... ]`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(heos-core): SSDP discovery, player listing and IP re-resolution by key

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Public API, live smoke test, README

**Files:**
- Create: `packages/heos-core/src/index.ts`, `packages/heos-core/scripts/smoke.ts`, `packages/heos-core/README.md`
- Test: `packages/heos-core/test/index.test.ts`

**Interfaces:**
- Consumes: everything.
- Produces: the `@zapbar/heos-core` public API that Plans 2–3 import. `@zapbar/heos-core/node` stays separate.

- [ ] **Step 1: Write the failing test**

`packages/heos-core/test/index.test.ts`:
```ts
import { expect, it } from 'vitest';
import * as core from '../src';

it('exports the public API', () => {
  for (const name of [
    'HeosDevice', 'createHeosStore', 'upsertDevice', 'patchSettings', 'probeCapabilities', 'toPlayback',
    'HeosCliClient', 'createCliCommands', 'deviceKey', 'CliError', 'TimeoutError', 'DisconnectedError',
    'buildMSearch', 'parseSsdpResponse', 'uniqueIps', 'listPlayers', 'findIpByKey', 'HEOS_ST',
    'TONE_RANGE', 'presetLabel', 'DIALOGUE_RANGE', 'NIGHT_RANGE', 'UpnpFault', 'UpnpUnreachable', 'EMPTY_SETTINGS',
  ]) {
    expect(core, name).toHaveProperty(name);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zapbar/heos-core test index`
Expected: FAIL with an unresolved import `../src`.

- [ ] **Step 3: Write the public API**

`packages/heos-core/src/index.ts`:
```ts
export { probeCapabilities, type Capabilities, type Range } from './capabilities';
export { CLI_PORT, CliError, DisconnectedError, HeosCliClient, TimeoutError, type CliEvent, type CliResponse } from './cli/client';
export { createCliCommands, deviceKey, type CliCommands, type InputSource, type NowPlayingRaw, type PlayerInfo, type PlayState, type QuickSelect } from './cli/commands';
export { HeosDevice, type DeviceIdent, type DeviceOptions } from './device';
export { buildMSearch, findIpByKey, HEOS_ST, listPlayers, parseSsdpResponse, SSDP_ADDR, SSDP_PORT, uniqueIps, type FoundPlayer, type SsdpHit } from './discovery/ssdp';
export { toPlayback } from './state/now-playing';
export { createHeosStore, patchSettings, upsertDevice, type HeosState, type HeosStore } from './state/store';
export { EMPTY_SETTINGS, type ConnectionStatus, type DeviceError, type DeviceSettings, type DeviceState, type NowPlaying, type PlaybackTarget, type Zone } from './state/types';
export type { HttpFn, HttpRequest, LineSocket, SocketFactory } from './transport';
export { DIALOGUE_RANGE, NIGHT_RANGE } from './upnp/act';
export { presetLabel, TONE_RANGE } from './upnp/rendering';
export { UPNP_PORT, UpnpFault, UpnpUnreachable } from './upnp/soap';
```

- [ ] **Step 4: Write the live smoke script**

`packages/heos-core/scripts/smoke.ts`:
```ts
/**
 * End-to-end check against a real soundbar: discover, connect, print state, nudge volume and restore.
 * Usage (from packages/heos-core): pnpm exec tsx scripts/smoke.ts [ip]
 */
import { createHeosStore, HeosDevice, listPlayers, presetLabel, uniqueIps } from '../src';
import { nodeHttp, nodeSocketFactory, nodeSsdpSearch } from '../src/node';
import { sleep } from '../src/util';

const ips = process.argv[2] ? [process.argv[2]] : uniqueIps(await nodeSsdpSearch());
console.log('candidate IPs:', ips);
const players = await listPlayers(ips, nodeSocketFactory);
const target = players[0];
if (!target) throw new Error('no HEOS player found');
console.log(`found ${players.length} player(s); using "${target.name}" (${target.model}) at ${target.ip}`);

const store = createHeosStore();
const dev = new HeosDevice({ socketFactory: nodeSocketFactory, http: nodeHttp, store }, { key: target.key, ip: target.ip });
dev.start();
const t0 = Date.now();
while (!['ready', 'degraded'].includes(dev.state.status)) {
  if (Date.now() - t0 > 10_000) throw new Error(`stuck in ${dev.state.status}`);
  await sleep(100);
}
const { caps, settings, status } = dev.state;
console.log('status:', status);
console.log('inputs:', caps?.inputs.map((i) => i.name).join(', '));
console.log('quick selects in use:', caps?.quickSelects.filter((q) => q.used).map((q) => q.name).join(', ') || 'none');
console.log('eq presets:', caps?.eqPresets.map(presetLabel).join(', '));
console.log('sound modes:', caps?.soundModes.join(', '));
console.log('settings:', JSON.stringify(settings));

const v0 = settings.volume;
console.log(`volume ${v0} → ${v0 + 1}:`, await dev.setVolume(v0 + 1));
await sleep(800);
console.log(`volume back to ${v0}:`, await dev.setVolume(v0));
await sleep(500);
console.log('final volume:', dev.state.settings.volume, dev.state.settings.volume === v0 ? 'OK' : 'MISMATCH');
dev.stop();
process.exit(0);
```

- [ ] **Step 5: Write the package README**

`packages/heos-core/README.md`:
````markdown
# @zapbar/heos-core

Pure-TypeScript control of HEOS soundbars and speakers. It has no React Native or Node dependencies; I/O is injected.

- **HEOS CLI** (TCP 1255): players, volume, mute, transport, inputs, Quick Selects, change events.
- **UPnP SOAP** (HTTP 60006): bass, treble, subwoofer, EQ presets, sound mode, dialogue enhancer, night mode.
- **`HeosDevice`**: the connection state machine (`connecting → probing → ready ⇄ degraded → offline`), optimistic commands with rollback, and slider-safe volume, all writing into a zustand vanilla store keyed by serial.

```ts
import { createHeosStore, HeosDevice, listPlayers } from '@zapbar/heos-core';
import { nodeHttp, nodeSocketFactory } from '@zapbar/heos-core/node'; // React Native supplies its own transports

const store = createHeosStore();
const [p] = await listPlayers(['10.0.0.82'], nodeSocketFactory);
const dev = new HeosDevice({ socketFactory: nodeSocketFactory, http: nodeHttp, store }, { key: p.key, ip: p.ip });
dev.start();
await dev.playInput('inputs/hdmi_in_2');
```

## Scripts
- `pnpm test`: Vitest against an in-process fake HEOS device.
- `pnpm exec tsx scripts/smoke.ts [ip]`: live end-to-end check (nudges volume by 1 and restores it).
- `pnpm exec tsx scripts/probe-writes.ts <ip> [--quickselect] [--spotify] [--listen N]`: live write-probe; results in `docs/probe-results.md`.

## Rules
- Never call `system/check_account`: it returns the HEOS account e-mail.
- Fixtures use `TESTSERIAL0001`, never a real serial.
````

- [ ] **Step 6: Run everything**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS, about 80 tests.

Run: `cd packages/heos-core && pnpm exec tsx scripts/smoke.ts`
Expected:
- `status: ready`.
- 8 inputs listed.
- `quick selects in use: Watch TV`.
- 5 EQ presets with "Acoustic" spelled correctly.
- Two sound modes.
- `final volume: <v0> OK`.

- [ ] **Step 7: Commit and push**

```bash
cd ~/projects/zapbar
git add -A
git commit -m "feat(heos-core): public API, live smoke script, README

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push
```
Expected: Gitea CI (`.gitea/workflows/ci.yml`) runs typecheck and tests green on `main`.
