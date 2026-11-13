import { useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { arrangeInputs, moveInput } from '../../src/runtime/inputs';
import { useActiveDevice, useManager, useUi } from '../../src/runtime/RuntimeProvider';
import { useTheme } from '../../src/theme';
import { InputsEditor } from '../../src/ui/InputsEditor';

export default function InputsScreen() {
  const m = useManager();
  const { c } = useTheme();
  const state = useActiveDevice();
  const prefs = useUi((s) => (state ? s.prefs[state.key] : undefined));
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const [pending, setPending] = useState<Array<[string, string]>>([]);
  const { all } = arrangeInputs(state?.caps?.inputs ?? [], prefs ?? {});
  const rename = (mid: string, label: string) => m.setInputPref(mid, { label: label.trim() || undefined });

  // Back (gesture, button or hardware) with an unsaved name asks first: nothing is saved or lost silently.
  usePreventRemove(pending.length > 0, ({ repeat }) => {
    const leave = () => {
      setPending([]);
      repeat();
    };
    Alert.alert('Save changes?', 'An input name has not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: leave },
      {
        text: 'Save',
        onPress: () => {
          pending.forEach(([mid, label]) => rename(mid, label));
          leave();
        },
      },
    ]);
  });

  return (
    <SafeAreaView edges={Platform.OS === 'ios' ? ['bottom', 'left', 'right'] : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <InputsEditor
        inputs={all}
        focus={focus}
        onRename={rename}
        onIcon={(mid, icon) => m.setInputPref(mid, { icon })}
        onHidden={(mid, hidden) => m.setInputPref(mid, { hidden })}
        onMove={(mid, delta) => m.setInputOrder(moveInput(all.map((i) => i.mid), mid, delta))}
        onDraftsChange={setPending}
      />
    </SafeAreaView>
  );
}
