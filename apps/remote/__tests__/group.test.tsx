import { fireEvent, render, screen } from '@testing-library/react-native';
import { arrangeInputs } from '../src/runtime/inputs';
import { RemoteView, type RemoteActions } from '../src/ui/RemoteView';
import { groupTitle, orderSpeakers } from '../src/ui/GroupSheet';
import { CAPS, deviceState, GROUP, PLAYERS } from '../test-utils/fixtures';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

const actions = (): jest.Mocked<RemoteActions> => ({
  playInput: jest.fn(), setVolume: jest.fn(), setMute: jest.fn(), setPlayState: jest.fn(), next: jest.fn(), previous: jest.fn(),
  recallQuickSelect: jest.fn(), setSoundMode: jest.fn(), setDialogue: jest.fn(), setNight: jest.fn(), setBass: jest.fn(),
  setTreble: jest.fn(), setSubwoofer: jest.fn(), resetTone: jest.fn(), selectEqPreset: jest.fn(), reconnect: jest.fn(),
  openApp: jest.fn(), openSettings: jest.fn(), openSupport: jest.fn(), editInput: jest.fn(), showHidden: jest.fn(),
  setGroupMembers: jest.fn(), setMemberVolume: jest.fn(),
});
const inputs = arrangeInputs(CAPS.inputs, {});

it('hides grouping when the bar is the only HEOS speaker', async () => {
  await render(<RemoteView state={deviceState({ players: [PLAYERS[0]!] })} inputs={inputs} onLan actions={actions()} />);
  expect(screen.queryByTestId('group-button')).toBeNull();
});

it('adds a speaker with one tap; this bar cannot be unticked', async () => {
  const a = actions();
  await render(<RemoteView state={deviceState({ players: PLAYERS })} inputs={inputs} onLan actions={a} />);
  await fireEvent.press(screen.getByTestId('group-button'));
  expect(screen.getByText('Play together')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('speaker-7331878'));
  expect(a.setGroupMembers).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('speaker-202'));
  expect(a.setGroupMembers).toHaveBeenCalledWith([202]);
});

it('shows the group in the header and under the volume, and edits it', async () => {
  const a = actions();
  await render(<RemoteView state={deviceState({ players: PLAYERS, group: GROUP }, { volume: 33 })} inputs={inputs} onLan actions={a} />);
  expect(screen.getByText('Loving room + 1')).toBeTruthy();
  expect(screen.getByLabelText('Playing on 2 speakers')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('group-hint'));
  await fireEvent.press(screen.getByTestId('speaker-202'));
  expect(a.setGroupMembers).toHaveBeenLastCalledWith([101, 202]);
});

it('removes a member, sets one speaker, and stops playing together', async () => {
  const a = actions();
  await render(<RemoteView state={deviceState({ players: PLAYERS, group: GROUP })} inputs={inputs} onLan actions={a} />);
  await fireEvent.press(screen.getByTestId('group-button'));
  await fireEvent(screen.getByTestId('member-volume-101'), 'valueChange', 30);
  expect(a.setMemberVolume).toHaveBeenCalledWith(101, 30);
  await fireEvent(screen.getByTestId('group-volume'), 'valueChange', 50);
  expect(a.setVolume).toHaveBeenCalledWith(50);
  await fireEvent.press(screen.getByTestId('speaker-101'));
  expect(a.setGroupMembers).toHaveBeenLastCalledWith([]);
});

it('Stop playing together ungroups', async () => {
  const a = actions();
  await render(<RemoteView state={deviceState({ players: PLAYERS, group: GROUP })} inputs={inputs} onLan actions={a} />);
  await fireEvent.press(screen.getByTestId('group-button'));
  await fireEvent.press(screen.getByText('Stop playing together'));
  expect(a.setGroupMembers).toHaveBeenCalledWith([]);
});

it('blocks group changes while the bar is offline', async () => {
  const a = actions();
  await render(<RemoteView state={deviceState({ players: PLAYERS, status: 'offline' })} inputs={inputs} onLan actions={a} />);
  await fireEvent.press(screen.getByTestId('group-button'));
  await fireEvent.press(screen.getByTestId('speaker-101'));
  expect(a.setGroupMembers).not.toHaveBeenCalled();
});

it('titles and orders speakers', () => {
  expect(groupTitle('Den', null)).toBe('Den');
  expect(groupTitle('Den', GROUP)).toBe('Den + 1');
  expect(orderSpeakers(PLAYERS, 7331878, GROUP).map((p) => p.name)).toEqual(['Loving room', 'Kitchen', 'Patio']);
  expect(orderSpeakers([...PLAYERS].reverse(), 7331878, null).map((p) => p.name)).toEqual(['Loving room', 'Kitchen', 'Patio']);
});

it('lays out four or more speakers as half-width tiles so a multiroom setup fits on screen', async () => {
  const width = (pid: number) => {
    const style = screen.getByTestId(`speaker-tile-${pid}`).props.style;
    return Object.assign({}, ...[style].flat(Infinity).filter(Boolean)).width;
  };
  const many = [...PLAYERS, { pid: 303, name: 'Bedroom', model: 'Denon Home 150' }];
  const { unmount } = await render(<RemoteView state={deviceState({ players: many, group: GROUP })} inputs={inputs} onLan actions={actions()} />);
  await fireEvent.press(screen.getByTestId('group-button'));
  expect(many.map((p) => width(p.pid))).toEqual(['48.5%', '48.5%', '48.5%', '48.5%']);
  // Members keep their own volume slider inside the tile.
  expect(screen.getByTestId('member-volume-101')).toBeTruthy();
  await unmount();

  await render(<RemoteView state={deviceState({ players: PLAYERS })} inputs={inputs} onLan actions={actions()} />);
  await fireEvent.press(screen.getByTestId('group-button'));
  expect(width(202)).toBeUndefined();
});
