const { withDangerousMod, withProjectBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withMapboxMaven(config) {
    config = withDangerousMod(config, [
        'android',
        (config) => {
            const token = process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN;
            console.log('[withMapboxMaven] token:', token ? 'FOUND' : 'MISSING');

            const gradlePath = path.join(
                config.modRequest.projectRoot,
                'node_modules/@rnmapbox/maps/android/build.gradle'
            );

            let contents = fs.readFileSync(gradlePath, 'utf8');

            if (contents.includes('api.mapbox.com')) {
                console.log('[withMapboxMaven] already patched');
                return config;
            }

            const mavenBlock = `
        maven {
            url 'https://api.mapbox.com/downloads/v2/releases/maven'
            authentication { basic(BasicAuthentication) }
            credentials {
                username = "mapbox"
                password = "${token ?? 'TOKEN_MISSING'}"
            }
        }`;

            contents = contents.replace(/repositories\s*\{/, `repositories {\n${mavenBlock}`);
            fs.writeFileSync(gradlePath, contents);
            console.log('[withMapboxMaven] patched!');

            return config;
        },
    ]);

    config = withProjectBuildGradle(config, (config) => {
        if (config.modResults.contents.includes('play-services-base-force')) return config;

        config.modResults.contents += `
// play-services-base-force
allprojects {
    configurations.all {
        resolutionStrategy {
            force 'com.google.android.gms:play-services-base:18.6.0'
        }
    }
}`;
        return config;
    });

    return config;
};