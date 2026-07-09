const { withPodfile } = require('@expo/config-plugins');

module.exports = function withVexoAnalyticsFix(config) {
  return withPodfile(config, (podfile) => {
    let contents = podfile.modResults.contents;

    const vexoFix = `
  installer.pod_targets.each do |pod_target|
    if pod_target.name == 'VexoAnalytics' || pod_target.name.include?('Vexo')
      pod_target.build_configurations.each do |config|
        config.build_settings['MACH_O_TYPE'] = 'staticlib'
        config.build_settings['OTHER_LDFLAGS'] = '$(inherited) -framework VexoAnalytics'
        config.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES'
      end
    end
  end
`;

    if (contents.includes('post_install do |installer|')) {
      contents = contents.replace(
        /(post_install do \|installer\|\s*\n)/,
        `$1${vexoFix}\n`
      );
    }

    podfile.modResults.contents = contents;
    return podfile;
  });
};