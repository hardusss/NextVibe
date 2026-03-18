import * as React from 'react';

import { NfcSendViewProps } from './NfcSend.types';

export default function NfcSendView(props: NfcSendViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
