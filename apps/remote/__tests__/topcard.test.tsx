import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { bannerFor, TOP_CARD_HEIGHT, TopCard } from '../src/ui/TopCard';
import { SPOTIFY } from '../test-utils/fixtures';

const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const PS5 = { label: 'PS5', icon: 'playstation' as const, name: 'HDMI 1' };
const props = (over: Partial<ComponentProps<typeof TopCard>> = {}): ComponentProps<typeof TopCard> => ({
  status: 'ready', hasCaps: true, onLan: true, np: null, playState: 'play', input: PS5, soundMode: 'MOVIE_NORMAL', disabled: false,
  onPlayPause: jest.fn(), onNext: jest.fn(), onPrevious: jest.fn(), onRetry: jest.fn(), ...over,
});

it('streaming: shows the track and drives transport and the source app', async () => {
  const p = props({ np: SPOTIFY, input: null, onOpenApp: jest.fn() });
  await render(<TopCard {...p} />);
  expect(screen.getByText('Golden')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Pause'));
  await fireEvent.press(screen.getByLabelText('Next'));
  await fireEvent.press(screen.getByLabelText('Previous'));
  await fireEvent.press(screen.getByText('Open Spotify'));
  expect(p.onPlayPause).toHaveBeenCalled();
  expect(p.onNext).toHaveBeenCalled();
  expect(p.onPrevious).toHaveBeenCalled();
  expect(p.onOpenApp).toHaveBeenCalled();
});

it('on an input: shows the input, its port and the sound mode; long-press edits it', async () => {
  const p = props({ onEditInput: jest.fn() });
  await render(<TopCard {...p} />);
  expect(screen.getByText('PS5')).toBeTruthy();
  expect(screen.getByText('HDMI 1 · Movie')).toBeTruthy();
  await fireEvent(screen.getByLabelText('Now on PS5'), 'longPress');
  expect(p.onEditInput).toHaveBeenCalled();
});

it('offline: shows the reason and retries; off the LAN there is no retry', async () => {
  const p = props({ status: 'offline' });
  const { rerender } = await render(<TopCard {...p} />);
  expect(screen.getByText('Reconnecting…')).toBeTruthy();
  await fireEvent.press(screen.getByText('Retry'));
  expect(p.onRetry).toHaveBeenCalled();
  await rerender(<TopCard {...props({ onLan: false })} />);
  expect(screen.getByText('Connect to your home Wi-Fi')).toBeTruthy();
  expect(screen.queryByText('Retry')).toBeNull();
});

it('degraded: keeps the input visible and adds a note', async () => {
  await render(<TopCard {...props({ status: 'degraded' })} />);
  expect(screen.getByText('PS5')).toBeTruthy();
  expect(screen.getByText('Soundbar settings unavailable')).toBeTruthy();
});

it('keeps one fixed height in every state', async () => {
  const states = [props({ np: SPOTIFY, input: null }), props(), props({ status: 'offline' }), props({ input: null })];
  for (const p of states) {
    const { unmount } = await render(<TopCard {...p} />);
    expect(flat(screen.getByTestId('top-card').props.style).height).toBe(TOP_CARD_HEIGHT);
    await unmount();
  }
});

it('long text and missing art keep the card height', async () => {
  const long = 'An extremely long track title that would never fit on one line of a phone screen';
  await render(<TopCard {...props({ np: { ...SPOTIFY, title: long, artUrl: null }, input: null })} />);
  expect(screen.getByText(long).props.numberOfLines).toBe(1);
  expect(screen.getByLabelText('Zapbar')).toBeTruthy();
  expect(flat(screen.getByTestId('top-card').props.style).height).toBe(TOP_CARD_HEIGHT);
});

it('caps font scaling in the fixed-height card', async () => {
  await render(<TopCard {...props()} />);
  expect(screen.getByText('PS5').props.maxFontSizeMultiplier).toBeGreaterThan(1);
  expect(screen.getByText('HDMI 1 · Movie').props.maxFontSizeMultiplier).toBeGreaterThan(1);
});

describe('bannerFor', () => {
  it('prefers the LAN message', () => {
    expect(bannerFor('offline', true, false)).toEqual({ text: 'Connect to your home Wi-Fi', retry: false });
  });

  it('covers each connection state', () => {
    expect(bannerFor('ready', true, true)).toBeNull();
    expect(bannerFor('offline', true, true)).toEqual({ text: 'Reconnecting…', retry: true });
    expect(bannerFor('degraded', true, true)).toEqual({ text: 'Soundbar settings unavailable', retry: false });
    expect(bannerFor('connecting', false, true)).toEqual({ text: 'Connecting…', retry: false });
    expect(bannerFor('probing', true, true)).toBeNull();
  });
});

it('degraded note sits in the layout, never on top of the content', async () => {
  await render(<TopCard {...props({ status: 'degraded', np: SPOTIFY, input: null })} />);
  expect(flat(screen.getByText('Soundbar settings unavailable').props.style).position).not.toBe('absolute');
  expect(flat(screen.getByTestId('top-card-art').props.style).height).toBeLessThan(96);
});

it('shows a spinner and "Applying the new name…" while a rename settles, whatever the connection state', async () => {
  for (const status of ['degraded', 'offline', 'connecting'] as const) {
    const { unmount } = await render(<TopCard {...props({ status, applying: true, hasCaps: status !== 'connecting' })} />);
    expect(screen.getByText('Applying the new name…')).toBeTruthy();
    expect(screen.getByTestId('top-card-busy')).toBeTruthy();
    expect(screen.queryByText('Retry')).toBeNull();
    await unmount();
  }
});

it('downsamples remote art to its on-screen size', async () => {
  await render(<TopCard {...props({ np: SPOTIFY })} />);
  expect(screen.getByTestId('top-card-art').props.resizeMethod).toBe('resize');
});
