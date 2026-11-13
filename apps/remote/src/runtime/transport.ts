import TcpSocket from 'react-native-tcp-socket';
import type { HttpFn, LineSocket, SocketFactory } from '@zapbar/heos-core';

export const rnSocketFactory: SocketFactory = (host, port) =>
  new Promise((resolve, reject) => {
    const lineCbs: Array<(l: string) => void> = [];
    const closeCbs: Array<(e?: Error) => void> = [];
    let buf = '';
    let connected = false;
    let closed = false;
    let lastError: Error | undefined;
    const fireClose = () => {
      if (closed) return;
      closed = true;
      closeCbs.forEach((cb) => cb(lastError));
    };
    const timer = setTimeout(() => {
      if (connected) return;
      lastError = new Error('connect timeout');
      sock.destroy();
      reject(lastError);
    }, 3000);
    const sock = TcpSocket.createConnection({ host, port }, () => {
      connected = true;
      clearTimeout(timer);
      resolve(api);
    });
    const api: LineSocket = {
      write: (line) => {
        if (!closed) sock.write(line);
      },
      onLine: (cb) => {
        lineCbs.push(cb);
      },
      onClose: (cb) => {
        closeCbs.push(cb);
      },
      close: () => {
        sock.destroy();
        fireClose();
      },
    };
    sock.setEncoding('utf8');
    sock.on('data', (chunk: unknown) => {
      buf += String(chunk);
      let i: number;
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line.trim()) lineCbs.forEach((cb) => cb(line));
      }
    });
    sock.on('error', (e: Error) => {
      lastError = e;
      if (!connected) {
        clearTimeout(timer);
        reject(e);
      }
    });
    sock.on('close', fireClose);
  });

// Hermes has no AbortSignal.timeout; build the timeout by hand.
export const rnHttp: HttpFn = async (url, req) => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), req.timeoutMs);
  try {
    const res = await fetch(url, { method: req.method, headers: req.headers, body: req.body, signal: ac.signal });
    return { status: res.status, text: await res.text() };
  } finally {
    clearTimeout(t);
  }
};
