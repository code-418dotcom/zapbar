import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { makeStyles, MAX_CONTENT_WIDTH, radii, space } from '../theme';

export interface ToastMessage {
  id: string | number;
  text: string;
}

export function Toast({ message }: { message: ToastMessage | null }) {
  const s = useStyles();
  const [shown, setShown] = useState<ToastMessage | null>(null);
  useEffect(() => {
    if (!message) return;
    setShown(message);
    const t = setTimeout(() => setShown(null), 3000);
    return () => clearTimeout(t);
  }, [message?.id]);
  if (!shown) return null;
  return (
    <View style={s.wrap}>
      <View style={s.toast} accessibilityLiveRegion="polite">
        <Text style={s.text}>{shown.text}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ c, type }) => ({
  // The wrapper keeps the phone insets; the toast is a centred column no wider than the content on large screens.
  wrap: { position: 'absolute', left: space(4), right: space(4), bottom: space(6), alignItems: 'center' },
  toast: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, backgroundColor: c.text, borderRadius: radii.card, padding: space(4) },
  text: { ...type.body, color: c.bg },
}));
