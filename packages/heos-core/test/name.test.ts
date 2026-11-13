import { afterEach, beforeEach, expect, it } from 'vitest';
import { nodeHttp } from '../src/node';
import { cleanName, getFriendlyName, MAX_NAME_LENGTH, setFriendlyName } from '../src/upnp/name';
import { FakeHeos } from './fake/fake-heos';

let fake: FakeHeos;
beforeEach(async () => { fake = await FakeHeos.start(); });
afterEach(async () => { await fake.stop(); });
const ep = () => ({ http: nodeHttp, baseUrl: `http://127.0.0.1:${fake.httpPort}`, timeoutMs: 1000 });

it('reads the name through ACT and writes it through GroupControl', async () => {
  expect(await getFriendlyName(ep())).toBe('Loving room');
  await setFriendlyName(ep(), 'Living room');
  expect(fake.state.name).toBe('Living room');
  expect(fake.soapReceived.some((a) => a.includes('SetDeviceFriendlyName'))).toBe(true);
});

it('escapes the name for SOAP', async () => {
  await setFriendlyName(ep(), 'Tom & Jerry <3 = fun');
  expect(fake.state.name).toBe('Tom & Jerry <3 = fun');
});

it('rejects an empty or over-long name', () => {
  expect(cleanName('  Bedroom  ')).toBe('Bedroom');
  expect(cleanName('   ')).toBeNull();
  expect(cleanName('')).toBeNull();
  expect(cleanName('x'.repeat(MAX_NAME_LENGTH + 1))).toBeNull();
  expect(cleanName('x'.repeat(MAX_NAME_LENGTH))).toHaveLength(MAX_NAME_LENGTH);
});

it('never sends an empty name to the bar (it locks the bar up)', async () => {
  await expect(setFriendlyName(ep(), '   ')).rejects.toThrow();
  expect(fake.soapReceived.some((a) => a.includes('SetDeviceFriendlyName'))).toBe(false);
});

it('treats a name made only of invisible characters as empty', async () => {
  expect(cleanName('​')).toBeNull();
  expect(cleanName('​‍﻿ ⁠')).toBeNull();
  expect(cleanName('Living​ room')).toBe('Living room');
  await expect(setFriendlyName(ep(), '​‌')).rejects.toThrow();
  expect(fake.soapReceived.some((a) => a.includes('SetDeviceFriendlyName'))).toBe(false);
});
