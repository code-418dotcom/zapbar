import { isTip, storeBilling, toOwned } from '../src/runtime/billing';

type Listener = (x: unknown) => void;
const mockListeners: { ok: Listener[]; err: Listener[] } = { ok: [], err: [] };
const mockIap = {
  initConnection: jest.fn(() => Promise.resolve(true)),
  getAvailablePurchases: jest.fn(() => Promise.resolve([])),
  fetchProducts: jest.fn(() => Promise.resolve([])),
  finishTransaction: jest.fn(() => Promise.resolve()),
  restorePurchases: jest.fn(() => Promise.resolve()),
  requestPurchase: jest.fn((): Promise<void> => Promise.resolve()),
  purchaseUpdatedListener: jest.fn((cb: Listener) => { mockListeners.ok.push(cb); return { remove: () => undefined }; }),
  purchaseErrorListener: jest.fn((cb: Listener) => { mockListeners.err.push(cb); return { remove: () => undefined }; }),
};
jest.mock('expo-iap', () => mockIap, { virtual: true });

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.ok = [];
  mockListeners.err = [];
});

it('recognises only the three tip products', () => {
  expect(isTip('supporter_2')).toBe(true);
  expect(isTip('supporter_10')).toBe(true);
  expect(isTip('premium')).toBe(false);
});

it('maps a purchased, unacknowledged Play purchase', () => {
  expect(toOwned({ productId: 'supporter_5', purchaseState: 'purchased', purchaseToken: 'tok', isAcknowledgedAndroid: false }, 'android')).toEqual({
    id: 'supporter_5', state: 'owned', token: 'tok', acknowledged: false,
  });
});

it('maps a pending purchase and ignores foreign products', () => {
  expect(toOwned({ productId: 'supporter_2', purchaseState: 'pending', purchaseToken: 't2' }, 'android')?.state).toBe('pending');
  expect(toOwned({ productId: 'something_else', purchaseState: 'purchased', purchaseToken: 't' }, 'android')).toBeNull();
});

it('drops purchases without a token', () => {
  expect(toOwned({ productId: 'supporter_2', purchaseState: 'purchased', purchaseToken: null }, 'android')).toBeNull();
});

it('never treats an unknown purchase state as owned', () => {
  expect(toOwned({ productId: 'supporter_2', purchaseState: 'unknown', purchaseToken: 't' }, 'android')).toBeNull();
});

it('treats App Store entitlements as acknowledged', () => {
  expect(toOwned({ productId: 'supporter_5', purchaseState: 'purchased', purchaseToken: 'jws' }, 'ios'))
    .toEqual({ id: 'supporter_5', state: 'owned', token: 'jws', acknowledged: true });
});

it('ignores a revoked App Store purchase', () => {
  expect(toOwned({ productId: 'supporter_5', purchaseState: 'purchased', purchaseToken: 'jws', revocationDateIOS: 1760000000000 }, 'ios')).toBeNull();
});

it('is available on ios when StoreKit connects', async () => {
  await expect(storeBilling('ios').available()).resolves.toBe(true);
});

it('lists tips smallest first, whatever order the store answers in', async () => {
  (mockIap.fetchProducts as jest.Mock).mockResolvedValueOnce([
    { id: 'supporter_5', displayPrice: '$4.00' },
    { id: 'supporter_2', displayPrice: '$2.00' },
    { id: 'supporter_10', displayPrice: '$9.00' },
  ]);
  const ids = (await storeBilling('ios').products()).map((p) => p.id);
  expect(ids).toEqual(['supporter_2', 'supporter_5', 'supporter_10']);
});

it('is unavailable on other platforms', async () => {
  await expect(storeBilling('web').available()).resolves.toBe(false);
});

it('ios buy sends the apple request and finishes the transaction', async () => {
  mockIap.requestPurchase.mockImplementationOnce(async () => {
    mockListeners.ok.forEach((cb) => cb({ productId: 'supporter_2', purchaseState: 'purchased', purchaseToken: 'jws' }));
  });
  await expect(storeBilling('ios').buy('supporter_2')).resolves.toBe('owned');
  expect(mockIap.requestPurchase).toHaveBeenCalledWith({ request: { apple: { sku: 'supporter_2' } }, type: 'in-app' });
  expect(mockIap.finishTransaction).toHaveBeenCalledWith(expect.objectContaining({ isConsumable: false }));
});

it('android buy still sends the google request', async () => {
  mockIap.requestPurchase.mockImplementationOnce(async () => {
    mockListeners.ok.forEach((cb) => cb({ productId: 'supporter_2', purchaseState: 'purchased', purchaseToken: 'tok' }));
  });
  await expect(storeBilling('android').buy('supporter_2')).resolves.toBe('owned');
  expect(mockIap.requestPurchase).toHaveBeenCalledWith({ request: { google: { skus: ['supporter_2'] } }, type: 'in-app' });
  expect(mockIap.finishTransaction).not.toHaveBeenCalled();
});

it('maps the iOS cancel code to cancelled', async () => {
  mockIap.requestPurchase.mockImplementationOnce(async () => {
    mockListeners.err.forEach((cb) => cb({ code: 'user-cancelled' }));
  });
  await expect(storeBilling('ios').buy('supporter_2')).resolves.toBe('cancelled');
});

it('restore calls restorePurchases on ios only', async () => {
  await storeBilling('ios').restore();
  expect(mockIap.restorePurchases).toHaveBeenCalledTimes(1);
  await storeBilling('android').restore();
  expect(mockIap.restorePurchases).toHaveBeenCalledTimes(1);
});
