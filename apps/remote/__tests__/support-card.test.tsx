import { DEFAULT_APPEARANCE, PERK_IDS } from '../src/theme';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { SupporterState } from '../src/runtime/supporter';
import { PERK_LABELS, SupportCard } from '../src/ui/SupportCard';

const base: SupporterState = {
  available: true,
  products: [
    { id: 'supporter_2', price: '€2.00' },
    { id: 'supporter_5', price: '€5.00' },
    { id: 'supporter_10', price: '€10.00' },
  ],
  owned: [],
  pending: [],
  busy: null,
  supporter: false,
  appearance: DEFAULT_APPEARANCE,
};
const h = (restore: 'restored' | 'none' | 'failed' = 'none', canRestore = false) => ({
  onBuy: jest.fn(),
  onAppearance: jest.fn(),
  canRestore,
  onRestore: jest.fn(() => Promise.resolve(restore)),
});

it("shows Play's prices and the honest line, and buys a tier", async () => {
  const x = h();
  await render(<SupportCard state={base} {...x} />);
  expect(screen.getByText('Zapbar is free and stays free. Tips unlock a badge, extra colours and some very silly perks, nothing else.')).toBeTruthy();
  await fireEvent.press(screen.getByText('€5.00'));
  expect(x.onBuy).toHaveBeenCalledWith('supporter_5');
  expect(screen.queryByText('Accent colour')).toBeNull();
});

it('renders nothing when billing is unavailable and the user is not a supporter', async () => {
  await render(<SupportCard state={{ ...base, available: false, products: [] }} {...h()} />);
  expect(screen.queryByText(/free and stays free/)).toBeNull();
});

it('marks owned and pending tiers', async () => {
  await render(<SupportCard state={{ ...base, owned: ['supporter_2'], pending: ['supporter_10'], supporter: true }} {...h()} />);
  expect(screen.getByLabelText('€2.00, owned')).toBeTruthy();
  expect(screen.getByText('Pending')).toBeTruthy();
});

it('a supporter picks an accent and the Comic Neue font, even offline', async () => {
  const x = h();
  await render(<SupportCard state={{ ...base, available: false, products: [], supporter: true }} {...x} />);
  expect(screen.getByText('♥ Supporter, thank you')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Coral'));
  expect(x.onAppearance).toHaveBeenCalledWith({ accent: 'coral' });
  await fireEvent.press(screen.getByText('Comic Neue — for the lulz'));
  expect(x.onAppearance).toHaveBeenCalledWith({ font: 'comic' });
});

it('disables the tiles while a purchase runs', async () => {
  const x = h();
  await render(<SupportCard state={{ ...base, busy: 'supporter_2' }} {...x} />);
  await fireEvent.press(screen.getByText('€10.00'));
  expect(x.onBuy).not.toHaveBeenCalled();
});

it('a supporter switches each silly perk', async () => {
  const x = h();
  await render(<SupportCard state={{ ...base, supporter: true }} {...x} />);
  expect(screen.getByText('Silly perks')).toBeTruthy();
  for (const id of PERK_IDS) {
    await fireEvent(screen.getByLabelText(PERK_LABELS[id]), 'valueChange', true);
    expect(x.onAppearance).toHaveBeenCalledWith({ [id]: true });
  }
});

it('non-supporters never see the silly perks', async () => {
  await render(<SupportCard state={base} {...h()} />);
  expect(screen.queryByText('Silly perks')).toBeNull();
});

it('shows Restore purchases on ios and reports the result', async () => {
  const x = h('none', true);
  await render(<SupportCard state={base} {...x} />);
  await fireEvent.press(screen.getByText('Restore purchases'));
  expect(x.onRestore).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('No tips found for this Apple ID')).toBeTruthy();
});

it('no restore link on android', async () => {
  await render(<SupportCard state={base} {...h('none', false)} />);
  expect(screen.queryByText('Restore purchases')).toBeNull();
});

it('restored shows thanks', async () => {
  await render(<SupportCard state={base} {...h('restored', true)} />);
  await fireEvent.press(screen.getByText('Restore purchases'));
  expect(await screen.findByText('Tips restored, thank you')).toBeTruthy();
});

it('failed restore says try again', async () => {
  await render(<SupportCard state={base} {...h('failed', true)} />);
  await fireEvent.press(screen.getByText('Restore purchases'));
  expect(await screen.findByText("Couldn't reach the App Store. Try again later.")).toBeTruthy();
});
