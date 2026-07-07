const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withFmtFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfile = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = await fs.promises.readFile(podfile, 'utf8');

      if (!contents.includes('FMT_CONSTEVAL=')) {
        contents = contents.replace(
          /(post_install do \|installer\|)/,
          `$1
    installer.pods_project.targets.each do |target|
      if target.name == 'RCT-Folly' || target.name == 'fmt'
        target.build_configurations.each do |config|
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_CONSTEVAL='
        end
      end
    end`
        );
        await fs.promises.writeFile(podfile, contents);
      }

      return config;
    },
  ]);
};