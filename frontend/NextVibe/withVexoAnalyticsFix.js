const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withVexoAnalyticsFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile'
      );

      let podfileContent = fs.readFileSync(podfilePath, 'utf8');

      const fixSnippet = `
  # === VexoAnalytics dynamic framework fix ===
  installer.pods_project.targets.each do |target|
    if target.name == 'VexoAnalytics'
      target.build_configurations.each do |config|
        config.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES'
        config.build_settings['OTHER_LDFLAGS'] ||= ['$(inherited)']
      end
    end
  end
`;

      if (podfileContent.includes('post_install do |installer|')) {
        podfileContent = podfileContent.replace(
          /(post_install do \|installer\|)/,
          `$1${fixSnippet}`
        );
      } else {
        podfileContent = podfileContent.replace(
          /(^end\s*$)/m,
          `${fixSnippet}\nend`
        );
      }

      fs.writeFileSync(podfilePath, podfileContent);
      return config;
    },
  ]);
};