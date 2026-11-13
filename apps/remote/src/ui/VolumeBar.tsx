import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Origin } from './Confetti';
import { FIXED_TEXT_SCALE, makeStyles, space, useTheme } from '../theme';
import { capped, elevenOf } from '../runtime/volume';
import { copy } from './copy';
import { PillSlider } from './PillSlider';
import { Tap } from './Tap';

interface Props {
  volume: number;
  mute: boolean;
  disabled: boolean;
  onVolume(v: number): void;
  onMute(on: boolean): void;
  /** Show 0-11 instead of 0-100. The slider still runs 0-100. */
  eleven?: boolean;
  /** Highest volume this bar will set (dad mode). */
  cap?: number;
  /** A drag reached the cap; fires at most once per drag. */
  onCapHit?(): void;
  /** The mute button was pressed while muted (muted to unmuted). Origin is the button's centre in window coordinates, null if it cannot be measured. */
  onUserUnmute?(origin: Origin | null): void;
}

export function VolumeBar({ volume, mute, disabled, onVolume, onMute, eleven, cap = 100, onCapHit, onUserUnmute }: Props) {
  const { c, appearance } = useTheme();
  const { pirate } = appearance;
  const muteKey = mute ? 'unmute' : 'mute';
  const s = useStyles();
  // While a finger is on the slider it owns the value; reports from the bar would fight the thumb.
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? volume;
  const shownText = String(eleven ? elevenOf(shown) : shown);
  const hit = useRef(false);
  const muteRef = useRef<ComponentRef<typeof Pressable>>(null);
  // The cap was left (a value below it arrived): the next hit may toast again.
  useEffect(() => {
    if (volume < cap) hit.current = false;
  }, [volume, cap]);
  const set = (v: number) => {
    const next = capped(v, volume, cap);
    if (v < cap) hit.current = false;
    if (cap < 100 && v >= cap && v > volume && !hit.current) {
      hit.current = true;
      onCapHit?.();
    }
    onVolume(next);
    return next;
  };
  const pressMute = () => {
    onMute(!mute);
    if (!mute || !onUserUnmute) return;
    const button = muteRef.current;
    if (!button?.measureInWindow) return onUserUnmute(null);
    // Window coordinates of the button's centre, measured now so scrolling cannot make them stale.
    button.measureInWindow((x: number, y: number, w: number, h: number) => onUserUnmute({ x: x + w / 2, y: y + h / 2 }));
  };
  return (
    <View style={[s.row, disabled && s.disabled]}>
      <Tap ref={muteRef} accessibilityRole="button" accessibilityLabel={copy(muteKey, pirate)} accessibilityHint={pirate ? copy(muteKey, false) : undefined} disabled={disabled} onPress={pressMute} style={s.mute} hitSlop={8}>
        <MaterialCommunityIcons name={mute ? 'volume-off' : 'volume-high'} size={26} color={mute ? c.warn : c.text} />
      </Tap>
      <View style={s.slider}>
        <PillSlider
          testID="volume"
          accessibilityLabel={copy('volume', pirate)}
          accessibilityHint={pirate ? copy('volume', false) : undefined}
          min={0}
          max={cap}
          valueText={shownText}
          value={shown}
          disabled={disabled}
          onSlidingStart={(v) => {
            hit.current = false;
            setDrag(v);
          }}
          onValueChange={(v) => {
            const next = set(v);
            if (drag !== null) setDrag(next);
          }}
          onSlidingComplete={(v) => {
            onVolume(capped(v, volume, cap));
            hit.current = false;
            setDrag(null);
          }}
        />
      </View>
      <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} style={s.value}>{shownText}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ c, type }) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  mute: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  slider: { flex: 1 },
  value: { ...type.cardTitle, color: c.text, fontVariant: ['tabular-nums'], width: 40, textAlign: 'right' },
  disabled: { opacity: 0.4 },
}));
