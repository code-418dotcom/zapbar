import type { LineSocket, SocketFactory } from '../src/transport';

export function memorySocket() {
  const lineCbs: Array<(l: string) => void> = [];
  const closeCbs: Array<(e?: Error) => void> = [];
  const written: string[] = [];
  const sock: LineSocket = {
    write: (l) => { written.push(l); },
    onLine: (cb) => { lineCbs.push(cb); },
    onClose: (cb) => { closeCbs.push(cb); },
    close: () => closeCbs.forEach((cb) => cb()),
  };
  return {
    sock,
    written,
    factory: (async () => sock) as SocketFactory,
    push: (obj: unknown) => lineCbs.forEach((cb) => cb(typeof obj === 'string' ? obj : JSON.stringify(obj))),
    drop: (e?: Error) => closeCbs.forEach((cb) => cb(e)),
  };
}

export const reply = (command: string, message = '', result = 'success', payload?: unknown) =>
  ({ heos: { command, result, message }, ...(payload !== undefined ? { payload } : {}) });
