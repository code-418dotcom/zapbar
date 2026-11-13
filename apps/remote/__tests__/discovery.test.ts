import { HEOS_ST } from '@zapbar/heos-core';
import { browseIps, discoverIps, LocalNetworkDenied, nativeDiscover, type SearchFn } from '../src/runtime/discovery';

const mockSearchAsync = jest.fn(async () => [] as { ip: string; text: string }[]);
const mockBrowseAsync = jest.fn(async () => ['10.0.0.9']);
jest.mock('../modules/zapbar-discovery', () => ({
  __esModule: true,
  default: {
    searchAsync: (...a: unknown[]) => (mockSearchAsync as jest.Mock)(...a),
    browseAsync: (...a: unknown[]) => (mockBrowseAsync as jest.Mock)(...a),
  },
}));

beforeEach(() => {
  mockSearchAsync.mockClear();
  mockBrowseAsync.mockClear();
});

const reply = (st: string) =>
  `HTTP/1.1 200 OK\r\nLOCATION: http://10.0.0.82:60006/upnp/desc/aios_device/aios_device.xml\r\nST: ${st}\r\n\r\n`;

it('sends an M-SEARCH and returns unique HEOS IPs', async () => {
  const search: jest.MockedFunction<SearchFn> = jest.fn<ReturnType<SearchFn>, Parameters<SearchFn>>(async () => [
    { ip: '10.0.0.82', text: reply(HEOS_ST) },
    { ip: '10.0.0.82', text: reply(HEOS_ST) },
    { ip: '10.0.0.5', text: reply('upnp:rootdevice') },
  ]);
  await expect(discoverIps(search, 1500)).resolves.toEqual(['10.0.0.82']);
  expect(search.mock.calls[0]![0]).toContain(`ST: ${HEOS_ST}`);
  expect(search.mock.calls[0]![1]).toBe(1500);
});

it('returns no IPs when the native search fails', async () => {
  await expect(discoverIps(async () => { throw new Error('no wifi'); })).resolves.toEqual([]);
});

it('browseIps returns unique IPv4s in order', async () => {
  const browse = jest.fn(async () => ['10.0.0.5', '10.0.0.5', '10.0.0.7']);
  await expect(browseIps(browse)).resolves.toEqual(['10.0.0.5', '10.0.0.7']);
  expect(browse).toHaveBeenCalledWith('_heos-audio._tcp', 10000);
});

it('browseIps maps the denied code to LocalNetworkDenied', async () => {
  const browse = jest.fn(async () => {
    throw Object.assign(new Error('x'), { code: 'LOCAL_NETWORK_DENIED' });
  });
  await expect(browseIps(browse)).rejects.toBeInstanceOf(LocalNetworkDenied);
});

it('browseIps treats other failures as nothing found', async () => {
  await expect(browseIps(async () => { throw new Error('boom'); })).resolves.toEqual([]);
});

it('android keeps SSDP', async () => {
  await nativeDiscover('android')();
  expect(mockSearchAsync).toHaveBeenCalledWith(expect.stringContaining('M-SEARCH'), 3000);
  expect(mockBrowseAsync).not.toHaveBeenCalled();
});

it('ios browses Bonjour', async () => {
  await expect(nativeDiscover('ios')()).resolves.toEqual(['10.0.0.9']);
  expect(mockBrowseAsync).toHaveBeenCalledWith('_heos-audio._tcp', 10000);
  expect(mockSearchAsync).not.toHaveBeenCalled();
});
