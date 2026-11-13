// HEOS CLI messages are key=value pairs joined by '&'. Values escape exactly
// three characters: & → %26, = → %3D, % → %25.
const DECODE: Record<string, string> = { '%26': '&', '%3D': '=', '%25': '%' };

export function decodeValue(v: string): string {
  return v.replace(/%26|%3D|%25/gi, (m) => DECODE[m.toUpperCase()] ?? m);
}

export function encodeValue(v: string): string {
  return v.replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
}

export function parseMessage(message: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!message) return out;
  for (const part of message.split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    if (i === -1) out[decodeValue(part)] = '';
    else out[decodeValue(part.slice(0, i))] = decodeValue(part.slice(i + 1));
  }
  return out;
}

export function buildCommand(command: string, params: Record<string, string | number | boolean> = {}): string {
  const q = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeValue(String(v))}`)
    .join('&');
  return `heos://${command}${q ? `?${q}` : ''}\r\n`;
}
