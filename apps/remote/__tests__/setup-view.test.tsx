import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { FIXED_TEXT_SCALE } from '../src/theme';
import { CHOICE_HOLD_MS, SetupView } from '../src/ui/SetupView';

const hold = () => act(() => jest.advanceTimersByTime(CHOICE_HOLD_MS));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const handlers = () => ({ onPick: jest.fn(), onManual: jest.fn(), onRescan: jest.fn(), onAnswer: jest.fn(), onFinish: jest.fn(), onOpenSettings: jest.fn() });

it('asks about an HDMI input and reports the answer', async () => {
  const h = handlers();
  await render(<SetupView step={{ kind: 'label', input: { mid: 'inputs/hdmi_in_1', name: 'HDMI 1' }, index: 1, total: 5 }} {...h} />);
  expect(screen.getByText("What's on HDMI 1?")).toBeTruthy();
  expect(screen.getByText('2 of 5')).toBeTruthy();
  await fireEvent.press(screen.getByText('PS5'));
  await hold();
  expect(h.onAnswer).toHaveBeenCalledWith('playstation');
});

it('marks the tapped answer before moving on, so the tap visibly registers', async () => {
  const h = handlers();
  await render(<SetupView step={{ kind: 'label', input: { mid: 'inputs/hdmi_in_1', name: 'HDMI 1' }, index: 1, total: 5 }} {...h} />);
  await fireEvent.press(screen.getByText('PS5'));
  const tile = screen.getByRole('button', { name: /PS5/ });
  expect(tile.props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByRole('button', { name: /Switch 2/ }).props.accessibilityState).toMatchObject({ selected: false, disabled: true });
  expect(h.onAnswer).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(CHOICE_HOLD_MS - 1));
  expect(h.onAnswer).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(1));
  expect(h.onAnswer).toHaveBeenCalledTimes(1);
});

it('ignores a second tap while the first answer is showing', async () => {
  const h = handlers();
  await render(<SetupView step={{ kind: 'label', input: { mid: 'inputs/hdmi_in_1', name: 'HDMI 1' }, index: 1, total: 5 }} {...h} />);
  await fireEvent.press(screen.getByText('PS5'));
  await fireEvent.press(screen.getByText('Switch 2'));
  await hold();
  expect(h.onAnswer).toHaveBeenCalledTimes(1);
  expect(h.onAnswer).toHaveBeenCalledWith('playstation');
});

it('gives one haptic tick per answer', async () => {
  const quick = jest.requireMock('../modules/zapbar-quick').default as { tick: jest.Mock };
  quick.tick.mockClear();
  const h = handlers();
  await render(<SetupView step={{ kind: 'label', input: { mid: 'inputs/hdmi_in_1', name: 'HDMI 1' }, index: 1, total: 5 }} {...h} />);
  await fireEvent.press(screen.getByText('PS5'));
  await fireEvent.press(screen.getByText('Switch 2'));
  expect(quick.tick).toHaveBeenCalledTimes(1);
});

it('still answers when the haptic call fails', async () => {
  const quick = jest.requireMock('../modules/zapbar-quick').default as { tick: jest.Mock };
  quick.tick.mockImplementationOnce(() => Promise.reject(new Error('no haptics')));
  const h = handlers();
  await render(<SetupView step={{ kind: 'label', input: { mid: 'inputs/hdmi_in_1', name: 'HDMI 1' }, index: 1, total: 5 }} {...h} />);
  await fireEvent.press(screen.getByText('PS5'));
  await hold();
  expect(h.onAnswer).toHaveBeenCalledWith('playstation');
});

it('starts the next question unselected', async () => {
  const h = handlers();
  const step = (index: number) => ({ kind: 'label', input: { mid: `inputs/hdmi_in_${index + 1}`, name: `HDMI ${index + 1}` }, index, total: 5 }) as const;
  const { rerender } = await render(<SetupView step={step(1)} {...h} />);
  await fireEvent.press(screen.getByText('PS5'));
  await hold();
  await rerender(<SetupView step={step(2)} {...h} />);
  expect(screen.getByRole('button', { name: /PS5/ }).props.accessibilityState).toMatchObject({ selected: false, disabled: false });
  await fireEvent.press(screen.getByText('Switch 2'));
  await hold();
  expect(h.onAnswer).toHaveBeenLastCalledWith('switch2');
});

it('drops a pending answer when the screen goes away mid-hold', async () => {
  const h = handlers();
  const { unmount } = await render(<SetupView step={{ kind: 'label', input: { mid: 'inputs/hdmi_in_1', name: 'HDMI 1' }, index: 1, total: 5 }} {...h} />);
  await fireEvent.press(screen.getByText('PS5'));
  await act(() => unmount());
  await hold();
  expect(h.onAnswer).not.toHaveBeenCalled();
});

