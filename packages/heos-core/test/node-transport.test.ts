import net from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { nodeSocketFactory } from '../src/node';

let server: net.Server | undefined;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

it('splits CRLF lines across chunk boundaries', async () => {
  server = net.createServer((s) => {
    s.write('{"a":1}\r\n{"b"');
    setTimeout(() => { s.write(':2}\r\n'); s.end(); }, 20);
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as net.AddressInfo).port;
  const sock = await nodeSocketFactory('127.0.0.1', port);
  const lines: string[] = [];
  sock.onLine((l) => lines.push(l));
  await new Promise<void>((r) => sock.onClose(() => r()));
  expect(lines).toEqual(['{"a":1}', '{"b":2}']);
});

it('rejects when nothing listens', async () => {
  await expect(nodeSocketFactory('127.0.0.1', 1)).rejects.toThrow();
});
