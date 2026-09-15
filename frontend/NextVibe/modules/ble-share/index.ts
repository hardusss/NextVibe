import { requireNativeModule, EventEmitter, EventSubscription } from 'expo-modules-core';

const BleShare = requireNativeModule('BleShare');

export type BluetoothState =
  | 'poweredOn'
  | 'poweredOff'
  | 'unauthorized'
  | 'unsupported'
  | 'unknown';

/** iOS: CBManager.authorization. Android: whether the runtime permissions are granted. */
export type BluetoothAuthorization = 'granted' | 'denied' | 'restricted' | 'notDetermined';

/**
 * "passive" — the always-on app-wide scanner; phones must be really close.
 * "active"  — a tap screen is open and people are deliberately holding their
 *             phones together; a looser threshold so cases/orientation don't block it.
 */
export type ScanSensitivity = 'passive' | 'active';

export type NativeProximityError = { code: string; message: string };

const emitter = new EventEmitter<{
  onBleRead: () => void;
  onBleDiscovered: (event: { url: string; rssi?: number }) => void;
  onBluetoothStateChanged: (event: { state: BluetoothState }) => void;
  onBroadcastError: (event: NativeProximityError) => void;
  onScanError: (event: NativeProximityError) => void;
}>(BleShare as any);

// ── Broadcaster (Peripheral) API ──

/**
 * Start (or keep) advertising and serve `url` to nearby scanners. Calling it
 * again while broadcasting just swaps the payload — no restart.
 */
export function startBroadcasting(url: string): void {
  return BleShare.startBroadcasting(url);
}

export function stopBroadcasting(): void {
  return BleShare.stopBroadcasting();
}

/** False on Android phones whose Bluetooth chip can't advertise. */
export function isBroadcastSupported(): boolean {
  try {
    return !!BleShare.isBroadcastSupported();
  } catch {
    return true;
  }
}

// ── Scanner (Central) API ──

export function startScanning(): void {
  return BleShare.startScanning();
}

export function stopScanning(): void {
  BleShare.stopScanning();
}

export function setScanSensitivity(mode: ScanSensitivity): void {
  try {
    BleShare.setScanSensitivity(mode);
  } catch {
    // Older binary without the function — keep the default.
  }
}

// ── Bluetooth state ──

/**
 * Current adapter state. On iOS this is "unknown" until a broadcast or scan
 * has been requested at least once (querying earlier would trigger the
 * system permission prompt) — use getBluetoothAuthorization for that.
 */
export function getBluetoothState(): BluetoothState {
  return BleShare.getBluetoothState();
}

/** Permission status, never prompts. */
export function getBluetoothAuthorization(): BluetoothAuthorization {
  try {
    return BleShare.getBluetoothAuthorization();
  } catch {
    return 'notDetermined';
  }
}

/** Fires whenever the Bluetooth adapter changes state (e.g. user toggles it) */
export function addBluetoothStateListener(
  listener: (event: { state: BluetoothState }) => void
): EventSubscription {
  return emitter.addListener('onBluetoothStateChanged', listener);
}

// ── Events ──

/** Fires on the broadcaster when a nearby scanner reads the payload */
export function addBleReadListener(listener: () => void): EventSubscription {
  return emitter.addListener('onBleRead', listener);
}

/** Fires on the scanner when the closest nearby broadcaster's payload was read */
export function addBleDiscoveredListener(
  listener: (event: { url: string; rssi?: number }) => void
): EventSubscription {
  return emitter.addListener('onBleDiscovered', listener);
}

/** Advertising could not start (unsupported chip, missing permission, …) */
export function addBroadcastErrorListener(
  listener: (event: NativeProximityError) => void
): EventSubscription {
  return emitter.addListener('onBroadcastError', listener);
}

/** Scanning could not start or was stopped by the system */
export function addScanErrorListener(
  listener: (event: NativeProximityError) => void
): EventSubscription {
  return emitter.addListener('onScanError', listener);
}
