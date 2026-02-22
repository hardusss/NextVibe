const { withAndroidManifest } = require('@expo/config-plugins');

const withSolanaMWA = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest.queries) {
      manifest.queries = [{}];
    }
    
    if (!manifest.queries[0].intent) {
      manifest.queries[0].intent = [];
    }

    manifest.queries[0].intent.push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
      data: [{ $: { 'android:scheme': 'solana-wallet' } }],
    });

    return config;
  });
};

module.exports = withSolanaMWA;