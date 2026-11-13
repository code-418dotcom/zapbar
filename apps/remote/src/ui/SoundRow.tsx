import type { Capabilities, DeviceSettings } from '@zapbar/heos-core';
import { Text, View } from 'react-native';
import { makeStyles, space } from '../theme';
import { Pill } from './Pill';

const MODE_LABELS: Record<string, string> = { MOVIE_NORMAL: 'Movie', MUSIC_NORMAL: 'Music' };
export const modeLabel = (mode: string): string => {
  if (MODE_LABELS[mode]) return MODE_LABELS[mode];
  const words = mode.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};
export const DIALOGUE_LABELS = ['Off', 'Low', 'Med', 'High'];

interface Props {
  caps: Capabilities;
  settings: DeviceSettings;
  disabled: boolean;
  onSoundMode(mode: string): void;
  onDialogue(level: number): void;
  onNight(level: number): void;
  onOpenEq(): void;
}


export function SoundRow({ caps, settings, disabled, onSoundMode, onDialogue, onNight, onOpenEq }: Props) {
  const s = useStyles();
  const dialogueLevels = caps.dialogue ? Array.from({ length: caps.dialogue.max - caps.dialogue.min + 1 }, (_, i) => caps.dialogue!.min + i) : [];
  const nightOn = (settings.nightLevel ?? 0) > 0;
  return (
    <View style={[s.wrap, disabled && s.disabled]}>
      {caps.soundModes.length > 0 && (
        <View style={s.row}>
          {caps.soundModes.map((m) => (
            <Pill key={m} label={modeLabel(m)} selected={settings.soundMode === m} onPress={() => onSoundMode(m)} disabled={disabled} />
          ))}
        </View>
      )}
      {caps.dialogue && (
        <View style={s.row}>
          <Text style={s.label}>Dialogue</Text>
          {dialogueLevels.map((lv) => (
            <Pill key={lv} label={DIALOGUE_LABELS[lv] ?? String(lv)} selected={settings.dialogueLevel === lv} onPress={() => onDialogue(lv)} disabled={disabled} />
          ))}
        </View>
      )}
      <View style={s.row}>
        {caps.night && (
          <Pill
            label="Night"
            icon="weather-night"
            toggle
            accessibilityLabel="Night mode"
            selected={nightOn}
            disabled={disabled}
            onPress={() => onNight(nightOn ? caps.night!.min : caps.night!.max)}
          />
        )}
        <View style={s.spacer} />
        {caps.tone && <Pill label="EQ" icon="tune-vertical" variant="outline" onPress={onOpenEq} disabled={disabled} />}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ c, type }) => ({
  wrap: { gap: space(3) },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space(2) },
  label: { ...type.secondary, color: c.muted, marginRight: space(1) },
  spacer: { flex: 1 },
  disabled: { opacity: 0.4 },
}));
