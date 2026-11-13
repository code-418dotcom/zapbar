import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Switch, TextInput, View } from 'react-native';
import { ICONS, type ArrangedInput, type IconId } from '../runtime/inputs';
import { makeStyles, MAX_CONTENT_WIDTH, radii, space, useTheme } from '../theme';
import { Tap } from './Tap';

interface Props {
  inputs: ArrangedInput[];
  focus?: string;
  onRename(mid: string, label: string): void;
  onIcon(mid: string, icon: IconId): void;
  onHidden(mid: string, hidden: boolean): void;
  onMove(mid: string, delta: -1 | 1): void;
  /** Unsaved names, so the screen can ask "Save changes?" before leaving. */
  onDraftsChange?(pending: Array<[string, string]>): void;
}

const ICON_IDS = Object.keys(ICONS) as IconId[];

/** Drafts that differ from the saved label (whitespace-insensitive). An emptied name is a change: it resets to the default. */
export function pendingRenames(drafts: Record<string, string>, inputs: ArrangedInput[]): Array<[string, string]> {
  return inputs.flatMap((i) => {
    const d = drafts[i.mid];
    return d !== undefined && d.trim() !== i.label ? [[i.mid, d] as [string, string]] : [];
  });
}

export function InputsEditor({ inputs, focus, onRename, onIcon, onHidden, onMove, onDraftsChange }: Props) {
  const { c } = useTheme();
  const s = useStyles();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Report only real changes: the screen rebuilds `inputs` every render and stores this in state.
  const reported = useRef<string | null>(null);
  useEffect(() => {
    const pending = pendingRenames(drafts, inputs);
    const key = JSON.stringify(pending);
    if (key === reported.current) return;
    reported.current = key;
    onDraftsChange?.(pending);
  }, [drafts, inputs]);
  const drop = (mid: string) => setDrafts(({ [mid]: _gone, ...rest }) => rest);
  const save = (mid: string) => {
    const text = drafts[mid];
    if (text === undefined) return;
    onRename(mid, text);
    drop(mid);
  };

  return (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {inputs.map((i, idx) => {
        const dirty = pendingRenames({ [i.mid]: drafts[i.mid] ?? i.label }, [i]).length > 0;
        return (
          <View key={i.mid} style={[s.card, i.mid === focus && s.focus]}>
            <View style={s.head}>
              <TextInput
                accessibilityLabel={`Label for ${i.label}`}
                value={drafts[i.mid] ?? i.label}
                onChangeText={(t) => setDrafts((d) => ({ ...d, [i.mid]: t }))}
                onSubmitEditing={() => save(i.mid)}
                returnKeyType="done"
                autoFocus={i.mid === focus}
                style={[s.input, dirty && s.inputDirty]}
              />
              {dirty && (
                <>
                  <Tap accessibilityRole="button" accessibilityLabel={`Undo name change for ${i.label}`} onPress={() => drop(i.mid)} style={s.iconBtn}>
                    <MaterialCommunityIcons name="close" size={22} color={c.text} />
                  </Tap>
                  <Tap accessibilityRole="button" accessibilityLabel={`Save name for ${i.label}`} onPress={() => save(i.mid)} style={[s.iconBtn, s.iconOn]}>
                    <MaterialCommunityIcons name="check" size={22} color={c.onAccent} />
                  </Tap>
                </>
              )}
              {!dirty && (
                <Switch
                  accessibilityLabel={`Show ${i.label}`}
                  value={!i.hidden}
                  onValueChange={(show) => onHidden(i.mid, !show)}
                  trackColor={{ true: c.accent, false: c.surfaceHi }}
                  thumbColor={i.hidden ? c.muted : c.surface}
                />
              )}
            </View>
            <View style={s.icons}>
              {ICON_IDS.map((id) => (
                <Tap key={id} accessibilityRole="button" accessibilityLabel={`Icon ${id}`} accessibilityState={{ selected: i.icon === id }} onPress={() => onIcon(i.mid, id)} style={[s.iconBtn, i.icon === id && s.iconOn]}>
                  <MaterialCommunityIcons name={ICONS[id]} size={22} color={i.icon === id ? c.onAccent : c.text} />
                </Tap>
              ))}
            </View>
            <View style={s.move}>
              <Tap accessibilityRole="button" accessibilityLabel={`Move ${i.label} up`} disabled={idx === 0} onPress={() => onMove(i.mid, -1)} style={s.iconBtn}>
                <MaterialCommunityIcons name="chevron-up" size={22} color={idx === 0 ? c.border : c.text} />
              </Tap>
              <Tap accessibilityRole="button" accessibilityLabel={`Move ${i.label} down`} disabled={idx === inputs.length - 1} onPress={() => onMove(i.mid, 1)} style={s.iconBtn}>
                <MaterialCommunityIcons name="chevron-down" size={22} color={idx === inputs.length - 1 ? c.border : c.text} />
              </Tap>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles(({ c, type }) => ({
  content: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', padding: space(4), gap: space(3) },
  card: { backgroundColor: c.surface, borderRadius: radii.card, padding: space(4), gap: space(3) },
  focus: { borderWidth: 2, borderColor: c.accent },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  input: { ...type.body, flex: 1, color: c.text, minHeight: 48, paddingHorizontal: space(4), borderRadius: radii.pill, backgroundColor: c.surfaceHi },
  inputDirty: { borderWidth: 1, borderColor: c.accent },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  iconBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceHi },
  iconOn: { backgroundColor: c.accent },
  move: { flexDirection: 'row', gap: space(2), justifyContent: 'flex-end' },
}));
