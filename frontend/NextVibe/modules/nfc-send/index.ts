import { requireNativeModule, EventEmitter, EventSubscription } from 'expo-modules-core';

const NfcSend = requireNativeModule('NfcSend');

/**
 * "unsupported" on iPhones (no tag emulation for third-party apps) and on
 * Android phones without NFC; "disabled" when NFC is switched off in settings.
 */
export type NfcState = 'enabled' | 'disabled' | 'unsupported' | 'unknown';

const emitter = new EventEmitter<{
  onNfcRead: () => void;
  onNfcStateChanged: (event: { state: NfcState }) => void;
}>(NfcSend as any);

/**
 * Start emulating a tag that holds `url` (Android only; no-op on iOS).
 * Calling it again while sharing just swaps the URL for the next tap.
 */
export function startSharing(url: string): void {
  return NfcSend.startSharing(url);
}

export function stopSharing(): void {
  return NfcSend.stopSharing();
}

export function getNfcState(): NfcState {
  try {
    return NfcSend.getNfcState();
  } catch {
    return 'unknown';
  }
}

export function addNfcStateListener(listener: (event: { state: NfcState }) => void): EventSubscription {
  return emitter.addListener('onNfcStateChanged', listener);
}

/** Fires on the sharing phone when another phone reads the tag */
export function addNfcReadListener(listener: () => void): EventSubscription {
  return emitter.addListener('onNfcRead', listener);
}
