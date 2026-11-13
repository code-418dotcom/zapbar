import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ConnectionStatus } from '@zapbar/heos-core';
import { useRef, useState } from 'react';
import { Platform, ScrollView, Switch, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import type { TipId } from '../runtime/billing';
import { displayName, type KnownDevice, type QuickSettings } from '../runtime/memory';
import type { SupporterState } from '../runtime/supporter';
import { makeStyles, MAX_CONTENT_WIDTH, radii, space, useTheme, type Appearance } from '../theme';
import { useCopy } from './copy';
import { SupportCard, type RestoreResult } from './SupportCard';
import { Tap } from './Tap';

interface Props {
  devices: KnownDevice[];
  activeKey: string | null;
  statusOf(key: string): ConnectionStatus | undefined;
  version: string;
  onActivate(key: string): void;
  onForget(key: string): void;
  onAddDevice(): void;
  onInputs(): void;
  /** Returns an error text to show, or null when the rename is done. */
  onRename(key: string, name: string): Promise<string | null>;
  quick?: QuickSettings;
  onQuick?(patch: Partial<QuickSettings>): void;
  onBattery?(): void;
  support?: { state: SupporterState; onBuy(id: TipId): void; onAppearance(p: Partial<Appearance>): void; canRestore?: boolean; onRestore?(): Promise<RestoreResult> };
  /** 'support': opened from the remote's "Support us", so scroll to the tips. */
  focus?: 'support';
}

export function purchaseLine(os: string): string {
  return `Zapbar talks only to devices on your own network and collects no data. Purchases are handled by ${os === 'ios' ? 'the App Store' : 'Google Play'}.`;
}

export function SettingsView({ devices, activeKey, statusOf, version, onActivate, onForget, onAddDevice, onInputs, onRename, quick, onQuick, onBattery, support, focus }: Props) {
  const { c } = useTheme();
  const t = useCopy();
  const s = useStyles();
  const scroll = useRef<ScrollViewInstance>(null);
  const scrolled = useRef(false);
  return (
    <ScrollView ref={scroll} testID="settings-scroll" contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.section}>{t('soundbars')}</Text>
      <View style={s.card}>
        {devices.map((d) => (
          <DeviceRow key={d.key} device={d} active={d.key === activeKey} status={statusOf(d.key)} onActivate={onActivate} onForget={onForget} onRename={onRename} />
        ))}
        <Tap accessibilityRole="button" onPress={onAddDevice} style={s.linkRow}>
          <Text style={s.rowTitle}>Add a soundbar</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={c.muted} />
        </Tap>
      </View>
      <Text style={s.section}>Remote</Text>
      <View style={s.card}>
        <Tap accessibilityRole="button" onPress={onInputs} style={s.linkRow}>
          <Text style={s.rowTitle}>Inputs</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={c.muted} />
        </Tap>
        {quick && onQuick && (
          <>
            <ToggleRow label="Volume keys control the soundbar" value={quick.volumeKeys} onChange={(v) => onQuick({ volumeKeys: v })} />
            <ToggleRow label="Show notification" value={quick.notification} onChange={(v) => onQuick({ notification: v })} />
          </>
        )}
        {onBattery && (
          <Tap accessibilityRole="button" onPress={onBattery} style={s.linkRow}>
            <Text style={[s.rowSub, s.flex]}>Keep volume keys working when the app is closed</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={c.muted} />
          </Tap>
        )}
      </View>
      {/* Same condition as SupportCard's own null check, so an empty wrapper never adds a gap. */}
      {support && (support.state.available || support.state.supporter) && (
        <View
          testID="settings-support"
          style={s.supportBlock}
          onLayout={(e) => {
            if (focus !== 'support' || scrolled.current) return;
            scrolled.current = true;
            scroll.current?.scrollTo({ y: e.nativeEvent.layout.y, animated: true });
          }}
        >
          <SupportCard {...support} />
        </View>
      )}
      <Text style={s.section}>About</Text>
      <View style={[s.card, s.about]}>
        <Text style={s.rowSub}>Version {version}</Text>
        <Text style={s.rowSub}>Zapbar is not affiliated with Denon or HEOS.</Text>
        <Text style={s.rowSub}>{purchaseLine(Platform.OS)}</Text>
      </View>
    </ScrollView>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange(v: boolean): void }) {
  const { c } = useTheme();
  const s = useStyles();
  return (
    <View style={s.linkRow}>
      <Text style={[s.rowTitle, s.flex]}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: c.accent, false: c.surfaceHi }} thumbColor={value ? c.surface : c.muted} />
    </View>
  );
}

