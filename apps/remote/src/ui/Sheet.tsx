import { useRef, type ReactNode } from 'react';
import { Animated, Modal, PanResponder, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles, MAX_CONTENT_WIDTH, radii, space } from '../theme';

/** A downward swipe on the sheet's top area closes it when long (80 dp) or fast (flick). */
export const shouldDismissSheet = (dy: number, vy: number): boolean => dy > 80 || (dy > 10 && vy > 0.8);

interface Props {
  visible: boolean;
  /** testID prefix: `${id}-sheet`, `${id}-grip`, `${id}-handle`. */
  id: string;
  title: string;
  /** Under the title, inside the swipe area. */
  subtitle?: ReactNode;
  closeLabel: string;
  onClose(): void;
  children: ReactNode;
}

/** The bottom sheet shared by EQ and grouping: slides up, closes on the scrim, back, or a swipe down on its grip. */
export function Sheet({ visible, id, title, subtitle, closeLabel, onClose, children }: Props) {
  // Edge-to-edge: the sheet sits behind the navigation bar unless it pads for it.
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const drag = useRef(new Animated.Value(0)).current;
  const close = useRef(onClose);
  close.current = onClose;
  const pan = useRef(
    PanResponder.create({
      // The grip holds nothing tappable, so it may own the gesture from the first touch.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (shouldDismissSheet(g.dy, g.vy)) {
          close.current();
          drag.setValue(0);
        } else {
          Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
    }),
  ).current;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel={closeLabel} />
      <Animated.View testID={`${id}-sheet`} style={[s.sheet, { paddingBottom: space(5) + insets.bottom, transform: [{ translateY: drag }] }]}>
        {/* Swipe-down area: the handle and title, away from the sliders' sideways drags. */}
        <View testID={`${id}-grip`} {...pan.panHandlers} style={s.grip}>
          <View testID={`${id}-handle`} style={s.handle} />
          <Text style={s.title}>{title}</Text>
          {subtitle}
        </View>
        {children}
      </Animated.View>
    </Modal>
  );
}

const useStyles = makeStyles(({ c, type }) => ({
  scrim: { flex: 1, backgroundColor: c.scrim },
  sheet: { maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center', backgroundColor: c.surface, borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card, padding: space(5), gap: space(4) },
  grip: { gap: space(3), paddingBottom: space(1) },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: space(1) },
  title: { ...type.cardTitle, color: c.text },
}));
