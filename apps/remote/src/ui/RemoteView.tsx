import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { DeviceState, NowPlaying, PlayState } from '@zapbar/heos-core';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Dimensions, ScrollView, Text, View } from 'react-native';
import type { ArrangedInput } from '../runtime/inputs';
import { capFor } from '../runtime/volume';
import { FIXED_TEXT_SCALE, makeStyles, MAX_CONTENT_WIDTH, radii, space, useTheme } from '../theme';
import { Confetti, type Origin } from './Confetti';
import { EqSheet } from './EqSheet';
import { GroupSheet, groupTitle } from './GroupSheet';
import { InputGrid } from './InputGrid';
import { SoundRow } from './SoundRow';
import { Toast } from './Toast';
import { TopCard } from './TopCard';
import { useTapBurst } from './useTapBurst';
import { VolumeBar } from './VolumeBar';
import { ZMark } from './ZMark';
import { Tap } from './Tap';

export interface RemoteActions {
  playInput(mid: string): void;
  setVolume(v: number): void;
  setMute(on: boolean): void;
  setPlayState(s: PlayState): void;
  next(): void;
  previous(): void;
  recallQuickSelect(id: number): void;
  setSoundMode(mode: string): void;
  setDialogue(level: number): void;
  setNight(level: number): void;
  setBass(v: number): void;
  setTreble(v: number): void;
  setSubwoofer(v: number): void;
  resetTone(): void;
  selectEqPreset(id: string): void;
  reconnect(): void;
  openApp(np: NowPlaying): void;
  openSettings(): void;
  openSupport(): void;
  editInput(mid: string): void;
  showHidden(): void;
  /** Speakers that should play with this bar; empty ungroups. */
  setGroupMembers(pids: number[]): void;
  setMemberVolume(pid: number, v: number): void;
}

const SPOTIFY_SID = 4;

const centre = (): Origin => {
  const { width, height } = Dimensions.get('window');
  return { x: width / 2, y: height * 0.7 };
};

interface Props {
  state: DeviceState;
  inputs: { visible: ArrangedInput[]; hidden: ArrangedInput[] };
  onLan: boolean;
  actions: RemoteActions;
  /** Name chosen by the screen (nickname, reported or remembered name). */
  displayName?: string;
  /** The bar is applying a new name. */
  applying?: boolean;
  /** Any tip bought: show the supporter heart next to the Z. */
  supporter?: boolean;
  /** Play Billing is up: offer "Support us" to non-supporters. */
  canTip?: boolean;
}

