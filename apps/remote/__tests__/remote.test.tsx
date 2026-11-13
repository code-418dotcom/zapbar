import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { arrangeInputs } from '../src/runtime/inputs';
import { displayName } from '../src/runtime/memory';
import { AppearanceContext, DEFAULT_APPEARANCE, type Appearance } from '../src/theme';
import { RemoteView, type RemoteActions } from '../src/ui/RemoteView';
import { CAPS, deviceState, SPOTIFY } from '../test-utils/fixtures';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 48, left: 0 }) }));

const actions = (): jest.Mocked<RemoteActions> => ({
  playInput: jest.fn(), setVolume: jest.fn(), setMute: jest.fn(), setPlayState: jest.fn(), next: jest.fn(), previous: jest.fn(),
  recallQuickSelect: jest.fn(), setSoundMode: jest.fn(), setDialogue: jest.fn(), setNight: jest.fn(), setBass: jest.fn(),
  setTreble: jest.fn(), setSubwoofer: jest.fn(), resetTone: jest.fn(), selectEqPreset: jest.fn(), reconnect: jest.fn(),
  openApp: jest.fn(), openSettings: jest.fn(), openSupport: jest.fn(), editInput: jest.fn(), showHidden: jest.fn(),
  setGroupMembers: jest.fn(), setMemberVolume: jest.fn(),
});
const inputs = arrangeInputs(CAPS.inputs, { 'inputs/hdmi_in_1': { label: 'PS5', icon: 'playstation' } });

it('one tap on an input switches away from a stream (owner requirement)', async () => {
  const a = actions();
  await render(<RemoteView state={deviceState({}, { activeInput: null, nowPlaying: SPOTIFY, playState: 'play' })} inputs={inputs} onLan actions={a} />);
  expect(screen.getByText('Golden')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('input-inputs/hdmi_in_1'));
  expect(a.playInput).toHaveBeenCalledTimes(1);
  expect(a.playInput).toHaveBeenCalledWith('inputs/hdmi_in_1');
});

it('keeps every visible input tile rendered while a stream plays', async () => {
  await render(<RemoteView state={deviceState({}, { activeInput: null, nowPlaying: SPOTIFY })} inputs={inputs} onLan actions={actions()} />);
  for (const i of inputs.visible) expect(screen.getByTestId(`input-${i.mid}`)).toBeTruthy();
});

it('opens Spotify from the strip only for Spotify', async () => {
  const a = actions();
  const { rerender } = await render(<RemoteView state={deviceState({}, { activeInput: null, nowPlaying: SPOTIFY })} inputs={inputs} onLan actions={a} />);
  await fireEvent.press(screen.getByText('Open Spotify'));
  expect(a.openApp).toHaveBeenCalledWith(SPOTIFY);
  await rerender(<RemoteView state={deviceState({}, { activeInput: null, nowPlaying: { ...SPOTIFY, sourceId: 3, sourceName: 'TuneIn' } })} inputs={inputs} onLan actions={a} />);
  expect(screen.queryByText('Open TuneIn')).toBeNull();
});

it('disables controls and offers retry while offline', async () => {
  const a = actions();
  await render(<RemoteView state={deviceState({ status: 'offline' })} inputs={inputs} onLan actions={a} />);
  await fireEvent.press(screen.getByTestId('input-inputs/hdmi_arc_1'));
  expect(a.playInput).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Retry'));
  expect(a.reconnect).toHaveBeenCalled();
});

it('keeps inputs and volume working while degraded but disables sound settings', async () => {
  const a = actions();
  await render(<RemoteView state={deviceState({ status: 'degraded' })} inputs={inputs} onLan actions={a} />);
  await fireEvent.press(screen.getByTestId('input-inputs/hdmi_arc_1'));
  expect(a.playInput).toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Music'));
  expect(a.setSoundMode).not.toHaveBeenCalled();
});

it('opens the EQ sheet with tone sliders and reset, and no presets on this bar', async () => {
  const a = actions();
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={a} />);
  await fireEvent.press(screen.getByText('EQ'));
  await fireEvent(screen.getByTestId('eq-bass'), 'valueChange', 7);
  expect(a.setBass).toHaveBeenCalledWith(7);
  await fireEvent.press(screen.getByText('Reset to neutral'));
  expect(a.resetTone).toHaveBeenCalled();
  expect(screen.queryByText('Presets')).toBeNull();
});

