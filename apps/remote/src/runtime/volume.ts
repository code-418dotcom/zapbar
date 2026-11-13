import type { Appearance } from '../theme';

export const DAD_CAP = 30;

/** Limit a requested volume to `cap`, but never raise a volume that is already above it. */
export function capped(target: number, current: number, cap: number): number {
  if (target <= cap) return target;
  return Math.max(cap, Math.min(current, target));
}

export const capFor = (a: Appearance): number => (a.dad ? DAD_CAP : 100);

/** This one goes to 11. */
export const elevenOf = (v: number): number => Math.round((v * 11) / 100);
