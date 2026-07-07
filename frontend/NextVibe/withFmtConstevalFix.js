const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withFmtConstevalFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.projectRoot, 'ios/Podfile');
      
      if (!fs.existsSync(podfilePath)) {
        console.log('[withFmtConstevalFix] Podfile does not exist, skipping');
        return config;
      }
      
      let podfileContent = fs.readFileSync(podfilePath, 'utf8');
      
      if (podfileContent.includes("target.name == 'fmt'")) {
        console.log('[withFmtConstevalFix] fmt consteval fix already exists in Podfile');
        return config;
      }
      
      console.log('[withFmtConstevalFix] Injecting fmt consteval fix into Podfile...');
      
      const fixCode = `    installer.pods_project.targets.each do |target|
      if target.name == 'fmt'
        target.build_configurations.each do |config|
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_CONSTEVAL='
        end
      end
    end

    react_native_post_install(`;
      
      podfileContent = podfileContent.replace(
        /react_native_post_install\(/,
        fixCode
      );
      
      fs.writeFileSync(podfilePath, podfileContent, 'utf8');
      console.log('[withFmtConstevalFix] Successfully patched Podfile');
      
      return config;
    }
  ]);
};
