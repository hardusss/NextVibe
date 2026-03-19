import { requireNativeModule, EventEmitter, EventSubscription } from 'expo-modules-core';

const NfcSend = requireNativeModule('NfcSend');


const emitter = new EventEmitter<{ onNfcRead: () => void }>(NfcSend as any);

export function startSharing(url: string) {
  return NfcSend.startSharing(url);
}

export function stopSharing() {
  return NfcSend.stopSharing();
}

export function addNfcReadListener(listener: () => void): EventSubscription {
  return emitter.addListener('onNfcRead', listener);
}