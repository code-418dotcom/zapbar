import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { ICONS, type ArrangedInput } from '../runtime/inputs';
import { FIXED_TEXT_SCALE, makeStyles, radii, space, useTheme } from '../theme';
import { Tap } from './Tap';

interface Props {
  inputs: ArrangedInput[];
  hiddenCount: number;
  active: string | null;
  disabled: boolean;
  onSelect(mid: string): void;
  onEdit(mid: string): void;
  onShowHidden(): void;
}

export function InputGrid({ inputs, hiddenCount, active, disabled, onSelect, onEdit, onShowHidden }: Props) {
  const { c } = useTheme();
  const s = useStyles();
  return (
    <View style={s.grid}>
      {inputs.map((i) => {
        const on = i.mid === active;
        return (
          <Tap
            key={i.mid}
            testID={`input-${i.mid}`}
            accessibilityRole="button"
            accessibilityLabel={i.label}
            accessibilityState={{ selected: on, disabled }}
            disabled={disabled}
            onPress={() => onSelect(i.mid)}
            onLongPress={() => onEdit(i.mid)}
            style={({ pressed }) => [s.tile, on && s.active, pressed && s.pressed, disabled && s.disabled]}
          >
            <MaterialCommunityIcons name={ICONS[i.icon]} size={26} color={on ? c.onAccent : c.text} />
            <Text numberOfLines={1} maxFontSizeMultiplier={FIXED_TEXT_SCALE} style={[s.label, on && s.activeLabel]}>
              {i.label}
            </Text>
          </Tap>
        );
      })}
      {hiddenCount > 0 && (
        <Tap onPress={onShowHidden} style={s.more} accessibilityRole="button">
          <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} style={s.moreText}>+{hiddenCount} hidden</Text>
        </Tap>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ c, type }) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  tile: { width: '31.5%', minHeight: 76, borderRadius: radii.tile, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', gap: space(1), paddingHorizontal: space(2) },
  active: { backgroundColor: c.accent },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  label: { ...type.tile, color: c.text, maxWidth: '100%' },
  activeLabel: { color: c.onAccent },
  more: { width: '31.5%', minHeight: 76, borderRadius: radii.tile, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  moreText: { ...type.secondary, color: c.muted },
}));