it('shows EQ presets when the device offers them', async () => {
  const a = actions();
  await render(<RemoteView state={deviceState({ caps: { ...CAPS, eqPresets: ['Accoustic', 'Jazz'] } }, { eqPreset: 'Jazz' })} inputs={inputs} onLan actions={a} />);
  await fireEvent.press(screen.getByText('EQ'));
  await fireEvent.press(screen.getByText('Acoustic'));
  expect(a.selectEqPreset).toHaveBeenCalledWith('Accoustic');
});

it('opens settings and the input editor', async () => {
  const a = actions();
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={a} />);
  await fireEvent.press(screen.getByLabelText('Settings'));
  expect(a.openSettings).toHaveBeenCalled();
  await fireEvent(screen.getByTestId('input-inputs/hdmi_in_1'), 'longPress');
  expect(a.editInput).toHaveBeenCalledWith('inputs/hdmi_in_1');
});

it('offers "Support us" next to settings and opens the tips', async () => {
  const a = actions();
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={a} canTip />);
  await fireEvent.press(screen.getByLabelText('Support us'));
  expect(a.openSupport).toHaveBeenCalled();
});

it('hides "Support us" for supporters and when Play Billing is unavailable', async () => {
  const { rerender } = await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={actions()} canTip supporter />);
  expect(screen.queryByLabelText('Support us')).toBeNull();
  await rerender(<RemoteView state={deviceState()} inputs={inputs} onLan actions={actions()} />);
  expect(screen.queryByLabelText('Support us')).toBeNull();
});

it('keeps the EQ sheet buttons above the system navigation bar', async () => {
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={actions()} />);
  await fireEvent.press(screen.getByText('EQ'));
  const flat = Object.assign({}, ...[screen.getByTestId('eq-sheet').props.style].flat(Infinity).filter(Boolean));
  expect(flat.paddingBottom).toBeGreaterThanOrEqual(48 + 20);
});
it('shows the active input in the top card when nothing streams', async () => {
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={actions()} />);
  expect(screen.getByLabelText('Now on PS5')).toBeTruthy();
  expect(screen.getByText('HDMI 1 · Movie')).toBeTruthy();
});

it('long-press on the top card opens the editor for the active input', async () => {
  const a = actions();
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={a} />);
  await fireEvent(screen.getByLabelText('Now on PS5'), 'longPress');
  expect(a.editInput).toHaveBeenCalledWith('inputs/hdmi_in_1');
});

it('shows the brand mark and the room name in the header', async () => {
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={actions()} />);
  expect(screen.getByLabelText('Zapbar')).toBeTruthy();
  expect(screen.getByText('Loving room')).toBeTruthy();
});

it('EQ sheet has a drag handle and pill sliders', async () => {
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={actions()} />);
  await fireEvent.press(screen.getByText('EQ'));
  expect(screen.getByTestId('eq-handle')).toBeTruthy();
  expect(screen.getByTestId('eq-bass-fill')).toBeTruthy();
});

it('shows the display name chosen by the screen', async () => {
  await render(<RemoteView state={deviceState({ name: '', status: 'offline' })} displayName="Loving room" inputs={inputs} onLan actions={actions()} />);
  expect(screen.getByText('Loving room')).toBeTruthy();
});

it('displayName prefers nickname, then the reported name, then the remembered one', () => {
  const known = { key: 'S1', name: 'Old', model: 'm', lastIp: 'x' };
  expect(displayName({ ...known, nickname: 'Den' }, deviceState())).toBe('Den');
  expect(displayName(known, deviceState())).toBe('Loving room');
  expect(displayName(known, deviceState({ name: '' }))).toBe('Old');
  expect(displayName(undefined, null)).toBe('');
});

it('shows "Soundbar" while the bar still has its factory name', () => {
  const known = { key: 'S1', name: 'Denon DHT-S716H', model: 'Denon DHT-S716H', lastIp: 'x' };
  expect(displayName(known, deviceState({ name: 'Denon DHT-S716H' }))).toBe('Soundbar');
  expect(displayName(known, deviceState({ name: 'HEOS Bar' }))).toBe('Soundbar');
  expect(displayName({ ...known, name: 'Marantz Cinema 70s' }, deviceState({ name: '' }))).toBe('Soundbar');
  expect(displayName(known, deviceState({ name: 'Loving room' }))).toBe('Loving room');
  expect(displayName({ ...known, nickname: 'Den' }, deviceState())).toBe('Den');
});

