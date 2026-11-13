import { DEFAULT_APPEARANCE } from '../src/theme';
import { DeviceMemory, memoryKv } from '../src/runtime/memory';
import { effectiveAppearance, Supporter } from '../src/runtime/supporter';
import { FakeBilling } from './fakes/fake-billing';

const setup = () => {
  const billing = new FakeBilling();
  const memory = new DeviceMemory(memoryKv());
  return { billing, memory, s: new Supporter(billing, memory) };
};

it('loads products and marks a buyer of any tier as a supporter', async () => {
  const { billing, s, memory } = setup();
  billing.purchases = [{ id: 'supporter_2', state: 'owned', token: 't', acknowledged: true }];
  await s.refresh();
  const st = s.store.getState();
  expect(st.available).toBe(true);
  expect(st.products.map((p) => p.price)).toEqual(['€2.00', '€5.00', '€10.00']);
  expect(st.owned).toEqual(['supporter_2']);
  expect(st.supporter).toBe(true);
  expect(memory.supporter()).toBe(true);
});

it('acknowledges an owned purchase found at launch', async () => {
  const { billing, s } = setup();
  billing.purchases = [{ id: 'supporter_5', state: 'owned', token: 'late', acknowledged: false }];
  await s.refresh();
  expect(billing.acks).toEqual(['late']);
  expect(s.store.getState().supporter).toBe(true);
});

it('shows pending without unlocking, then unlocks once it completes', async () => {
  const { billing, s } = setup();
  billing.purchases = [{ id: 'supporter_10', state: 'pending', token: 'p', acknowledged: false }];
  await s.refresh();
  expect(s.store.getState()).toMatchObject({ pending: ['supporter_10'], owned: [], supporter: false });
  expect(billing.acks).toEqual([]);
  billing.purchases = [{ id: 'supporter_10', state: 'owned', token: 'p', acknowledged: false }];
  await s.refresh();
  expect(s.store.getState()).toMatchObject({ pending: [], owned: ['supporter_10'], supporter: true });
});

it('hides the tiles when billing is unavailable', async () => {
  const { billing, s } = setup();
  billing.isAvailable = false;
  await s.refresh();
  expect(s.store.getState().available).toBe(false);
});

it('a failed ownership check keeps cached perks', async () => {
  const { billing, memory } = setup();
  memory.setSupporter(true);
  memory.setAppearance({ ...DEFAULT_APPEARANCE, accent: 'sky', font: 'comic' });
  const fresh = new Supporter(billing, memory);
  billing.ownedError = new Error('offline');
  await fresh.refresh();
  expect(fresh.store.getState()).toMatchObject({ available: false, supporter: true, appearance: { accent: 'sky', font: 'comic' } });
  expect(memory.supporter()).toBe(true);
});

it('revocation resets appearance', async () => {
  const { billing, s, memory } = setup();
  billing.purchases = [{ id: 'supporter_2', state: 'owned', token: 't', acknowledged: true }];
  await s.refresh();
  s.setAppearance({ accent: 'coral', font: 'comic' });
  billing.purchases = []; // refunded
  await s.refresh();
  expect(s.store.getState()).toMatchObject({ supporter: false, appearance: DEFAULT_APPEARANCE });
  expect(memory.appearance()).toEqual(DEFAULT_APPEARANCE);
});

it('buys, acknowledges and unlocks', async () => {
  const { billing, s } = setup();
  await s.refresh();
  expect(await s.buy('supporter_5')).toBe('owned');
  expect(billing.acks).toEqual(['tok-supporter_5']);
  expect(s.store.getState()).toMatchObject({ owned: ['supporter_5'], supporter: true, busy: null });
});

it('a cancelled buy changes nothing', async () => {
  const { billing, s } = setup();
  await s.refresh();
  billing.buyResult = 'cancelled';
  expect(await s.buy('supporter_2')).toBe('cancelled');
  expect(s.store.getState()).toMatchObject({ supporter: false, busy: null });
});

