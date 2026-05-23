const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: require.resolve('react-native-quick-crypto'),
  stream: require.resolve('readable-stream'),
  buffer: require.resolve('buffer'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@solana/kit') {
    return {
      type: 'sourceFile',
      filePath: require.resolve('./shims/solana-kit-stub.js'),
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];

module.exports = config;