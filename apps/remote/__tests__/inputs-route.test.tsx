import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import InputsScreen from '../app/settings/inputs';
import { DeviceManager } from '../src/runtime/manager';
import { DeviceMemory, memoryKv } from '../src/runtime/memory';
import { RuntimeProvider } from '../src/runtime/RuntimeProvider';
import { deviceState } from '../test-utils/fixtures';

let leaveHandler: ((o: { data: { action: unknown }; repeat: () => void }) => void) | undefined;
let preventing = false;
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  usePreventRemove: (prevent: boolean, cb: typeof leaveHandler) => {
    preventing = prevent;
    leaveHandler = cb;
  },
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: () => () => {}, configure: () => {} }));

const KEY = 'TESTSERIAL0001';
function setup() {
  const memory = new DeviceMemory(memoryKv());
  memory.saveDevice({ key: KEY, name: 'Loving room', model: 'm', lastIp: '10.0.0.82' });
  const m = new DeviceManager({ socketFactory: () => new Promise(() => {}), http: async () => ({ status: 500, text: '' }), memory, discover: async () => [] });
  m.store.setState({ devices: { [KEY]: deviceState() } });
  return m;
}

async function leaveWith(choice: 'Save' | 'Discard') {
  const m = setup();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<RuntimeProvider manager={m}><InputsScreen /></RuntimeProvider>);
  await fireEvent.changeText(screen.getByLabelText('Label for HDMI 1'), 'PS5');
  expect(preventing).toBe(true);
  const repeat = jest.fn();
  await act(async () => leaveHandler!({ data: { action: {} }, repeat }));
  const buttons = alert.mock.calls[0]![2]!;
  await act(async () => buttons.find((b) => b.text === choice)!.onPress!());
  alert.mockRestore();
  return { m, repeat };
}

it('Save on leaving writes the unsaved name, then leaves', async () => {
  const { m, repeat } = await leaveWith('Save');
  expect(m.ui.getState().prefs[KEY]?.['inputs/hdmi_in_1']?.label).toBe('PS5');
  expect(repeat).toHaveBeenCalledTimes(1);
});

it('Discard on leaving drops the unsaved name, then leaves', async () => {
  const { m, repeat } = await leaveWith('Discard');
  expect(m.ui.getState().prefs[KEY]?.['inputs/hdmi_in_1']?.label).toBeUndefined();
  expect(repeat).toHaveBeenCalledTimes(1);
});