export function RemoteView({ state, inputs, onLan, actions: a, displayName, applying, supporter, canTip }: Props) {
  const { c, appearance } = useTheme();
  const s = useStyles();
  const [eqOpen, setEqOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  // A local note (dad mode) shows until a newer device error arrives; the counter id re-shows repeats.
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const noteId = useRef(0);
  const onZ = useTapBurst(7, 3000, () => setNote({ id: `note-${++noteId.current}`, text: 'You are now a developer.' }));
  const [burst, setBurst] = useState<{ id: number; origin: Origin | null }>({ id: 0, origin: null });
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  // The bar reports window coordinates; the overlay positions inside the root view.
  const onUserUnmute = (origin: Origin | null) => {
    if (!appearance.confetti) return;
    const burstAt = (o: Origin | null) => setBurst((b) => ({ id: b.id + 1, origin: o ?? centre() }));
    const root = rootRef.current;
    if (!origin || !root?.measureInWindow) return burstAt(origin);
    root.measureInWindow((rx: number, ry: number) => burstAt({ x: origin.x - rx, y: origin.y - ry }));
  };
  const errorId = state.lastError?.id;
  useEffect(() => setNote(null), [errorId]);
  const { settings, caps, status } = state;
  const cli = onLan && (status === 'ready' || status === 'degraded');
  const upnp = onLan && status === 'ready';
  const np = settings.nowPlaying;
  const all = [...inputs.visible, ...inputs.hidden];
  const activeInput = all.find((i) => i.mid === settings.activeInput) ?? null;
  const portName = caps?.inputs.find((i) => i.mid === settings.activeInput)?.name ?? '';
  const selfName = displayName || state.name;
  const group = state.group;
  const groupSize = group?.members.length ?? 1;
  // Only offered where there is something to group with.
  const canGroup = state.pid !== null && (state.players.length > 1 || group !== null);
  return (
    <View ref={rootRef} style={s.root}>
      <ScrollView testID="remote-scroll" contentContainerStyle={s.content}>
        <View style={s.header}>
          {supporter ? (
            <Tap accessibilityRole="button" accessibilityLabel="Zapbar" onPress={onZ} hitSlop={8}>
              <ZMark size={26} color={c.accent} decorative />
            </Tap>
          ) : (
            <ZMark size={26} color={c.accent} />
          )}
          {supporter && (
            <View accessible accessibilityLabel="Supporter">
              <MaterialCommunityIcons name="heart" size={14} color={c.accent} />
            </View>
          )}
          <Text numberOfLines={1} style={s.name}>{groupTitle(selfName, group)}</Text>
          {canTip && !supporter && (
            <Tap accessibilityRole="button" accessibilityLabel="Support us" onPress={a.openSupport} style={s.support} hitSlop={8}>
              <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} style={s.supportText}>Support us</Text>
              <MaterialCommunityIcons name="heart" size={16} color={c.accent} />
            </Tap>
          )}
          {canGroup && (
            <Tap
              testID="group-button"
              accessibilityRole="button"
              accessibilityLabel={group ? `Playing on ${groupSize} speakers` : 'Play on more speakers'}
              onPress={() => setGroupOpen(true)}
              style={[s.icon, group && s.groupOn]}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="speaker-multiple" size={24} color={group ? c.onAccent : c.muted} />
            </Tap>
          )}
          <Tap accessibilityRole="button" accessibilityLabel="Settings" onPress={a.openSettings} style={s.icon} hitSlop={8}>
            <MaterialCommunityIcons name="cog-outline" size={24} color={c.muted} />
          </Tap>
        </View>
        <TopCard
          status={status}
          hasCaps={caps !== null}
          onLan={onLan}
          np={np}
          playState={settings.playState}
          input={activeInput ? { label: activeInput.label, icon: activeInput.icon, name: portName } : null}
          soundMode={settings.soundMode}
          disabled={!cli}
          onPlayPause={() => a.setPlayState(settings.playState === 'play' ? 'pause' : 'play')}
          onNext={a.next}
          onPrevious={a.previous}
          onOpenApp={np?.sourceId === SPOTIFY_SID ? () => a.openApp(np) : undefined}
          onRetry={a.reconnect}
          onEditInput={activeInput ? () => a.editInput(activeInput.mid) : undefined}
          applying={applying}
        />
        {/* Always rendered, whatever is playing: one tap from any state switches input. */}
        <InputGrid inputs={inputs.visible} hiddenCount={inputs.hidden.length} active={settings.activeInput} disabled={!cli} onSelect={a.playInput} onEdit={a.editInput} onShowHidden={a.showHidden} />
        <VolumeBar volume={settings.volume} mute={settings.mute} disabled={!cli} onVolume={a.setVolume} onMute={a.setMute} eleven={appearance.eleven} cap={capFor(appearance)} onUserUnmute={onUserUnmute} onCapHit={() => setNote({ id: `note-${++noteId.current}`, text: "It's loud enough." })} />
        {group && (
          <Tap testID="group-hint" accessibilityRole="button" onPress={() => setGroupOpen(true)} style={s.groupHint} hitSlop={4}>
            <MaterialCommunityIcons name="speaker-multiple" size={16} color={c.muted} />
            <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} style={s.groupHintText}>Volume for all {groupSize} speakers · <Text style={s.groupHintLink}>Adjust each</Text></Text>
          </Tap>
        )}
        {caps && <SoundRow caps={caps} settings={settings} disabled={!upnp} onSoundMode={a.setSoundMode} onDialogue={a.setDialogue} onNight={a.setNight} onOpenEq={() => setEqOpen(true)} />}
      </ScrollView>
      {caps && (
        <EqSheet
          visible={eqOpen && upnp}
          caps={caps}
          settings={settings}
          onClose={() => setEqOpen(false)}
          onBass={a.setBass}
          onTreble={a.setTreble}
          onSubwoofer={a.setSubwoofer}
          onReset={a.resetTone}
          onPreset={a.selectEqPreset}
        />
      )}
      {state.pid !== null && (
        <GroupSheet
          visible={groupOpen && canGroup}
          selfPid={state.pid}
          selfName={selfName}
          players={state.players}
          group={group}
          volume={settings.volume}
          mute={settings.mute}
          disabled={!cli}
          onClose={() => setGroupOpen(false)}
          onMembers={a.setGroupMembers}
          onVolume={a.setVolume}
          onMute={a.setMute}
          onMemberVolume={a.setMemberVolume}
        />
      )}
      <Confetti burstId={burst.id} origin={burst.origin} />
      <Toast message={note ?? state.lastError} />
    </View>
  );
}

const useStyles = makeStyles(({ c, type }) => ({
  root: { flex: 1, backgroundColor: c.bg },
  content: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', padding: space(4), gap: space(4), paddingBottom: space(10) },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 48 },
  name: { ...type.room, color: c.text, flex: 1 },
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  groupOn: { backgroundColor: c.accent, borderRadius: radii.pill },
  groupHint: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: -space(2), paddingHorizontal: space(3), minHeight: 32 },
  groupHintText: { ...type.secondary, color: c.muted, flexShrink: 1 },
  groupHintLink: { color: c.text, textDecorationLine: 'underline' },
  support: { flexDirection: 'row', alignItems: 'center', gap: space(1), minHeight: 36, paddingHorizontal: space(3), borderRadius: radii.pill, borderWidth: 1, borderColor: c.border },
  supportText: { ...type.chip, color: c.text },
}));
