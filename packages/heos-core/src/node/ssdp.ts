import dgram from 'node:dgram';
import { buildMSearch, parseSsdpResponse, SSDP_ADDR, SSDP_PORT, type SsdpHit } from '../discovery/ssdp';

export function nodeSsdpSearch(timeoutMs = 3000): Promise<SsdpHit[]> {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const hits: SsdpHit[] = [];
    const finish = () => {
      try {
        sock.close();
      } catch {
        // already closed
      }
      resolve(hits);
    };
    sock.on('message', (msg, rinfo) => {
      const h = parseSsdpResponse(msg.toString(), rinfo.address);
      if (h) hits.push(h);
    });
    sock.on('error', finish);
    sock.bind(0, () => {
      sock.setMulticastTTL(2);
      const m = Buffer.from(buildMSearch());
      sock.send(m, SSDP_PORT, SSDP_ADDR);
      setTimeout(() => sock.send(m, SSDP_PORT, SSDP_ADDR), 500);
    });
    setTimeout(finish, timeoutMs);
  });
}
