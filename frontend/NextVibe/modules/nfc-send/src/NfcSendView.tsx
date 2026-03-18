import { requireNativeView } from 'expo';
import * as React from 'react';

import { NfcSendViewProps } from './NfcSend.types';

const NativeView: React.ComponentType<NfcSendViewProps> =
  requireNativeView('NfcSend');

export default function NfcSendView(props: NfcSendViewProps) {
  return <NativeView {...props} />;
}
