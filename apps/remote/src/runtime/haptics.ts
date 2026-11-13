import type { QuickNative } from '../../modules/zapbar-quick';

/** A light haptic tick. Best effort: a missing module or a failed call stays silent. */
export function tick(): void {
  try {
    const quick = require('../../modules/zapbar-quick').default as QuickNative;
    quick.tick().catch(() => undefined);
  } catch {
    // no native module (web, tests without the mock)
  }
}
