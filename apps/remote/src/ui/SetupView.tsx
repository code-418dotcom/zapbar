import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { FoundPlayer, InputSource } from '@zapbar/heos-core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { tick } from '../runtime/haptics';
import { choicesFor, ICONS, questionFor, type ChoiceId } from '../runtime/inputs';
import type { SetupStep } from '../setup/flow';
import { FIXED_TEXT_SCALE, makeStyles, MAX_CONTENT_WIDTH, radii, space, useTheme } from '../theme';
import { Pill } from './Pill';
import { ZMark } from './ZMark';
import { Tap } from './Tap';

interface Props {
  step: SetupStep;
  onPick(p: FoundPlayer): void;
  onManual(ip: string): void;
  onRescan(): void;
  onAnswer(id: ChoiceId): void;
  onFinish(usedMids: string[]): void;
  onOpenSettings(): void;
}

/** A gentle opacity loop instead of a bare spinner. */
function Pulse({ children }: { children: ReactNode }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ opacity: v }}>{children}</Animated.View>;
}

/** How long a tapped answer stays highlighted before the next question replaces it. */
export const CHOICE_HOLD_MS = 400;

/** One labelling question. Keyed per question, so its state starts fresh each time. */
function LabelStep({ input, index, total, onAnswer }: { input: InputSource; index: number; total: number; onAnswer(id: ChoiceId): void }) {
  const { c } = useTheme();
  const s = useStyles();
  const [chosen, setChosen] = useState<ChoiceId | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enter]);
  const pick = (id: ChoiceId) => {
    if (chosen) return;
    setChosen(id);
    tick();
    timer.current = setTimeout(() => onAnswer(id), CHOICE_HOLD_MS);
  };
  const done = index + (chosen ? 1 : 0);
  return (
    <ScrollView testID="setup-choices-scroll" contentContainerStyle={s.scrollPage}>
      <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: index + 1 }} style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${(Math.max(done, 0.15) / total) * 100}%` }]} />
      </View>
      <Text style={s.progress}>
        {index + 1} of {total}
      </Text>
      <Animated.View style={{ gap: space(4), opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
        <Text style={s.title}>{questionFor(input)}</Text>
        <View style={s.choices}>
          {choicesFor(input).map((ch) => {
            const on = chosen === ch.id;
            const fg = on ? c.onAccent : c.text;
            return (
              <Pressable
                key={ch.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: !!chosen && !on }}
                onPress={() => pick(ch.id)}
                style={({ pressed }) => [s.choice, ch.id === 'unused' && s.choiceOutline, pressed && !chosen && s.pressed, on && s.choiceOn, !!chosen && !on && s.choiceOff]}
              >
                <MaterialCommunityIcons name={ICONS[ch.icon]} size={24} color={fg} />
                <Text maxFontSizeMultiplier={FIXED_TEXT_SCALE} style={[s.choiceText, { color: fg }]}>{ch.label}</Text>
                {on && <MaterialCommunityIcons name="check-circle" size={20} color={fg} style={s.check} />}
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </ScrollView>
  );
}

export function SetupView({ step, onPick, onManual, onRescan, onAnswer, onFinish, onOpenSettings }: Props) {
  const { c } = useTheme();
  const s = useStyles();
  const [ip, setIp] = useState('');
  const [used, setUsed] = useState<string[]>([]);
  switch (step.kind) {
    case 'scanning':
    case 'connecting':
      return (
        <View style={s.center}>
          <Pulse>
            <ZMark size={96} color={c.accent} />
          </Pulse>
          <Text style={s.title}>{step.kind === 'scanning' ? "Let's find your soundbar" : `Connecting to ${step.name}…`}</Text>
          {step.kind === 'scanning' && <Text style={s.body}>Looking on your Wi-Fi…</Text>}
        </View>
      );
    case 'pick':
      return (
        <ScrollView testID="setup-pick-scroll" contentContainerStyle={s.scrollPage} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>Which soundbar?</Text>
          {step.players.map((p) => (
            <Tap key={p.key} accessibilityRole="button" onPress={() => onPick(p)} style={({ pressed }) => [s.card, pressed && s.cardPressed]}>
              <Text style={s.cardTitle}>{p.name}</Text>
              <Text style={s.cardSub}>{p.model}</Text>
            </Tap>
          ))}
        </ScrollView>
      );
    case 'manual':
      return (
        <ScrollView testID="setup-manual-scroll" contentContainerStyle={s.scrollPage} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>Couldn't find your soundbar</Text>
          <Text style={s.body}>Check that your phone is on the same Wi-Fi, or enter the soundbar's IP address.</Text>
          {step.error && <Text style={s.error}>{step.error}</Text>}
          <TextInput
            accessibilityLabel="Soundbar IP address"
            value={ip}
            onChangeText={setIp}
            placeholder="192.168.1.20"
            placeholderTextColor={c.muted}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            style={s.input}
          />
          <Pill label="Connect" variant="primary" block onPress={() => onManual(ip)} />
          {step.denied && <Pill label="Open Settings" variant="primary" block onPress={onOpenSettings} />}
          <Pill label="Search again" variant="outline" block onPress={onRescan} />
        </ScrollView>
      );
    case 'label':
      return <LabelStep key={step.index} input={step.input} index={step.index} total={step.total} onAnswer={onAnswer} />;
    case 'extras':
      return (
        <ScrollView testID="setup-extras-scroll" contentContainerStyle={s.scrollPage} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>Do you use any of these?</Text>
          {step.inputs.map((i) => (
            <View key={i.mid} style={s.toggleRow}>
              <Text style={s.body}>{i.name}</Text>
              <Switch
                accessibilityLabel={i.name}
                value={used.includes(i.mid)}
                onValueChange={(on) => setUsed((u) => (on ? [...u, i.mid] : u.filter((m) => m !== i.mid)))}
                trackColor={{ true: c.accent, false: c.surfaceHi }}
                thumbColor={used.includes(i.mid) ? c.surface : c.muted}
              />
            </View>
          ))}
          <Pill label="Done" variant="primary" block onPress={() => onFinish(used)} />
        </ScrollView>
      );
    case 'done':
      return null;
  }
}

const useStyles = makeStyles(({ c, type }) => ({
  center: { flex: 1, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', alignItems: 'center', justifyContent: 'center', gap: space(4), padding: space(6) },
  scrollPage: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', padding: space(6), gap: space(4) },
  title: { ...type.display, color: c.text },
  body: { ...type.body, color: c.muted },
  error: { ...type.body, color: c.danger },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: c.surfaceHi, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: c.accent },
  progress: { ...type.secondary, color: c.muted },
  card: { backgroundColor: c.surface, borderRadius: radii.card, padding: space(4), minHeight: 64 },
  cardPressed: { backgroundColor: c.surfaceHi },
  cardTitle: { ...type.cardTitle, color: c.text },
  cardSub: { ...type.secondary, color: c.muted },
  input: { ...type.body, fontSize: 17, backgroundColor: c.surface, color: c.text, borderRadius: radii.pill, paddingHorizontal: space(5), minHeight: 52 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  choice: { width: '47.5%', minHeight: 64, borderRadius: radii.tile, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4) },
  choiceOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border },
  choiceOn: { backgroundColor: c.accent, borderColor: c.accent },
  choiceOff: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  check: { marginLeft: 'auto' },
  choiceText: { ...type.body, fontFamily: type.chip.fontFamily, color: c.text, flexShrink: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
}));
