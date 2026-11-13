import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ConnectionStatus, NowPlaying, PlayState } from '@zapbar/heos-core';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { ICONS, type IconId } from '../runtime/inputs';
import { FIXED_TEXT_SCALE, makeStyles, radii, space, useTheme } from '../theme';
import { copy, useCopy } from './copy';
import { Pill } from './Pill';
import { modeLabel } from './SoundRow';
import { ZMark } from './ZMark';
import { Tap } from './Tap';

/** One height for every state, so switching between a stream and an input never moves the tiles below. */
export const TOP_CARD_HEIGHT = 196;
export const DEGRADED_TEXT = 'Soundbar settings unavailable';

export function bannerFor(status: ConnectionStatus, hasCaps: boolean, onLan: boolean, pirate = false): { text: string; retry: boolean } | null {
  if (!onLan) return { text: copy('offLan', pirate), retry: false };
  if (status === 'offline') return { text: copy('reconnecting', pirate), retry: true };
  if (status === 'degraded') return { text: DEGRADED_TEXT, retry: false };
  // A quick reconnect on app resume keeps the last state on screen without a banner.
  if ((status === 'connecting' || status === 'probing') && !hasCaps) return { text: 'Connecting…', retry: false };
  return null;
}

export interface CardInput {
  label: string;
  icon: IconId;
  /** The device's own name for the port, e.g. "HDMI 1". */
  name: string;
}

interface Props {
  status: ConnectionStatus;
  hasCaps: boolean;
  onLan: boolean;
  np: NowPlaying | null;
  playState: PlayState;
  input: CardInput | null;
  soundMode: string | null;
  disabled: boolean;
  onPlayPause(): void;
  onNext(): void;
  onPrevious(): void;
  onOpenApp?: () => void;
  onRetry(): void;
  onEditInput?: () => void;
  /** A rename is settling: show that instead of connection trouble. */
  applying?: boolean;
}

export function TopCard(p: Props) {
  const { c, appearance } = useTheme();
  const t = useCopy();
  const s = useStyles();
  const banner = p.applying ? null : bannerFor(p.status, p.hasCaps, p.onLan, appearance.pirate);
  const note = banner?.text === DEGRADED_TEXT ? banner.text : null;
  const blocking = banner && !note ? banner : null;

  let body;
  if (p.applying) {
    body = (
      <View style={s.center} accessibilityRole="progressbar">
        <ActivityIndicator testID="top-card-busy" size="large" color={c.accent} />
        <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={s.title}>Applying the new name…</Text>
        <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={s.sub}>The soundbar restarts its controls</Text>
      </View>
    );
  } else if (blocking) {
    body = (
      <View style={s.center} accessibilityRole="alert">
        <MaterialCommunityIcons name={p.onLan ? 'lan-disconnect' : 'wifi-off'} size={40} color={c.warn} />
        <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={[s.title, { color: c.warn }]}>{blocking.text}</Text>
        {blocking.retry && <Pill label="Retry" variant="primary" onPress={p.onRetry} />}
      </View>
    );
  } else if (p.np) {
    const playing = p.playState === 'play';
    body = (
      <View style={s.stream}>
        {p.np.artUrl ? (
          <Image testID="top-card-art" source={{ uri: p.np.artUrl }} style={[s.art, note && s.artCompact]} resizeMode="cover" resizeMethod="resize" />
        ) : (
          <View testID="top-card-art" style={[s.art, s.noArt, note && s.artCompact]}>
            <ZMark size={44} color={c.accent} />
          </View>
        )}
        <View style={s.row}>
          <View style={s.meta}>
            <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={s.title}>{p.np.title}</Text>
            <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={s.sub}>
              {[p.np.artist, p.np.sourceName].filter(Boolean).join(' · ')}
            </Text>
            {p.onOpenApp && (
              <Tap onPress={p.onOpenApp} accessibilityRole="link" hitSlop={8}>
                <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} style={s.link}>Open {p.np.sourceName}</Text>
              </Tap>
            )}
          </View>
          <IconBtn icon="skip-previous" label="Previous" onPress={p.onPrevious} disabled={p.disabled} />
          <IconBtn icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} onPress={p.onPlayPause} disabled={p.disabled} primary />
          <IconBtn icon="skip-next" label="Next" onPress={p.onNext} disabled={p.disabled} />
        </View>
      </View>
    );
  } else if (p.input) {
    const sub = [p.input.name, p.soundMode ? modeLabel(p.soundMode) : null].filter(Boolean).join(' · ');
    body = (
      <Tap style={s.center} onLongPress={p.onEditInput} accessibilityLabel={`Now on ${p.input.label}`} accessibilityHint="Long-press to edit this input">
        <View style={s.disc}>
          <MaterialCommunityIcons name={ICONS[p.input.icon]} size={52} color={c.accent} />
        </View>
        <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={s.title}>{p.input.label}</Text>
        <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={s.sub}>{sub}</Text>
      </Tap>
    );
  } else {
    body = (
      <View style={s.center}>
        <ZMark size={44} color={c.accent} />
        <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} style={s.sub}>{t('pickInput')}</Text>
      </View>
    );
  }

  return (
    <View testID="top-card" style={s.card}>
      <View style={s.body}>{body}</View>
      {note && (
        <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} numberOfLines={1} style={s.note}>{note}</Text>
      )}
    </View>
  );
}

function IconBtn({ icon, label, onPress, disabled, primary }: { icon: 'skip-previous' | 'skip-next' | 'play' | 'pause'; label: string; onPress(): void; disabled: boolean; primary?: boolean }) {
  const { c } = useTheme();
  const s = useStyles();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} hitSlop={4} style={[s.btn, primary && s.btnPrimary, disabled && s.disabled]}>
      <MaterialCommunityIcons name={icon} size={primary ? 26 : 28} color={primary ? c.onAccent : c.text} />
    </Tap>
  );
}

const useStyles = makeStyles(({ c, type }) => ({
  card: { height: TOP_CARD_HEIGHT, backgroundColor: c.surface, borderRadius: radii.card, padding: space(3), overflow: 'hidden' },
  body: { flex: 1, minHeight: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(2) },
  stream: { flex: 1, gap: space(2) },
  art: { width: '100%', height: 96, borderRadius: radii.tile },
  // Makes room for the degraded note below the content.
  artCompact: { height: 64 },
  noArt: { backgroundColor: c.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  meta: { flex: 1, minWidth: 0 },
  title: { ...type.cardTitle, color: c.text },
  sub: { ...type.secondary, color: c.muted },
  link: { ...type.secondary, color: c.text, textDecorationLine: 'underline' },
  disc: { width: 84, height: 84, borderRadius: 42, backgroundColor: c.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  btn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: c.accent },
  disabled: { opacity: 0.4 },
  note: { ...type.secondary, color: c.warn, textAlign: 'center', paddingTop: space(1) },
}));