it('fits on one screen: no Quick Select chips at the bottom', async () => {
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={actions()} />);
  expect(screen.queryByText('Watch TV')).toBeNull();
});

it('says the new name is being applied instead of "settings unavailable" right after a rename', async () => {
  await render(<RemoteView state={deviceState({ status: 'degraded' })} applying inputs={inputs} onLan actions={actions()} />);
  expect(screen.getByText('Applying the new name…')).toBeTruthy();
  expect(screen.queryByText('Soundbar settings unavailable')).toBeNull();
});

it('EQ sheet closes on a long or fast downward swipe, springs back otherwise', () => {
  const { shouldDismissSheet } = require('../src/ui/EqSheet');
  expect(shouldDismissSheet(120, 0.1)).toBe(true);
  expect(shouldDismissSheet(30, 1.2)).toBe(true);
  expect(shouldDismissSheet(30, 0.2)).toBe(false);
  expect(shouldDismissSheet(-200, -2)).toBe(false);
});

it('EQ sheet has a swipe area at the top for closing it', async () => {
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={actions()} />);
  await fireEvent.press(screen.getByText('EQ'));
  const grip = screen.getByTestId('eq-grip');
  expect(grip.props.onResponderMove ?? grip.props.onMoveShouldSetResponder).toBeTruthy();
});

it('shows the supporter heart next to the Z', async () => {
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={actions()} supporter />);
  expect(screen.getByLabelText('Supporter')).toBeTruthy();
});

it('shows no heart for non-supporters', async () => {
  await render(<RemoteView state={deviceState()} inputs={inputs} onLan actions={actions()} />);
  expect(screen.queryByLabelText('Supporter')).toBeNull();
});

describe('volume perks', () => {
  const withPerks = (p: Partial<Appearance>, ui: ReactElement) => (
    <AppearanceContext.Provider value={{ ...DEFAULT_APPEARANCE, ...p }}>{ui}</AppearanceContext.Provider>
  );

  it('goes to 11', async () => {
    await render(withPerks({ eleven: true }, <RemoteView state={deviceState({}, { volume: 100 })} inputs={inputs} onLan actions={actions()} />));
    expect(screen.getByText('11')).toBeTruthy();
    expect(screen.getByTestId('volume').props.maximumValue).toBe(100);
  });

  it('dad mode caps the slider and says so', async () => {
    const a = actions();
    await render(withPerks({ dad: true }, <RemoteView state={deviceState({}, { volume: 20 })} inputs={inputs} onLan actions={a} />));
    expect(screen.getByTestId('volume').props.maximumValue).toBe(30);
    await fireEvent(screen.getByTestId('volume'), 'valueChange', 30);
    expect(a.setVolume).toHaveBeenCalledWith(30);
    expect(screen.getByText("It's loud enough.")).toBeTruthy();
  });

  it('shows the cap note even after device error id 1', async () => {
    const a = actions();
    await render(withPerks({ dad: true }, <RemoteView state={deviceState({ lastError: { id: 1, text: 'Boom' } }, { volume: 20 })} inputs={inputs} onLan actions={a} />));
    expect(screen.getByText('Boom')).toBeTruthy();
    await fireEvent(screen.getByTestId('volume'), 'valueChange', 30);
    expect(screen.getByText("It's loud enough.")).toBeTruthy();
  });

  it('does not toast when the volume is moved down to the cap', async () => {
    const a = actions();
    await render(withPerks({ dad: true }, <RemoteView state={deviceState({}, { volume: 50 })} inputs={inputs} onLan actions={a} />));
    await fireEvent(screen.getByTestId('volume'), 'valueChange', 30);
    expect(screen.queryByText("It's loud enough.")).toBeNull();
  });
});

it('content is a centred column on wide screens', async () => {
  await render(<RemoteView state={deviceState({}, {})} inputs={inputs} onLan actions={actions()} />);
  expect(StyleSheet.flatten(screen.getByTestId('remote-scroll').props.contentContainerStyle)).toMatchObject({ maxWidth: 560, width: '100%', alignSelf: 'center' });
});
