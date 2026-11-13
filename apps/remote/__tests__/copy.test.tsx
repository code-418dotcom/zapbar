import { render, screen } from '@testing-library/react-native';
import { AppearanceContext, DEFAULT_APPEARANCE } from '../src/theme';
import { copy, type CopyKey } from '../src/ui/copy';
import { VolumeBar } from '../src/ui/VolumeBar';

const KEYS: CopyKey[] = ['pickInput', 'reconnecting', 'offLan', 'volume', 'mute', 'unmute', 'soundbars'];

it('maps plain and pirate copy', () => {
  expect(copy('mute', false)).toBe('Mute');
  expect(copy('mute', true)).toBe('Silence the parrot');
});

it('every key has a non-empty plain and pirate value', () => {
  for (const k of KEYS) {
    expect(copy(k, false)).not.toBe('');
    expect(copy(k, true)).not.toBe('');
    expect(copy(k, true)).not.toBe(copy(k, false));
  }
});

it('VolumeBar speaks pirate and keeps the plain word as the hint', async () => {
  await render(
    <AppearanceContext.Provider value={{ ...DEFAULT_APPEARANCE, pirate: true }}>
      <VolumeBar volume={20} mute={false} disabled={false} onVolume={jest.fn()} onMute={jest.fn()} />
    </AppearanceContext.Provider>,
  );
  expect(screen.getByLabelText('Hoist the volume').props.accessibilityHint).toBe('Volume');
  expect(screen.getByLabelText('Silence the parrot').props.accessibilityHint).toBe('Mute');
});

it('VolumeBar stays plain without the perk', async () => {
  await render(<VolumeBar volume={20} mute onVolume={jest.fn()} onMute={jest.fn()} disabled={false} />);
  expect(screen.getByLabelText('Unmute')).toBeTruthy();
  expect(screen.getByLabelText('Volume')).toBeTruthy();
});
