import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { FIXED_TEXT_SCALE, makeStyles, radii, space, useTheme } from '../theme';
import { Tap } from './Tap';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Props {
  label: string;
  onPress(): void;
  selected?: boolean;
  disabled?: boolean;
  /** chip: filled surface; outline: border only; primary: always accent. */
  variant?: 'chip' | 'outline' | 'primary';
  /** What the pill sits on: on a surface card, chips use surfaceHi so they stay visible. */
  tone?: 'bg' | 'surface';
  icon?: IconName;
  toggle?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  block?: boolean;
}

export function Pill({ label, onPress, selected = false, disabled = false, variant = 'chip', tone = 'bg', icon, toggle = false, accessibilityLabel, testID, block = false }: Props) {
  const { c } = useTheme();
  const s = useStyles();
  const filled = variant === 'primary' || selected;
  const fg = filled ? c.onAccent : c.text;
  return (
    <Tap
      testID={testID}
      accessibilityRole={toggle ? 'switch' : 'button'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={toggle ? { checked: selected, disabled } : { selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.base,
        variant === 'outline' ? s.outline : tone === 'surface' ? s.chipOnSurface : s.chip,
        filled && s.filled,
        block && s.block,
        pressed && s.pressed,
        disabled && s.disabled,
      ]}
    >
      {icon && <MaterialCommunityIcons name={icon} size={18} color={fg} />}
      <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={[s.label, { color: fg }]}>
        {label}
      </Text>
    </Tap>
  );
}

const useStyles = makeStyles(({ c, type }) => ({
  base: { minHeight: 48, paddingHorizontal: space(4), borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2) },
  chip: { backgroundColor: c.surface },
  chipOnSurface: { backgroundColor: c.surfaceHi },
  outline: { borderWidth: 1, borderColor: c.border },
  filled: { backgroundColor: c.accent, borderColor: c.accent },
  block: { alignSelf: 'stretch' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  label: { ...type.chip },
}));
