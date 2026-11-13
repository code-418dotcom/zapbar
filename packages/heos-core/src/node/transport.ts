import net from 'node:net';
import type { HttpFn, LineSocket, SocketFactory } from '../transport';

export const nodeSocketFactory: SocketFactory = (host, port) =>
  new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    sock.setEncoding('utf8');
    sock.setTimeout(3000, () => sock.destroy(new Error('connect timeout')));
    const lineCbs: Array<(l: string) => void> = [];
    const closeCbs: Array<(e?: Error) => void> = [];
    let buf = '';
    let closed = false;
    let lastError: Error | undefined;
    let connected = false;
    const fireClose = () => {
      if (closed) return;
      closed = true;
      closeCbs.forEach((cb) => cb(lastError));
    };
    const api: LineSocket = {
      write: (line) => { if (!closed) sock.write(line); },
      onLine: (cb) => { lineCbs.push(cb); },
      onClose: (cb) => { closeCbs.push(cb); },
      close: () => { sock.destroy(); fireClose(); },
    };
    sock.once('connect', () => { connected = true; sock.setTimeout(0); resolve(api); });
    sock.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line.trim()) lineCbs.forEach((cb) => cb(line));
      }
    });
    sock.on('error', (e) => {
      lastError = e;
      // Node clears sock.connecting before emitting a connect error, so track it ourselves.
      if (!connected) reject(e);
    });
    sock.on('close', fireClose);
  });

export const nodeHttp: HttpFn = async (url, req) => {
  const res = await fetch(url, { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(req.timeoutMs) });
  return { status: res.status, text: await res.text() };
};
