import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './NfcSend.types';

type NfcSendModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class NfcSendModule extends NativeModule<NfcSendModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(NfcSendModule, 'NfcSendModule');