it('a second buy while one is in flight is ignored', async () => {
  const { billing, s } = setup();
  await s.refresh();
  let open!: () => void;
  billing.buyGate = new Promise((r) => (open = r));
  const first = s.buy('supporter_2');
  expect(s.store.getState().busy).toBe('supporter_2');
  expect(await s.buy('supporter_10')).toBe('busy');
  open();
  await first;
  expect(billing.buyCalls).toEqual(['supporter_2']);
});

it('only supporters can change appearance, and non-supporters render the defaults', async () => {
  const { billing, s } = setup();
  await s.refresh();
  s.setAppearance({ font: 'comic' });
  expect(s.store.getState().appearance.font).toBe('jakarta');
  expect(effectiveAppearance({ supporter: false, appearance: { ...DEFAULT_APPEARANCE, accent: 'coral', font: 'comic' } })).toEqual(DEFAULT_APPEARANCE);
  billing.purchases = [{ id: 'supporter_2', state: 'owned', token: 't', acknowledged: true }];
  await s.refresh();
  s.setAppearance({ font: 'comic' });
  expect(s.store.getState().appearance).toEqual({ ...DEFAULT_APPEARANCE, font: 'comic' });
});

it('a failed product query still acknowledges and unlocks an owned purchase', async () => {
  const { billing, s } = setup();
  billing.purchases = [{ id: 'supporter_5', state: 'owned', token: 'late', acknowledged: false }];
  billing.products = async () => {
    throw new Error('product details unavailable');
  };
  await s.refresh();
  expect(billing.acks).toEqual(['late']);
  expect(s.store.getState()).toMatchObject({ supporter: true, owned: ['supporter_5'], available: false });
});

it('overlapping refreshes never let an older ownership read overwrite a newer one', async () => {
  const { billing, s } = setup();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const realOwned = billing.owned.bind(billing);
  let calls = 0;
  billing.owned = async () => {
    calls += 1;
    if (calls === 1) {
      await gate;
      return []; // this read was answered before the purchase landed
    }
    return realOwned();
  };
  const stale = s.refresh();
  billing.purchases = [{ id: 'supporter_2', state: 'owned', token: 't', acknowledged: true }];
  const fresh = s.refresh();
  await new Promise((r) => setTimeout(r, 10)); // the fresh read is answered first...
  release(); // ...then the stale one
  await Promise.all([stale, fresh]);
  expect(s.store.getState().supporter).toBe(true);
});

it('refund resets the silly perks', async () => {
  const { billing, s, memory } = setup();
  billing.purchases = [{ id: 'supporter_2', state: 'owned', token: 't', acknowledged: true }];
  await s.refresh();
  s.setAppearance({ dad: true, eleven: true });
  expect(s.store.getState().appearance).toMatchObject({ dad: true, eleven: true });
  billing.purchases = [];
  await s.refresh();
  expect(s.store.getState().appearance).toEqual(DEFAULT_APPEARANCE);
  expect(memory.appearance()).toEqual(DEFAULT_APPEARANCE);
});

it('a non-supporter cannot switch a perk on', () => {
  const { s } = setup();
  s.setAppearance({ pirate: true });
  expect(s.store.getState().appearance.pirate).toBe(false);
});

it('restore with an owned tip returns restored', async () => {
  const { billing, s } = setup();
  billing.onRestore = [{ id: 'supporter_5', state: 'owned', token: 'r', acknowledged: true }];
  await expect(s.restore()).resolves.toBe('restored');
  expect(billing.restoreCalls).toBe(1);
  expect(s.store.getState().supporter).toBe(true);
});

it('restore with nothing owned says so', async () => {
  const { s } = setup();
  await expect(s.restore()).resolves.toBe('none');
  expect(s.store.getState().supporter).toBe(false);
});

it('restore failure keeps perks', async () => {
  const { billing, s } = setup();
  billing.purchases = [{ id: 'supporter_2', state: 'owned', token: 't', acknowledged: true }];
  await s.refresh();
  billing.restoreError = new Error('signed out');
  await expect(s.restore()).resolves.toBe('failed');
  expect(s.store.getState().supporter).toBe(true);
});
