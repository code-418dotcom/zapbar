import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

const PIECES = 24;
const DURATION = 1200;

export interface Origin {
  x: number;
  y: number;
}

interface Piece {
  key: number;
  color: string;
  dx: number;
  fall: number;
  spin: number;
  size: number;
  progress: Animated.Value;
}

export function Confetti({ burstId, origin }: { burstId: number; origin: Origin | null }) {
  const { c } = useTheme();
  const [reduce, setReduce] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const colors = useRef([c.accent, c.warn, c.danger, c.text]);
  colors.current = [c.accent, c.warn, c.danger, c.text];

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => live && setReduce(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  // A burst is played at most once, even if reduce-motion suppressed it: turning reduce-motion off later must not replay it.
  const lastPlayed = useRef(0);
  useEffect(() => {
    if (burstId === 0 || burstId === lastPlayed.current) {
      setPieces([]);
      return;
    }
    lastPlayed.current = burstId;
    if (reduce) {
      setPieces([]);
      return;
    }
    const next: Piece[] = Array.from({ length: PIECES }, (_, i) => ({
      key: i,
      color: colors.current[i % colors.current.length]!,
      dx: (Math.random() * 2 - 1) * 120,
      fall: 300 + Math.random() * 200,
      spin: (Math.random() * 2 - 1) * 720,
      size: 6 + Math.random() * 6,
      progress: new Animated.Value(0),
    }));
    setPieces(next);
    const run = Animated.parallel(
      next.map((p) => Animated.timing(p.progress, { toValue: 1, duration: DURATION, easing: Easing.out(Easing.quad), useNativeDriver: true })),
    );
    run.start();
    const t = setTimeout(() => setPieces([]), DURATION);
    return () => {
      clearTimeout(t);
      run.stop();
    };
  }, [burstId, reduce]);

  if (reduce || pieces.length === 0) return null;
  const x0 = origin?.x ?? 0;
  const y0 = origin?.y ?? 0;
  return (
    <>
      {pieces.map((p) => (
        <Animated.View
          key={p.key}
          testID="confetti-piece"
          pointerEvents="none"
          style={[
            styles.piece,
            {
              left: x0,
              top: y0,
              width: p.size,
              height: p.size * 0.6,
              backgroundColor: p.color,
              opacity: p.progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateX: p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                { translateY: p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.fall] }) },
                { rotate: p.progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
              ],
            },
          ]}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({ piece: { position: 'absolute' } });
