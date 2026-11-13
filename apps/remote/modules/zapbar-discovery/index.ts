import { requireNativeModule } from 'expo';

export interface RawReply {
  ip: string;
  text: string;
}

interface ZapbarDiscoveryNative {
  searchAsync(message: string, timeoutMs: number): Promise<RawReply[]>;
  /** iOS only. Rejects with code 'LOCAL_NETWORK_DENIED' when local network access is denied. */
  browseAsync(serviceType: string, timeoutMs: number): Promise<string[]>;
}

export default requireNativeModule<ZapbarDiscoveryNative>('ZapbarDiscovery');
