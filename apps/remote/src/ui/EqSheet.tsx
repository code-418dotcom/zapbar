import { presetLabel, type Capabilities, type DeviceSettings, type Range } from '@zapbar/heos-core';
import { Text, View } from 'react-native';
import { makeStyles, space } from '../theme';
import { Pill } from './Pill';
import { PillSlider } from './PillSlider';
import { Sheet } from './Sheet';

interface Props {
  visible: boolean;
  caps: Capabilities;
  settings: DeviceSettings;
  onClose(): void;
  onBass(v: number): void;
  onTreble(v: number): void;
  onSubwoofer(v: number): void;
  onReset(): void;
  onPreset(id: string): void;
}

export { shouldDismissSheet } from './Sheet';

const Tone = ({ id, label, range, value, onChange }: { id: string; label: string; range: Range; value: number | null; onChange(v: number): void }) => {
  const s = useStyles();
  return (
    <View style={s.tone}>
      <View style={s.toneHead}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.value}>{value ?? '–'}</Text>
      </View>
      <PillSlider testID={`eq-${id}`} accessibilityLabel={label} min={range.min} max={range.max} value={value} onValueChange={onChange} />
    </View>
  );
};

export function EqSheet({ visible, caps, settings, onClose, onBass, onTreble, onSubwoofer, onReset, onPreset }: Props) {
  const s = useStyles();
  if (!caps.tone) return null;
  return (
    <Sheet visible={visible} id="eq" title="EQ" closeLabel="Close EQ" onClose={onClose}>
      <Tone id="bass" label="Bass" range={caps.tone.bass} value={settings.bass} onChange={onBass} />
      <Tone id="treble" label="Treble" range={caps.tone.treble} value={settings.treble} onChange={onTreble} />
      {caps.tone.subwoofer && <Tone id="subwoofer" label="Subwoofer" range={caps.tone.subwoofer} value={settings.subwoofer} onChange={onSubwoofer} />}
      {caps.eqPresets.length > 0 && (
        <View style={s.presets}>
          <Text style={s.label}>Presets</Text>
          <View style={s.row}>
            {caps.eqPresets.map((p) => (
              <Pill key={p} label={presetLabel(p)} tone="surface" selected={settings.eqPreset === p} onPress={() => onPreset(p)} />
            ))}
          </View>
        </View>
      )}
      <Pill label="Reset to neutral" variant="outline" block onPress={onReset} />
    </Sheet>
  );
}

const useStyles = makeStyles(({ c, type }) => ({
  tone: { gap: space(2) },
  toneHead: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { ...type.secondary, color: c.muted },
  value: { ...type.body, color: c.text, fontVariant: ['tabular-nums'] },
  presets: { gap: space(2) },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
}));
