import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { Button, View, Text } from 'react-native';

export function ConnectScreen() {
  const { connect, isConnected, smartWalletPubkey } = useWallet();
  const APP_SCHEME = 'myapp://connect-wallet';

  if (isConnected) {
    return <Text style={{color: "red"}}>Welcome back, {`${smartWalletPubkey}`}</Text>;
  }

  return (
    <Button 
      title="Connect with Passkey" 
      onPress={() => connect({ redirectUrl: APP_SCHEME })} 
    />
  );
}