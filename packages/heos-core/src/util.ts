export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
