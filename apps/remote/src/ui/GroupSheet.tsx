import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { GroupState, PlayerSummary } from '@zapbar/heos-core';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { makeStyles, radii, space, useTheme } from '../theme';
import { Pill } from './Pill';
import { PillSlider } from './PillSlider';
import { Sheet } from './Sheet';
import { Tap } from './Tap';

/** How long a tapped speaker shows a spinner if HEOS never reports the change. */
const PENDING_MS = 10_000;
/** From this many speakers the list becomes a two-column grid so a multiroom setup fits on one screen (tester request). */
export const GRID_FROM = 4;

interface Props {
  visible: boolean;
  selfPid: number;
  /** This bar's name as the remote shows it (a nickname wins over the HEOS name). */
  selfName: string;
  players: PlayerSummary[];
  group: GroupState | null;
  /** Group volume while grouped. */
  volume: number;
  mute: boolean;
  disabled: boolean;
  onClose(): void;
  /** The speakers that should play with this bar (this bar is implied). Empty ungroups. */
  onMembers(pids: number[]): void;
  onVolume(v: number): void;
  onMute(on: boolean): void;
  onMemberVolume(pid: number, v: number): void;
}

/** "Living room + 2": the remote's header while grouped. */
export function groupTitle(selfName: string, group: GroupState | null): string {
  const others = group ? group.members.length - 1 : 0;
  return others > 0 ? `${selfName} + ${others}` : selfName;
}

/** Order: this bar, then speakers already playing along, then the rest by name. */
export function orderSpeakers(players: PlayerSummary[], selfPid: number, group: GroupState | null): PlayerSummary[] {
  const inGroup = (pid: number) => !!group?.members.some((m) => m.pid === pid);
  const rank = (p: PlayerSummary) => (p.pid === selfPid ? 0 : inGroup(p.pid) ? 1 : 2);
  // A member HEOS lists in the group but not (yet) in get_players still gets a row.
  const extra = (group?.members ?? []).filter((m) => !players.some((p) => p.pid === m.pid)).map((m) => ({ pid: m.pid, name: m.name, model: '' }));
  return [...players, ...extra].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function GroupSheet(p: Props) {
  const { c } = useTheme();
  const s = useStyles();
  const [pending, setPending] = useState<number[]>([]);
  const memberKey = p.group?.members.map((m) => m.pid).join(',') ?? '';
  // HEOS confirmed a new line-up: every spinner is done.
  useEffect(() => setPending([]), [memberKey]);
  useEffect(() => {
    if (!pending.length) return;
    const t = setTimeout(() => setPending([]), PENDING_MS);
    return () => clearTimeout(t);
  }, [pending]);

  const members = p.group?.members.map((m) => m.pid).filter((pid) => pid !== p.selfPid) ?? [];
  const grouped = members.length > 0;
  const speakers = orderSpeakers(p.players, p.selfPid, p.group);
  const grid = speakers.length >= GRID_FROM;
  const { height } = useWindowDimensions();
  const toggle = (pid: number) => {
    if (p.disabled || pending.length) return;
    const on = members.includes(pid);
    setPending([pid]);
    p.onMembers(on ? members.filter((x) => x !== pid) : [...members, pid]);
  };
  const ungroup = () => {
    setPending(members);
    p.onMembers([]);
  };

  return (
    <Sheet
      visible={p.visible}
      id="group"
      title="Play together"
      closeLabel="Close speakers"
      onClose={p.onClose}
      subtitle={<Text style={s.sub}>{grouped ? `${members.length + 1} speakers play the same sound.` : `Tick a speaker to play what ${p.selfName} plays.`}</Text>}
    >
      {grouped && (
        <View style={s.master}>
          <Text style={s.label}>All speakers</Text>
          <View style={s.line}>
            <Tap accessibilityRole="button" accessibilityLabel={p.mute ? 'Unmute all speakers' : 'Mute all speakers'} disabled={p.disabled} onPress={() => p.onMute(!p.mute)} style={s.mute} hitSlop={8}>
              <MaterialCommunityIcons name={p.mute ? 'volume-off' : 'volume-high'} size={24} color={p.mute ? c.warn : c.text} />
            </Tap>
            <View style={s.flex}>
              <PillSlider testID="group-volume" accessibilityLabel="Volume for all speakers" min={0} max={100} value={p.volume} disabled={p.disabled} onValueChange={p.onVolume} />
            </View>
            <Text style={s.value}>{p.volume}</Text>
          </View>
        </View>
      )}
      <ScrollView testID="speaker-list" style={{ maxHeight: Math.max(420, height * 0.6) }} contentContainerStyle={[s.listContent, grid && s.grid]}>
        {speakers.map((sp) => {
          const self = sp.pid === p.selfPid;
          const on = self || members.includes(sp.pid);
          const member = p.group?.members.find((m) => m.pid === sp.pid);
          const name = self ? p.selfName : sp.name;
          const busy = pending.includes(sp.pid);
          return (
            <View key={sp.pid} testID={`speaker-tile-${sp.pid}`} style={[s.speaker, grid && s.tile, on && s.speakerOn]}>
              <Tap
                testID={`speaker-${sp.pid}`}
                accessibilityRole="checkbox"
                accessibilityLabel={name}
                accessibilityHint={self ? 'This soundbar always plays' : on ? 'Tap to stop playing here' : 'Tap to play here too'}
                accessibilityState={{ checked: on, disabled: self || p.disabled, busy }}
                disabled={self || p.disabled}
                onPress={() => toggle(sp.pid)}
                style={[s.row, grid && s.rowTile]}
              >
                <View style={s.check}>
                  {busy ? (
                    <ActivityIndicator size="small" color={c.accent} />
                  ) : (
                    <MaterialCommunityIcons name={on ? 'check-circle' : 'checkbox-blank-circle-outline'} size={26} color={on ? c.accent : c.muted} />
                  )}
                </View>
                <View style={s.flex}>
                  <Text numberOfLines={grid ? 2 : 1} style={s.name}>{name}</Text>
                  <Text numberOfLines={1} style={s.meta}>{self ? 'This soundbar' : member?.role === 'leader' ? 'Leads the group' : sp.model}</Text>
                </View>
              </Tap>
              {grouped && member && (
                <View style={s.line}>
                  <View style={s.flex}>
                    <PillSlider testID={`member-volume-${sp.pid}`} accessibilityLabel={`${name} volume`} min={0} max={100} value={member.volume} disabled={p.disabled} onValueChange={(v) => p.onMemberVolume(sp.pid, v)} />
                  </View>
                  {!grid && <Text style={s.value}>{member.volume ?? '–'}</Text>}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      {grouped && <Pill label="Stop playing together" variant="outline" block disabled={p.disabled} onPress={ungroup} />}
    </Sheet>
  );
}

const useStyles = makeStyles(({ c, type }) => ({
  sub: { ...type.secondary, color: c.muted },
  master: { gap: space(2) },
  label: { ...type.secondary, color: c.muted },
  line: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  mute: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  value: { ...type.body, color: c.text, fontVariant: ['tabular-nums'], width: 32, textAlign: 'right' },
  listContent: { gap: space(2) },
  speaker: { borderRadius: radii.tile, backgroundColor: c.surfaceHi, borderWidth: 1, borderColor: c.surfaceHi, padding: space(2), gap: space(2) },
  speakerOn: { borderColor: c.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: { width: '48.5%' },
  rowTile: { gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 48 },
  check: { width: 32, alignItems: 'center' },
  name: { ...type.body, fontFamily: type.chip.fontFamily, color: c.text },
  meta: { ...type.secondary, color: c.muted },
}));
