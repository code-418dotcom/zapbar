import type { ComponentProps } from 'react';
import { Pressable } from 'react-native';
import { tick } from '../runtime/haptics';

/** A Pressable that gives the light haptic tick on press and long-press. Use it for every button. */
export function Tap({ onPress, onLongPress, ...rest }: ComponentProps<typeof Pressable>) {
  return (
    <Pressable
      {...rest}
      onPress={onPress && ((e) => { tick(); onPress(e); })}
      onLongPress={onLongPress && ((e) => { tick(); onLongPress(e); })}
    />
  );
}