function DeviceRow({ device: d, active, status, onActivate, onForget, onRename }: { device: KnownDevice; active: boolean; status: ConnectionStatus | undefined; onActivate(key: string): void; onForget(key: string): void; onRename(key: string, name: string): Promise<string | null> }) {
  const { c } = useTheme();
  const s = useStyles();
  const shown = displayName(d, undefined);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (draft === null || busy) return;
    setBusy(true);
    const err = await onRename(d.key, draft);
    setBusy(false);
    setError(err);
    if (!err) setDraft(null);
  };
  if (draft !== null) {
    return (
      <View style={s.editRow}>
        <View style={s.editLine}>
          <TextInput accessibilityLabel={`Name for ${shown}`} value={draft} onChangeText={setDraft} onSubmitEditing={() => void save()} returnKeyType="done" maxLength={40} autoFocus style={s.nameInput} />
          <Tap accessibilityRole="button" accessibilityLabel={`Undo name change for ${shown}`} onPress={() => { setDraft(null); setError(null); }} style={s.iconBtn}>
            <MaterialCommunityIcons name="close" size={22} color={c.text} />
          </Tap>
          <Tap accessibilityRole="button" accessibilityLabel={`Save name for ${shown}`} onPress={() => void save()} style={[s.iconBtn, s.iconOn]}>
            <MaterialCommunityIcons name="check" size={22} color={c.onAccent} />
          </Tap>
        </View>
        {error && <Text style={s.error}>{error}</Text>}
        {busy && <Text style={s.rowSub}>Renaming… the soundbar may take a moment.</Text>}
      </View>
    );
  }
  return (
    <View style={s.deviceRow}>
      <Tap accessibilityRole="button" onPress={() => onActivate(d.key)} style={s.deviceMain}>
        <View style={[s.dot, !active && s.dotOff]} />
        <View style={s.flex}>
          <Text style={s.rowTitle}>{shown}</Text>
          <Text style={s.rowSub}>
            {d.model} · {d.lastIp} · {status ?? 'offline'}
          </Text>
        </View>
      </Tap>
      <Tap accessibilityRole="button" accessibilityLabel={`Rename ${shown}`} onPress={() => setDraft(shown)} style={s.icon} hitSlop={8}>
        <MaterialCommunityIcons name="pencil-outline" size={22} color={c.muted} />
      </Tap>
      <Tap accessibilityRole="button" accessibilityLabel={`Forget ${shown}`} onPress={() => onForget(d.key)} style={s.icon} hitSlop={8}>
        <MaterialCommunityIcons name="trash-can-outline" size={22} color={c.muted} />
      </Tap>
    </View>
  );
}

const useStyles = makeStyles(({ c, type }) => ({
  content: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', padding: space(4), gap: space(2), paddingBottom: space(10) },
  section: { ...type.secondary, color: c.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: space(4), marginLeft: space(2) },
  supportBlock: { gap: space(2) },
  card: { backgroundColor: c.surface, borderRadius: radii.card, overflow: 'hidden' },
  about: { padding: space(4), gap: space(2) },
  deviceRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: space(4), borderBottomWidth: 1, borderColor: c.border },
  deviceMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent },
  dotOff: { backgroundColor: c.border },
  flex: { flex: 1 },
  rowTitle: { ...type.body, fontFamily: type.chip.fontFamily, color: c.text },
  rowSub: { ...type.secondary, color: c.muted },
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  editRow: { padding: space(4), gap: space(2), borderBottomWidth: 1, borderColor: c.border },
  editLine: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  nameInput: { ...type.body, flex: 1, color: c.text, minHeight: 48, paddingHorizontal: space(4), borderRadius: radii.pill, backgroundColor: c.surfaceHi, borderWidth: 1, borderColor: c.accent },
  iconBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceHi },
  iconOn: { backgroundColor: c.accent },
  error: { ...type.secondary, color: c.danger },
  linkRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(4) },
}));
