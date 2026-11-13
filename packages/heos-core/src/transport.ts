// I/O is injected so heos-core runs unchanged on Node (tests, scripts) and React Native.
export interface LineSocket {
  write(line: string): void;
  onLine(cb: (line: string) => void): void;
  onClose(cb: (err?: Error) => void): void;
  close(): void;
}

export type SocketFactory = (host: string, port: number) => Promise<LineSocket>;

export interface HttpRequest {
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

export type HttpFn = (url: string, req: HttpRequest) => Promise<{ status: number; text: string }>;
