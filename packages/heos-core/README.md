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
- EQ presets are offered only on devices that report a current preset. On the DHT-S716H, `SelectPreset` has no effect.
