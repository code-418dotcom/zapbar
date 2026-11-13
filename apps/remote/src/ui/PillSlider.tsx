import Slider from '@react-native-community/slider';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { makeStyles, radii } from '../theme';

interface Props {
  testID: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Spoken value when it differs from the number (e.g. the 0-11 scale). */
  valueText?: string;
  min: number;
  max: number;
  value: number | null;
  disabled?: boolean;
  onValueChange(v: number): void;
  onSlidingStart?(v: number): void;
  onSlidingComplete?(v: number): void;
}

/** Fill width that keeps the 36 dp knob (plus padding) inside the pill at 0%. */
const KNOB_ROOM = 48;

export const pct = (value: number | null, min: number, max: number): number => {
  if (value === null || max <= min) return 0;
  return Math.round(((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100);
};

/**
 * The brand pill slider (spec §3.4). The visible track, fill and knob are plain views; a transparent native
 * slider on top takes the gesture, so dragging and the accessibility increment/decrement actions stay native.
 */
export function PillSlider({ testID, accessibilityLabel, accessibilityHint, valueText, min, max, value, disabled, onValueChange, onSlidingStart, onSlidingComplete }: Props) {
  const s = useStyles();
  const [width, setWidth] = useState(0);
  const p = pct(value, min, max);
  // Knob centre runs linearly from 24 to width − 24, the same path the finger takes along the track.
  const fill = width > 0 ? KNOB_ROOM + (p / 100) * (width - KNOB_ROOM) : `${p}%`;
  return (
    <View testID={`${testID}-track`} style={s.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View testID={`${testID}-fill`} style={[s.fill, { width: fill }]}>
        <View style={s.knob} />
      </View>
      <Slider
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityValue={valueText === undefined ? undefined : { min, max, now: value ?? min, text: valueText }}
        style={StyleSheet.absoluteFill}
        minimumValue={min}
        maximumValue={max}
        step={1}
        value={value ?? min}
        disabled={disabled}
        onValueChange={onValueChange}
        onSlidingStart={onSlidingStart}
        onSlidingComplete={onSlidingComplete}
        minimumTrackTintColor="transparent"
        maximumTrackTintColor="transparent"
        thumbTintColor="transparent"
      />
    </View>
  );
}

const useStyles = makeStyles(({ c }) => ({
  track: { height: 48, borderRadius: radii.pill, backgroundColor: c.surfaceHi, justifyContent: 'center', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, minWidth: 48, borderRadius: radii.pill, backgroundColor: c.accent, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 6 },
  knob: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.onAccent },
}));
