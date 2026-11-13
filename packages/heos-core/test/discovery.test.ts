import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildMSearch, findIpByKey, HEOS_ST, listPlayers, parseSsdpResponse, uniqueIps } from '../src/discovery/ssdp';
import { nodeSocketFactory } from '../src/node';
import { FakeHeos } from './fake/fake-heos';

const RESPONSE = [
  'HTTP/1.1 200 OK',
  'CACHE-CONTROL: max-age=180',
  'LOCATION: http://10.0.0.82:60006/upnp/desc/aios_device/aios_device.xml',
  `ST: ${HEOS_ST}`,
  'USN: uuid:test::urn:schemas-denon-com:device:ACT-Denon:1',
  '',
  '',
].join('\r\n');

it('builds an M-SEARCH for HEOS devices', () => {
  const m = buildMSearch();
  expect(m.startsWith('M-SEARCH * HTTP/1.1\r\n')).toBe(true);
  expect(m).toContain(`ST: ${HEOS_ST}\r\n`);
  expect(m.endsWith('\r\n\r\n')).toBe(true);
});

it('parses a HEOS SSDP response and rejects others', () => {
  expect(parseSsdpResponse(RESPONSE, '10.0.0.82')).toEqual({ ip: '10.0.0.82', location: 'http://10.0.0.82:60006/upnp/desc/aios_device/aios_device.xml' });
  expect(parseSsdpResponse(RESPONSE.replace(HEOS_ST, 'upnp:rootdevice'), '10.0.0.5')).toBeNull();
  expect(parseSsdpResponse('NOTIFY * HTTP/1.1\r\n\r\n', '10.0.0.5')).toBeNull();
});

it('de-duplicates IPs', () => {
  expect(uniqueIps([{ ip: 'a', location: '1' }, { ip: 'a', location: '2' }, { ip: 'b', location: '3' }])).toEqual(['a', 'b']);
});

describe('against the fake device', () => {
  let fake: FakeHeos;
  beforeEach(async () => { fake = await FakeHeos.start(); });
  afterEach(() => fake.stop());

  it('lists players through any reachable IP', async () => {
    const players = await listPlayers(['127.0.0.9', '127.0.0.1'], nodeSocketFactory, fake.cliPort);
    expect(players).toEqual([expect.objectContaining({ key: 'TESTSERIAL0001', name: 'Loving room', ip: '127.0.0.1' })]);
  });

  it('finds the current IP of a device by key', async () => {
    expect(await findIpByKey(['127.0.0.9', '127.0.0.1'], 'TESTSERIAL0001', nodeSocketFactory, fake.cliPort)).toBe('127.0.0.1');
    expect(await findIpByKey(['127.0.0.1'], 'UNKNOWN', nodeSocketFactory, fake.cliPort)).toBeNull();
  });
});
