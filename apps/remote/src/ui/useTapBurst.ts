import { useCallback, useRef } from 'react';

/** Returns a tap handler that fires `onBurst` when `count` taps land within `windowMs`, then resets. */
export function useTapBurst(count: number, windowMs: number, onBurst: () => void): () => void {
  const taps = useRef<number[]>([]);
  const burst = useRef(onBurst);
  burst.current = onBurst;
  return useCallback(() => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t <= windowMs), now];
    if (taps.current.length >= count) {
      taps.current = [];
      burst.current();
    }
  }, [count, windowMs]);
}
