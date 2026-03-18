import { requireNativeModule } from 'expo-modules-core';

const NfcShare = requireNativeModule('NfcSend');

export function startSharing(url: string) {
  return NfcShare.startSharing(url);
}

export function stopSharing() {
  return NfcShare.stopSharing();
}