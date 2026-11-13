import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, View } from 'react-native';
import { arrangeInputs } from '../src/runtime/inputs';
import { AppearanceContext, DEFAULT_APPEARANCE, type Appearance } from '../src/theme';
import { RemoteView, type RemoteActions } from '../src/ui/RemoteView';
import { CAPS, deviceState } from '../test-utils/fixtures';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 48, left: 0 }) }));

const actions = (): jest.Mocked<RemoteActions> => ({
  playInput: jest.fn(), setVolume: jest.fn(), setMute: jest.fn(), setPlayState: jest.fn(), next: jest.fn(), previous: jest.fn(),
  recallQuickSelect: jest.fn(), setSoundMode: jest.fn(), setDialogue: jest.fn(), setNight: jest.fn(), setBass: jest.fn(),
  setTreble: jest.fn(), setSubwoofer: jest.fn(), resetTone: jest.fn(), selectEqPreset: jest.fn(), reconnect: jest.fn(),
  openApp: jest.fn(), openSettings: jest.fn(), openSupport: jest.fn(), editInput: jest.fn(), showHidden: jest.fn(), setGroupMembers: jest.fn(), setMemberVolume: jest.fn(),
});
const inputs = arrangeInputs(CAPS.inputs, {});
const ui = (mute: boolean, perks: Partial<Appearance> = {}, supporter = true) => (
  <AppearanceContext.Provider value={{ ...DEFAULT_APPEARANCE, ...perks }}>
    <RemoteView state={deviceState({}, { mute })} inputs={inputs} onLan actions={actions()} supporter={supporter} />
  </AppearanceContext.Provider>
);
const tapZ = async (n: number) => {
  for (let i = 0; i < n; i++) await fireEvent.press(screen.getByRole('button', { name: 'Zapbar' }));
};

let now = 1_000_000;
beforeEach(() => {
  jest.useFakeTimers();
  now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('seven taps on the Z make a developer', async () => {
  await render(ui(false));
  await tapZ(6);
  expect(screen.queryByText('You are now a developer.')).toBeNull();
  await tapZ(1);
  expect(screen.getByText('You are now a developer.')).toBeTruthy();
});

it('taps spread over more than 3 s do nothing', async () => {
  await render(ui(false));
  for (let i = 0; i < 7; i++) {
    await fireEvent.press(screen.getByRole('button', { name: 'Zapbar' }));
    now += 700;
  }
  expect(screen.queryByText('You are now a developer.')).toBeNull();
});

it('non-supporter Z is inert', async () => {
  await render(ui(false, {}, false));
  expect(screen.queryByRole('button', { name: 'Zapbar' })).toBeNull();
  await fireEvent.press(screen.getByLabelText('Zapbar'));
  expect(screen.queryByText('You are now a developer.')).toBeNull();
});

it('unmute from the app bursts confetti', async () => {
  await render(ui(true, { confetti: true }));
  stubMeasure(screen.getByLabelText('Unmute'), (cb) => cb(10, 20, 48, 48));
  await fireEvent.press(screen.getByLabelText('Unmute'));
  expect(screen.getAllByTestId('confetti-piece')).toHaveLength(24);
  await act(async () => {
    jest.advanceTimersByTime(1300);
  });
  expect(screen.queryAllByTestId('confetti-piece')).toHaveLength(0);
});

it('no confetti without the perk', async () => {
  await render(ui(true));
  await fireEvent.press(screen.getByLabelText('Unmute'));
  expect(screen.queryAllByTestId('confetti-piece')).toHaveLength(0);
});

it('external unmute fires no confetti', async () => {
  const { rerender } = await render(ui(true, { confetti: true }));
  await rerender(ui(false, { confetti: true }));
  expect(screen.queryAllByTestId('confetti-piece')).toHaveLength(0);
});

it('reduce motion skips confetti', async () => {
  (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
  await render(ui(true, { confetti: true }));
  stubMeasure(screen.getByLabelText('Unmute'), (cb) => cb(10, 20, 48, 48));
  await act(async () => {});
  await fireEvent.press(screen.getByLabelText('Unmute'));
  expect(screen.queryAllByTestId('confetti-piece')).toHaveLength(0);
});

it('turning reduce motion off later does not replay a suppressed burst', async () => {
  let changed: (v: boolean) => void = () => {};
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_e: string, cb: (v: boolean) => void) => {
    changed = cb;
    return { remove: jest.fn() };
  }) as never);
  (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
  await render(ui(true, { confetti: true }));
  stubMeasure(screen.getByLabelText('Unmute'), (cb) => cb(10, 20, 48, 48));
  await act(async () => {});
  await fireEvent.press(screen.getByLabelText('Unmute'));
  expect(screen.queryAllByTestId('confetti-piece')).toHaveLength(0);
  await act(async () => changed(false));
  expect(screen.queryAllByTestId('confetti-piece')).toHaveLength(0);
});

// jest's host instances have a no-op measureInWindow that never calls back; stub it on their prototype.
// jest's View mock has a no-op measureInWindow that never calls back; stub it on the class.
const stubMeasure = (_host: unknown, impl: (cb: (x: number, y: number, w: number, h: number) => void) => void) =>
  jest.spyOn(View.prototype as unknown as { measureInWindow: () => void }, 'measureInWindow').mockImplementation(impl as never);

it('confetti starts at the button measured on press, relative to the root', async () => {
  await render(ui(true, { confetti: true }));
  const measure = stubMeasure(screen.getByLabelText('Unmute'), (cb) => cb(100, 200, 48, 48));
  await fireEvent.press(screen.getByLabelText('Unmute'));
  // Button centre (124, 224) in the window; the root also reports (100, 200) as its offset.
  expect(measure).toHaveBeenCalled();
  const piece = screen.getAllByTestId('confetti-piece')[0]!;
  expect(piece.props.style).toMatchObject({ left: 24, top: 24 });
  expect(screen.getAllByTestId('confetti-piece')).toHaveLength(24);
});
