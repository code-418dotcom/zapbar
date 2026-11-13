import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Pill } from '../src/ui/Pill';
import { Tap } from '../src/ui/Tap';

const quick = () => jest.requireMock('../modules/zapbar-quick').default as { tick: jest.Mock };

beforeEach(() => quick().tick.mockClear());

it('ticks once per press and still runs the handler', async () => {
  const onPress = jest.fn();
  await render(<Pill label="EQ" onPress={onPress} />);
  await fireEvent.press(screen.getByText('EQ'));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(quick().tick).toHaveBeenCalledTimes(1);
});

it('ticks on long-press', async () => {
  const onLongPress = jest.fn();
  await render(<Tap accessibilityRole="button" onLongPress={onLongPress}><Text>HDMI 1</Text></Tap>);
  await fireEvent(screen.getByText('HDMI 1'), 'longPress');
  expect(onLongPress).toHaveBeenCalledTimes(1);
  expect(quick().tick).toHaveBeenCalledTimes(1);
});

it('stays silent when disabled', async () => {
  const onPress = jest.fn();
  await render(<Pill label="Retry" onPress={onPress} disabled />);
  await fireEvent.press(screen.getByText('Retry'));
  expect(onPress).not.toHaveBeenCalled();
  expect(quick().tick).not.toHaveBeenCalled();
});

it('does not tick for a press nobody handles', async () => {
  await render(<Tap accessibilityRole="button"><Text>Label</Text></Tap>);
  await fireEvent.press(screen.getByText('Label'));
  expect(quick().tick).not.toHaveBeenCalled();
});
