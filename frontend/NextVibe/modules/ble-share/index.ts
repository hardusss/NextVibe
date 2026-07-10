import { requireNativeModule, EventEmitter, EventSubscription } from 'expo-modules-core';

const BleShare = requireNativeModule('BleShare');

const emitter = new EventEmitter<{
  onBleRead: () => void;
  onBleDiscovered: { url: string };
}>(BleShare as any);

// ── Broadcaster (Peripheral) API ──

export function startBroadcasting(url: string): void {
  return BleShare.startBroadcasting(url);
}

export function stopBroadcasting(): void {
  return BleShare.stopBroadcasting();
}

// ── Scanner (Central) API ──

export function startScanning(): void {
  return BleShare.startScanning();
}

export function stopScanning(): void {
  return BleShare.stopScanning();
}

// ── Events ──

/** Fires on the broadcaster when a nearby scanner reads the profile */
export function addBleReadListener(listener: () => void): EventSubscription {
  return emitter.addListener('onBleRead', listener);
}

/** Fires on the scanner when a nearby broadcaster is discovered at close proximity */
export function addBleDiscoveredListener(
  listener: (event: { url: string }) => void
): EventSubscription {
  return emitter.addListener('onBleDiscovered', listener);
}
