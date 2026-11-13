import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { palettes, ThemeOverride } from '../src/theme';
import { Pill } from '../src/ui/Pill';
import { pct, PillSlider } from '../src/ui/PillSlider';

const dark = (ui: ReactElement) => <ThemeOverride.Provider value="dark">{ui}</ThemeOverride.Provider>;
const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('Pill', () => {
  it('presses, reports selection and uses onAccent text when selected', async () => {
    const onPress = jest.fn();
    await render(dark(<Pill label="Movie" selected onPress={onPress} />));
    await fireEvent.press(screen.getByText('Movie'));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Movie' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(flat(screen.getByText('Movie').props.style).color).toBe(palettes.dark.onAccent);
  });

  it('ignores presses while disabled', async () => {
    const onPress = jest.fn();
    await render(dark(<Pill label="EQ" disabled onPress={onPress} />));
    await fireEvent.press(screen.getByText('EQ'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('acts as a switch when toggle is set', async () => {
    await render(dark(<Pill label="Night" toggle selected accessibilityLabel="Night mode" onPress={jest.fn()} />));
    expect(screen.getByLabelText('Night mode').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('caps font scaling on its label', async () => {
    await render(dark(<Pill label="Dialogue" onPress={jest.fn()} />));
    expect(screen.getByText('Dialogue').props.maxFontSizeMultiplier).toBeGreaterThan(1);
  });
});

describe('PillSlider', () => {
  it('maps the value to a fill width and clamps it', () => {
    expect(pct(42, 0, 100)).toBe(42);
    expect(pct(5, 0, 10)).toBe(50);
    expect(pct(null, 0, 10)).toBe(0);
    expect(pct(150, 0, 100)).toBe(100);
  });

  it('drives a native slider with step 1 and forwards changes', async () => {
    const onValueChange = jest.fn();
    await render(dark(<PillSlider testID="volume" accessibilityLabel="Volume" min={0} max={100} value={42} onValueChange={onValueChange} />));
    const slider = screen.getByTestId('volume');
    expect(slider.props.value).toBe(42);
    expect(slider.props.step).toBe(1);
    expect(flat(screen.getByTestId('volume-fill').props.style).width).toBe('42%');
    await fireEvent(slider, 'valueChange', 50);
    expect(onValueChange).toHaveBeenCalledWith(50);
  });
});

describe('PillSlider geometry', () => {
  it('keeps the knob centre on the same 0–100% path as the finger once the width is known', async () => {
    await render(dark(<PillSlider testID="v" accessibilityLabel="V" min={0} max={100} value={50} onValueChange={jest.fn()} />));
    await fireEvent(screen.getByTestId('v-track'), 'layout', { nativeEvent: { layout: { width: 300, height: 48, x: 0, y: 0 } } });
    // knob centre = fill width − 24 must equal 24 + pct × (width − 48)
    expect(flat(screen.getByTestId('v-fill').props.style).width).toBe(48 + 0.5 * 252);
  });

  it('does not dim itself when disabled; the owner of the row does', async () => {
    await render(dark(<PillSlider testID="v" accessibilityLabel="V" min={0} max={100} value={50} disabled onValueChange={jest.fn()} />));
    expect(flat(screen.getByTestId('v-track').props.style).opacity).toBeUndefined();
  });
});
