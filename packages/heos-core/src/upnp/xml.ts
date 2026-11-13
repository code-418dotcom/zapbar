import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  textNodeName: '#text',
});

export function parseXml(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Text of a node that is a plain value or mixed content such as {'#text': '2', level: '2'}. */
export function textOf(n: unknown): string {
  if (n === undefined || n === null) return '';
  if (typeof n === 'string' || typeof n === 'number' || typeof n === 'boolean') return String(n);
  if (typeof n === 'object' && '#text' in (n as Record<string, unknown>)) return String((n as Record<string, unknown>)['#text']);
  return '';
}

export function child(n: unknown, key: string): unknown {
  return n && typeof n === 'object' ? (n as Record<string, unknown>)[key] : undefined;
}

export function numOrNull(s: string): number | null {
  if (s.trim() === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
