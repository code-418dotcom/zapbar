import { requireNativeModule } from 'expo';

export interface QuickNative {
  setConfig(json: string): void;
  /** Last live bar state for the iOS widgets; a no-op on Android, whose native services read the bar themselves. */
  setState(json: string): void;
  setLiveWanted(foreground: boolean): void;
  refreshWidgets(): void;
  openBatterySettings(): void;
  /** Light haptic tick for a confirmed choice. Follows the system haptics setting; needs no permission. */
  tick(): Promise<void>;
}

export default requireNativeModule<QuickNative>('ZapbarQuick');
