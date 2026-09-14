import { requireNativeModule, EventEmitter, EventSubscription } from 'expo-modules-core';

const BleShare = requireNativeModule('BleShare');

export type BluetoothState =
  | 'poweredOn'
  | 'poweredOff'
  | 'unauthorized'
  | 'unsupported'
  | 'unknown';

const emitter = new EventEmitter<{
  onBleRead: () => void;
  onBleDiscovered: (event: { url: string }) => void;
  onBluetoothStateChanged: (event: { state: BluetoothState }) => void;
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
  BleShare.stopScanning();
}

// ── Bluetooth state ──

/**
 * Current adapter state. On iOS this is "unknown" until a broadcast or scan
 * has been requested at least once (querying earlier would trigger the
 * system permission prompt).
 */
export function getBluetoothState(): BluetoothState {
  return BleShare.getBluetoothState();
}

/** Fires whenever the Bluetooth adapter changes state (e.g. user toggles it) */
export function addBluetoothStateListener(
  listener: (event: { state: BluetoothState }) => void
): EventSubscription {
  return emitter.addListener('onBluetoothStateChanged', listener);
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
