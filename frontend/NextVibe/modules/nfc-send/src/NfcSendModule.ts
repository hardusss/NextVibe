import { NativeModule, requireNativeModule } from 'expo';

import { NfcSendModuleEvents } from './NfcSend.types';

declare class NfcSendModule extends NativeModule<NfcSendModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<NfcSendModule>('NfcSend');
