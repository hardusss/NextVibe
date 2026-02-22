const { withAndroidManifest } = require('@expo/config-plugins');

const withSolanaMWA = (config) => {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults.manifest;

    if (!androidManifest.queries) {
      androidManifest.queries = [];
    }

    androidManifest.queries.push({
      intent: [
        {
          action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
          category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
          data: [{ $: { 'android:scheme': 'solana-wallet' } }],
        },
      ],
    });

    return config;
  });
};

module.exports = withSolanaMWA;