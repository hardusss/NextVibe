const { withPodfile } = require('@expo/config-plugins');

module.exports = function withVexoAnalyticsFix(config) {
  return withPodfile(config, (podfile) => {
    let contents = podfile.modResults.contents;

    const vexoFixCode = `
    # === VexoAnalytics fix (static xcframework + use_frameworks! :dynamic) ===
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
`;

    if (contents.includes('post_install do |installer|')) {
      contents = contents.replace(
        /(post_install do \|installer\|\s*\n)/,
        `$1${vexoFixCode}\n`
      );
    } else {
      const newBlock = `
post_install do |installer|
${vexoFixCode}
end
`;
      contents = contents.trimEnd() + '\n\n' + newBlock;
    }

    podfile.modResults.contents = contents;
    return podfile;
  });
};