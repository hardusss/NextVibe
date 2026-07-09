const { withPodfile } = require('@expo/config-plugins');

module.exports = function withVexoAnalyticsFix(config) {
  return withPodfile(config, (podfile) => {
    let contents = podfile.modResults.contents;

    const vexoFix = `
  # === Force VexoAnalytics to be static (fixes static xcframework + dynamic frameworks conflict) ===
  installer.pod_targets.each do |pod_target|
    if pod_target.name == 'VexoAnalytics' || pod_target.name == 'RNVexoAnalytics'
      pod_target.instance_variable_set(:@build_type, Pod::BuildType.static_framework)
    end
  end

  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      if target.name == 'VexoAnalytics' || target.name == 'RNVexoAnalytics'
        config.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES'
        config.build_settings['MACH_O_TYPE'] = 'staticlib'
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