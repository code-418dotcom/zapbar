import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { InputGrid } from '../src/ui/InputGrid';
import { modeLabel, SoundRow } from '../src/ui/SoundRow';
import { Toast } from '../src/ui/Toast';
import { VolumeBar } from '../src/ui/VolumeBar';
import { CAPS, deviceState } from '../test-utils/fixtures';

const INPUTS = [
  { mid: 'inputs/hdmi_arc_1', label: 'TV', icon: 'tv' as const, hidden: false },
  { mid: 'inputs/hdmi_in_1', label: 'PS5', icon: 'playstation' as const, hidden: false },
];

describe('InputGrid', () => {
  const props = () => ({ inputs: INPUTS, hiddenCount: 0, active: 'inputs/hdmi_in_1', disabled: false, onSelect: jest.fn(), onEdit: jest.fn(), onShowHidden: jest.fn() });

  it('selects an input with one tap and marks the active one', async () => {
    const p = props();
    await render(<InputGrid {...p} />);
    await fireEvent.press(screen.getByTestId('input-inputs/hdmi_arc_1'));
    expect(p.onSelect).toHaveBeenCalledWith('inputs/hdmi_arc_1');
    expect(screen.getByTestId('input-inputs/hdmi_in_1').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('opens the editor on long press and shows the hidden count', async () => {
    const p = { ...props(), hiddenCount: 3 };
    await render(<InputGrid {...p} />);
    await fireEvent(screen.getByTestId('input-inputs/hdmi_in_1'), 'longPress');
    expect(p.onEdit).toHaveBeenCalledWith('inputs/hdmi_in_1');
    await fireEvent.press(screen.getByText('+3 hidden'));
    expect(p.onShowHidden).toHaveBeenCalled();
  });

  it('ignores taps while disabled', async () => {
    const p = { ...props(), disabled: true };
    await render(<InputGrid {...p} />);
    await fireEvent.press(screen.getByTestId('input-inputs/hdmi_arc_1'));
    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it('long labels truncate to one line', async () => {
    const p = { ...props(), inputs: [{ ...INPUTS[0]!, label: 'A'.repeat(60) }] };
    await render(<InputGrid {...p} />);
    expect(screen.getByText('A'.repeat(60)).props.numberOfLines).toBe(1);
  });

  it('tile labels cap font scaling', async () => {
    await render(<InputGrid {...props()} />);
    expect(screen.getByText('PS5').props.maxFontSizeMultiplier).toBeGreaterThan(1);
  });
});

describe('VolumeBar', () => {
  it('reports slider changes and toggles mute', async () => {
    const onVolume = jest.fn();
    const onMute = jest.fn();
    await render(<VolumeBar volume={35} mute={false} disabled={false} onVolume={onVolume} onMute={onMute} />);
    await fireEvent(screen.getByTestId('volume'), 'valueChange', 40);
    expect(onVolume).toHaveBeenCalledWith(40);
    await fireEvent.press(screen.getByLabelText('Mute'));
    expect(onMute).toHaveBeenCalledWith(true);
    expect(screen.getByText('35')).toBeTruthy();
  });

  it('holds the thumb under the finger while the bar reports other volumes', async () => {
    const onVolume = jest.fn();
    const bar = (v: number) => <VolumeBar volume={v} mute={false} disabled={false} onVolume={onVolume} onMute={jest.fn()} />;
    const slider = () => screen.getByTestId('volume');
    const { rerender } = await render(bar(35));
    await fireEvent(slider(), 'slidingStart', 35);
    await fireEvent(slider(), 'valueChange', 50);
    await rerender(bar(42)); // a late report arrives mid-drag
    expect(slider().props.value).toBe(50);
    expect(screen.getByText('50')).toBeTruthy();
    await fireEvent(slider(), 'slidingComplete', 50);
    expect(onVolume).toHaveBeenLastCalledWith(50);
    await rerender(bar(12)); // changed elsewhere after the drag
    expect(slider().props.value).toBe(12);
  });
});

describe('VolumeBar cap toast', () => {
  it('reports the cap again after a value below it arrives', async () => {
    const onCapHit = jest.fn();
    const bar = (v: number) => <VolumeBar volume={v} mute={false} disabled={false} cap={30} onVolume={jest.fn()} onMute={jest.fn()} onCapHit={onCapHit} />;
    const { rerender } = await render(bar(20));
    await fireEvent(screen.getByTestId('volume'), 'valueChange', 30); // accessibility increment, no drag
    expect(onCapHit).toHaveBeenCalledTimes(1);
    await rerender(bar(30));
    await rerender(bar(25));
    await rerender(bar(26));
    await fireEvent(screen.getByTestId('volume'), 'valueChange', 30);
    expect(onCapHit).toHaveBeenCalledTimes(2);
  });
});

describe('Toast', () => {
  it('is a centred column no wider than the content', async () => {
    await render(<Toast message={{ id: 1, text: 'Hi' }} />);
    const wrap = StyleSheet.flatten(screen.getByText('Hi').parent!.parent!.props.style);
    const toast = StyleSheet.flatten(screen.getByText('Hi').parent!.props.style);
    expect(wrap).toMatchObject({ left: 16, right: 16, alignItems: 'center' });
    expect(toast).toMatchObject({ width: '100%', maxWidth: 560 });
  });

  it('shows an error and hides it after 3 s', async () => {
    jest.useFakeTimers();
    await render(<Toast message={{ id: 1, text: "Couldn't change input, soundbar didn't respond" }} />);
    expect(screen.getByText("Couldn't change input, soundbar didn't respond")).toBeTruthy();
    await act(() => jest.advanceTimersByTime(3100));
    expect(screen.queryByText("Couldn't change input, soundbar didn't respond")).toBeNull();
    jest.useRealTimers();
  });
});

describe('SoundRow', () => {
  const h = () => ({ onSoundMode: jest.fn(), onDialogue: jest.fn(), onNight: jest.fn(), onOpenEq: jest.fn() });

  it('labels modes and drives every control', async () => {
    const p = h();
    await render(<SoundRow caps={CAPS} settings={deviceState().settings} disabled={false} {...p} />);
    await fireEvent.press(screen.getByText('Music'));
    expect(p.onSoundMode).toHaveBeenCalledWith('MUSIC_NORMAL');
    await fireEvent.press(screen.getByText('High'));
    expect(p.onDialogue).toHaveBeenCalledWith(3);
    await fireEvent.press(screen.getByLabelText('Night mode'));
    expect(p.onNight).toHaveBeenCalledWith(1);
    await fireEvent.press(screen.getByText('EQ'));
    expect(p.onOpenEq).toHaveBeenCalled();
    expect(modeLabel('SOME_NEW_MODE')).toBe('Some new mode');
  });

  it('hides controls the device lacks', async () => {
    await render(<SoundRow caps={{ ...CAPS, dialogue: null, night: null, soundModes: [] }} settings={deviceState().settings} disabled={false} {...h()} />);
    expect(screen.queryByText('Dialogue')).toBeNull();
    expect(screen.queryByLabelText('Night mode')).toBeNull();
    expect(screen.queryByText('Movie')).toBeNull();
  });

  it('night pill reflects the state and turns night mode off again', async () => {
    const p = h();
    await render(<SoundRow caps={CAPS} settings={deviceState({}, { nightLevel: 1 }).settings} disabled={false} {...p} />);
    expect(screen.getByLabelText('Night mode').props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByLabelText('Night mode'));
    expect(p.onNight).toHaveBeenCalledWith(0);
  });
});

