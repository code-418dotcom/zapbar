import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import type { TipId } from '../runtime/billing';
import type { SupporterState } from '../runtime/supporter';
import { ACCENT_IDS, ACCENTS, FONT_IDS, FONTS, makeStyles, PERK_IDS, radii, space, useTheme, type Appearance, type PerkId } from '../theme';
import { Tap } from './Tap';

export const PERK_LABELS: Record<PerkId, string> = {
  eleven: 'This one goes to 11',
  pirate: 'Pirate labels',
  confetti: 'Confetti on unmute',
  dad: 'Dad mode (max volume 30)',
};

interface Props {
  state: SupporterState;
  onBuy(id: TipId): void;
  onAppearance(p: Partial<Appearance>): void;
  /** iOS only: App Review requires a visible restore action. Play restores on its own. */
  canRestore?: boolean;
  onRestore?(): Promise<RestoreResult>;
}

export type RestoreResult = 'restored' | 'none' | 'failed';

export const RESTORE_TEXT: Record<RestoreResult, string> = {
  restored: 'Tips restored, thank you',
  none: 'No tips found for this Apple ID',
  failed: "Couldn't reach the App Store. Try again later.",
};
const RESULT_MS = 4000;

/** The tip jar. Tiles need Play Billing; the perk pickers only need the cached supporter flag. */
export function SupportCard({ state, onBuy, onAppearance, canRestore, onRestore }: Props) {
  const { c } = useTheme();
  const s = useStyles();
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  if (!state.available && !state.supporter) return null;
  const restore = async () => {
    if (!onRestore || restoring) return;
    setRestoring(true);
    const r = await onRestore().catch((): RestoreResult => 'failed');
    setRestoring(false);
    setResult(r);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), RESULT_MS);
  };
  return (
    <>
      <Text style={s.section}>Support Zapbar</Text>
      <View style={s.card}>
        {state.supporter && <Text style={s.badge}>♥ Supporter, thank you</Text>}
        <Text style={s.sub}>Zapbar is free and stays free. Tips unlock a badge, extra colours and some very silly perks, nothing else.</Text>
        {state.available && (
          <View style={s.tiles}>
            {state.products.map((p) => {
              const owned = state.owned.includes(p.id);
              const pending = state.pending.includes(p.id);
              return (
                <Tap
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={owned ? `${p.price}, owned` : p.price}
                  disabled={owned || pending || state.busy !== null}
                  onPress={() => onBuy(p.id)}
                  style={[s.tile, owned && s.tileOwned]}
                >
                  <Text style={[s.price, owned && s.priceOwned]}>{p.price}</Text>
                  {owned && <MaterialCommunityIcons name="check" size={18} color={c.onAccent} />}
                  {pending && <Text style={s.sub}>Pending</Text>}
                </Tap>
              );
            })}
          </View>
        )}
        {state.available && canRestore && onRestore && (
          <Tap accessibilityRole="button" disabled={restoring} onPress={() => void restore()} style={s.restore}>
            <Text style={s.restoreText}>Restore purchases</Text>
          </Tap>
        )}
        {result && <Text style={s.sub}>{RESTORE_TEXT[result]}</Text>}
        {state.supporter && (
          <>
            <Text style={s.label}>Accent colour</Text>
            <View style={s.swatches}>
              {ACCENT_IDS.map((id) => (
                <Tap
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={ACCENTS[id].label}
                  accessibilityState={{ selected: state.appearance.accent === id }}
                  onPress={() => onAppearance({ accent: id })}
                  style={[s.swatch, { backgroundColor: ACCENTS[id].dark.accent }, state.appearance.accent === id && s.swatchOn]}
                />
              ))}
            </View>
            <Text style={s.label}>Font</Text>
            {FONT_IDS.map((id) => (
              <Tap
                key={id}
                accessibilityRole="button"
                accessibilityState={{ selected: state.appearance.font === id }}
                onPress={() => onAppearance({ font: id })}
                style={s.fontRow}
              >
                <Text style={[s.fontName, { fontFamily: FONTS[id].bold }]}>{FONTS[id].label}</Text>
                {state.appearance.font === id && <MaterialCommunityIcons name="check" size={20} color={c.text} />}
              </Tap>
            ))}
            <Text style={s.label}>Silly perks</Text>
            {PERK_IDS.map((id) => (
              <View key={id} style={s.perkRow}>
                <Text style={s.perkName}>{PERK_LABELS[id]}</Text>
                <Switch
                  accessibilityLabel={PERK_LABELS[id]}
                  value={state.appearance[id]}
                  onValueChange={(v) => onAppearance({ [id]: v })}
                  trackColor={{ true: c.accent, false: c.surfaceHi }}
                  thumbColor={state.appearance[id] ? c.surface : c.muted}
                />
              </View>
            ))}
          </>
        )}
      </View>
    </>
  );
}

const useStyles = makeStyles(({ c, type }) => ({
  section: { ...type.secondary, color: c.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: space(4), marginLeft: space(2) },
  card: { backgroundColor: c.surface, borderRadius: radii.card, padding: space(4), gap: space(3) },
  badge: { ...type.cardTitle, color: c.text },
  sub: { ...type.secondary, color: c.muted },
  label: { ...type.chip, color: c.text, paddingTop: space(2) },
  tiles: { flexDirection: 'row', gap: space(2) },
  tile: { flex: 1, minHeight: 56, borderRadius: radii.tile, backgroundColor: c.surfaceHi, alignItems: 'center', justifyContent: 'center', gap: space(1) },
  tileOwned: { backgroundColor: c.accent },
  restore: { minHeight: 44, justifyContent: 'center' },
  restoreText: { ...type.secondary, color: c.accent },
  price: { ...type.cardTitle, color: c.text },
  priceOwned: { color: c.onAccent },
  swatches: { flexDirection: 'row', gap: space(3) },
  swatch: { width: 40, height: 40, borderRadius: radii.pill, borderWidth: 3, borderColor: c.border },
  swatchOn: { borderColor: c.text },
  fontRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  perkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: space(3) },
  perkName: { ...type.body, fontFamily: type.chip.fontFamily, color: c.text, flex: 1 },
  fontName: { fontSize: 16, color: c.text },
}));
