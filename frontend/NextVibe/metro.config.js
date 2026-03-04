const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: require.resolve('react-native-quick-crypto'),
  stream: require.resolve('readable-stream'),
  buffer: require.resolve('buffer'),
};

module.exports = config;