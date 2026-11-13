import type { HttpFn } from '../transport';
import { child, parseXml, textOf, xmlEscape } from './xml';

export const UPNP_PORT = 60006;

export interface UpnpEndpoint {
  http: HttpFn;
  baseUrl: string;
  timeoutMs?: number;
}

export interface UpnpService {
  path: string;
  type: string;
}

export const ACT: UpnpService = { path: '/ACT/control', type: 'urn:schemas-denon-com:service:ACT:1' };
export const RENDERING: UpnpService = {
  path: '/upnp/control/renderer_dvc/RenderingControl',
  type: 'urn:schemas-upnp-org:service:RenderingControl:1',
};

/** The device answered with a SOAP fault: the action or argument is not supported. */
export class UpnpFault extends Error {
  constructor(readonly action: string, readonly code: string, readonly description: string) {
    super(`${action}: UPnP fault ${code} ${description}`.trim());
    this.name = 'UpnpFault';
  }
}

/** The device could not be reached or did not answer with SOAP. */
export class UpnpUnreachable extends Error {
  constructor(readonly action: string, cause: string) {
    super(`${action}: ${cause}`);
    this.name = 'UpnpUnreachable';
  }
}

export async function soapCall(
  ep: UpnpEndpoint,
  svc: UpnpService,
  action: string,
  args: Record<string, string | number> = {},
): Promise<Record<string, string>> {
  const argXml = Object.entries(args)
    .map(([k, v]) => `<${k}>${xmlEscape(String(v))}</${k}>`)
    .join('');
  const body =
    `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
    `<s:Body><u:${action} xmlns:u="${svc.type}">${argXml}</u:${action}></s:Body></s:Envelope>`;
  let res: { status: number; text: string };
  try {
    res = await ep.http(ep.baseUrl + svc.path, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: `"${svc.type}#${action}"` },
      body,
      timeoutMs: ep.timeoutMs ?? 3000,
    });
  } catch (e) {
    throw new UpnpUnreachable(action, (e as Error).message);
  }
  let doc: Record<string, unknown>;
  try {
    doc = parseXml(res.text);
  } catch {
    throw new UpnpUnreachable(action, `HTTP ${res.status}, unparseable body`);
  }
  const bodyNode = child(doc.Envelope, 'Body');
  if (!bodyNode || typeof bodyNode !== 'object') throw new UpnpUnreachable(action, `HTTP ${res.status}, no SOAP body`);
  const fault = child(bodyNode, 'Fault');
  if (fault) {
    const err = child(child(fault, 'detail'), 'UPnPError');
    throw new UpnpFault(action, textOf(child(err, 'errorCode')), textOf(child(err, 'errorDescription')));
  }
  const out = child(bodyNode, `${action}Response`);
  const result: Record<string, string> = {};
  if (out && typeof out === 'object') for (const [k, v] of Object.entries(out)) result[k] = textOf(v);
  return result;
}
