const { withPodfile } = require('@expo/config-plugins');

module.exports = function withVexoAnalyticsFix(config) {
  return withPodfile(config, (podfile) => {
    const contents = podfile.modResults.contents;

    const vexoFix = `
# ============================================================
# Fix for VexoAnalytics static binary conflict (use_frameworks! :dynamic)
# ============================================================
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES'
      config.build_settings['DEFINES_MODULE'] = 'YES'

      if target.name == 'VexoAnalytics' || 
         target.name == 'RNVexoAnalytics' || 
         target.name.include?('Vexo')
        config.build_settings['OTHER_LDFLAGS'] ||= ['$(inherited)']
        config.build_settings['FRAMEWORK_SEARCH_PATHS'] ||= ['$(inherited)']
      end
    end
  end
end
`;

    if (!contents.includes('VexoAnalytics static binary conflict')) {
      podfile.modResults.contents = contents.trimEnd() + '\n\n' + vexoFix;
    }

    return podfile;
  });
};