it('scrolls the device choices so all of them fit on a small phone', async () => {
  const h = handlers();
  await render(<SetupView step={{ kind: 'label', input: { mid: 'inputs/hdmi_in_1', name: 'HDMI 1' }, index: 1, total: 5 }} {...h} />);
  expect(screen.getByTestId('setup-choices-scroll')).toBeTruthy();
  await fireEvent.press(screen.getByText('Switch 2'));
  await hold();
  expect(h.onAnswer).toHaveBeenCalledWith('switch2');
});

it('keeps long device names inside their tile instead of running past its edge', async () => {
  const h = handlers();
  await render(<SetupView step={{ kind: 'label', input: { mid: 'inputs/hdmi_in_1', name: 'HDMI 1' }, index: 1, total: 5 }} {...h} />);
  const label = screen.getByText('Xbox Series X|S');
  // A Text in a row does not shrink by default, so a long name overflows the 47.5% tile instead of wrapping.
  expect(StyleSheet.flatten(label.props.style)).toMatchObject({ flexShrink: 1 });
  expect(label.props.maxFontSizeMultiplier).toBe(FIXED_TEXT_SCALE);
});

it('shows the manual error and submits the typed IP', async () => {
  const h = handlers();
  await render(<SetupView step={{ kind: 'manual', error: 'No soundbar answered at 10.0.0.9' }} {...h} />);
  expect(screen.getByText('No soundbar answered at 10.0.0.9')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Soundbar IP address'), '10.0.0.82');
  await fireEvent.press(screen.getByText('Connect'));
  expect(h.onManual).toHaveBeenCalledWith('10.0.0.82');
  await fireEvent.press(screen.getByText('Search again'));
  expect(h.onRescan).toHaveBeenCalled();
});

it('denied manual step offers Open Settings', async () => {
  const h = handlers();
  await render(<SetupView step={{ kind: 'manual', error: 'denied', denied: true }} {...h} />);
  await fireEvent.press(screen.getByText('Open Settings'));
  expect(h.onOpenSettings).toHaveBeenCalled();
  expect(screen.getByText('Search again')).toBeTruthy();
});

it('a plain manual step has no Open Settings button', async () => {
  const h = handlers();
  await render(<SetupView step={{ kind: 'manual', error: null }} {...h} />);
  expect(screen.queryByText('Open Settings')).toBeNull();
});

it('lets the user pick among several devices', async () => {
  const h = handlers();
  const p = { key: 'S2', pid: 2, name: 'Bedroom', model: 'Denon Home 150', version: '', ip: '10.0.0.90', network: 'wifi' };
  await render(<SetupView step={{ kind: 'pick', players: [p] }} {...h} />);
  await fireEvent.press(screen.getByText('Bedroom'));
  expect(h.onPick).toHaveBeenCalledWith(p);
});

it('toggles extra inputs and finishes', async () => {
  const h = handlers();
  await render(<SetupView step={{ kind: 'extras', inputs: [{ mid: 'inputs/optical_in_1', name: 'Optical In' }, { mid: 'inputs/aux_in_1', name: 'AUX In' }] }} {...h} />);
  await fireEvent(screen.getByLabelText('Optical In'), 'valueChange', true);
  await fireEvent.press(screen.getByText('Done'));
  expect(h.onFinish).toHaveBeenCalledWith(['inputs/optical_in_1']);
});
it('welcomes with the brand mark while scanning', async () => {
  const h = handlers();
  await render(<SetupView step={{ kind: 'scanning' }} {...h} />);
  expect(screen.getByLabelText('Zapbar')).toBeTruthy();
  expect(screen.getByText("Let's find your soundbar")).toBeTruthy();
  expect(screen.getByText('Looking on your Wi-Fi…')).toBeTruthy();
});

it('shows labelling progress as a progress bar', async () => {
  const h = handlers();
  await render(<SetupView step={{ kind: 'label', input: { mid: 'inputs/hdmi_in_1', name: 'HDMI 1' }, index: 1, total: 5 }} {...h} />);
  expect(screen.getByRole('progressbar').props.accessibilityValue).toMatchObject({ min: 0, max: 5, now: 2 });
});

it('scrolls the manual, pick and extras steps so landscape and the keyboard cannot hide the buttons', async () => {
  const h = handlers();
  const p = { key: 'S1', name: 'Loving room', model: 'Denon DHT-S716H', lastIp: '10.0.0.82' };
  const steps = [
    [{ kind: 'manual' }, 'setup-manual-scroll', 'Connect'],
    [{ kind: 'pick', players: [p] }, 'setup-pick-scroll', 'Loving room'],
    [{ kind: 'extras', inputs: [{ mid: 'inputs/aux_in_1', name: 'AUX In' }] }, 'setup-extras-scroll', 'Done'],
  ] as const;
  for (const [step, id, text] of steps) {
    const { unmount } = await render(<SetupView step={step as never} {...h} />);
    const scroll = screen.getByTestId(id);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(within(scroll).getByText(text)).toBeTruthy();
    await unmount();
  }
});
