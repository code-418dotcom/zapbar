import { rnHttp, rnSocketFactory } from '../src/runtime/transport';

type FakeSock = {
  opts: { host: string; port: number };
  written: string[];
  connectCb: () => void;
  emit: (ev: string, ...a: unknown[]) => boolean;
  destroy: jest.Mock;
};

jest.mock('react-native-tcp-socket', () => {
  const { EventEmitter } = require('events');
  const sockets: unknown[] = [];
  return {
    __esModule: true,
    sockets,
    default: {
      createConnection: (opts: unknown, cb: () => void) => {
        const s = new EventEmitter();
        Object.assign(s, {
          opts,
          written: [] as string[],
          connectCb: cb,
          write: (d: string) => (s as unknown as FakeSock).written.push(d),
          destroy: jest.fn(() => s.emit('close', false)),
          setEncoding: jest.fn(),
        });
        sockets.push(s);
        return s;
      },
    },
  };
});

const lastSock = (): FakeSock => {
  const { sockets } = jest.requireMock('react-native-tcp-socket') as { sockets: FakeSock[] };
  return sockets[sockets.length - 1]!;
};

describe('rnSocketFactory', () => {
  it('connects, splits CRLF lines across chunks and writes', async () => {
    const p = rnSocketFactory('10.0.0.82', 1255);
    const s = lastSock();
    expect(s.opts).toEqual({ host: '10.0.0.82', port: 1255 });
    s.connectCb();
    const sock = await p;
    const lines: string[] = [];
    sock.onLine((l) => lines.push(l));
    s.emit('data', '{"a":1}\r\n{"b"');
    s.emit('data', ':2}\r\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    sock.write('heos://system/heart_beat\r\n');
    expect(s.written).toEqual(['heos://system/heart_beat\r\n']);
  });

  it('rejects when the connection errors before connecting', async () => {
    const p = rnSocketFactory('10.0.0.99', 1255);
    lastSock().emit('error', new Error('ECONNREFUSED'));
    await expect(p).rejects.toThrow('ECONNREFUSED');
  });

  it('fires onClose once when the socket closes', async () => {
    const p = rnSocketFactory('10.0.0.82', 1255);
    const s = lastSock();
    s.connectCb();
    const sock = await p;
    const closed = jest.fn();
    sock.onClose(closed);
    s.emit('close', false);
    s.emit('close', false);
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

describe('rnHttp', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('returns status and text', async () => {
    global.fetch = jest.fn(async () => ({ status: 200, text: async () => '<ok/>' })) as unknown as typeof fetch;
    await expect(rnHttp('http://10.0.0.82:60006/x', { method: 'POST', body: 'b', timeoutMs: 1000 })).resolves.toEqual({ status: 200, text: '<ok/>' });
  });

  it('aborts after timeoutMs', async () => {
    global.fetch = jest.fn((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    ) as unknown as typeof fetch;
    await expect(rnHttp('http://10.0.0.82:60006/x', { method: 'POST', timeoutMs: 20 })).rejects.toThrow('aborted');
  });
});
