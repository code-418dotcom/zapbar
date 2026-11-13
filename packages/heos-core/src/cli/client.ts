import type { LineSocket, SocketFactory } from '../transport';
import { buildCommand, parseMessage } from './message';

export const CLI_PORT = 1255;

export interface CliResponse {
  command: string;
  result: 'success' | 'fail';
  message: Record<string, string>;
  payload?: unknown;
  options?: unknown;
}

export interface CliEvent {
  event: string;
  message: Record<string, string>;
}

export class CliError extends Error {
  constructor(readonly command: string, readonly eid: string, readonly text: string) {
    super(`${command} failed: ${text || `eid ${eid}`}`);
    this.name = 'CliError';
  }
}

export class TimeoutError extends Error {
  constructor(readonly command: string) {
    super(`${command} timed out`);
    this.name = 'TimeoutError';
  }
}

export class DisconnectedError extends Error {
  constructor(message = 'Not connected') {
    super(message);
    this.name = 'DisconnectedError';
  }
}

interface Pending {
  command: string;
  line: string;
  resolve: (r: CliResponse) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

// One command in flight at a time: HEOS replies carry only the command name,
// so serialising is the only way to match a reply to its request.
export class HeosCliClient {
  private queue: Pending[] = [];
  private inflight: Pending | null = null;
  private eventCbs = new Set<(e: CliEvent) => void>();
  private closeCbs = new Set<(e?: Error) => void>();
  private closed = false;

  private constructor(private readonly sock: LineSocket, private readonly timeoutMs: number) {
    sock.onLine((l) => this.handleLine(l));
    sock.onClose((e) => this.handleClose(e));
  }

  static async connect(factory: SocketFactory, host: string, opts: { port?: number; timeoutMs?: number } = {}): Promise<HeosCliClient> {
    const sock = await factory(host, opts.port ?? CLI_PORT);
    return new HeosCliClient(sock, opts.timeoutMs ?? 3000);
  }

  get isClosed(): boolean {
    return this.closed;
  }

  send(command: string, params?: Record<string, string | number | boolean>): Promise<CliResponse> {
    if (this.closed) return Promise.reject(new DisconnectedError());
    return new Promise((resolve, reject) => {
      this.queue.push({ command, line: buildCommand(command, params), resolve, reject });
      this.pump();
    });
  }

  onEvent(cb: (e: CliEvent) => void): () => void {
    this.eventCbs.add(cb);
    return () => this.eventCbs.delete(cb);
  }

  onClose(cb: (e?: Error) => void): () => void {
    this.closeCbs.add(cb);
    return () => this.closeCbs.delete(cb);
  }

  close(): void {
    this.sock.close();
    this.handleClose();
  }

  private pump(): void {
    if (this.inflight || this.closed) return;
    const next = this.queue.shift();
    if (!next) return;
    this.inflight = next;
    this.armTimer(next);
    this.sock.write(next.line);
  }

  private armTimer(p: Pending): void {
    if (p.timer) clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      if (this.inflight !== p) return;
      this.inflight = null;
      p.reject(new TimeoutError(p.command));
      // A late reply would resolve the next command with the same name; drop the connection instead.
      this.close();
    }, this.timeoutMs);
  }

  private handleLine(line: string): void {
    let msg: { heos?: { command?: unknown; result?: unknown; message?: unknown }; payload?: unknown; options?: unknown };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const heos = msg?.heos;
    if (!heos || typeof heos.command !== 'string') return;
    const message = parseMessage(String(heos.message ?? ''));
    if (heos.command.startsWith('event/')) {
      const ev: CliEvent = { event: heos.command.slice('event/'.length), message };
      this.eventCbs.forEach((cb) => cb(ev));
      return;
    }
    const p = this.inflight;
    if (!p || p.command !== heos.command) return;
    if ('command under process' in message) {
      this.armTimer(p);
      return;
    }
    clearTimeout(p.timer);
    this.inflight = null;
    if (heos.result === 'fail') p.reject(new CliError(p.command, message.eid ?? '', message.text ?? ''));
    else p.resolve({ command: heos.command, result: 'success', message, payload: msg.payload, options: msg.options });
    this.pump();
  }

  private handleClose(err?: Error): void {
    if (this.closed) return;
    this.closed = true;
    const e = new DisconnectedError(err ? `Connection lost: ${err.message}` : 'Connection closed');
    if (this.inflight) {
      clearTimeout(this.inflight.timer);
      this.inflight.reject(e);
      this.inflight = null;
    }
    for (const p of this.queue.splice(0)) p.reject(e);
    this.closeCbs.forEach((cb) => cb(err));
  }
}
