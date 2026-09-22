const { withInfoPlist } = require("expo/config-plugins");

/**
 * Final say on the iOS Info.plist for App Review (Guidelines 2.5.4 and
 * 5.1.1(ii)). iOS only: the Android project comes out byte-identical, so the
 * Android binary in the field keeps taking OTA updates.
 *
 * - UIBackgroundModes is exactly remote-notification. expo-video adds "audio"
 *   for background playback and PiP, which the app never uses; switching
 *   those plugin options off would also change the Android manifest.
 *   Bluetooth doesn't need a mode: scanning stops when the app leaves the
 *   foreground (hooks/useBleScanner.tsx) and broadcasting runs only while a
 *   share screen is open.
 * - No purpose strings for permissions the app never asks for.
 *
 * Info.plist mods run in reverse order of registration, so this plugin is
 * listed first in app.config.js in order to run last.
 */
const BACKGROUND_MODES = ["remote-notification"];
const UNUSED_PURPOSE_STRINGS = [
    "NSLocationAlwaysUsageDescription",
    "NSLocationAlwaysAndWhenInUseUsageDescription",
    "NSFaceIDUsageDescription",
];

module.exports = function withStripIosKeys(config) {
    return withInfoPlist(config, (c) => {
        c.modResults.UIBackgroundModes = [...BACKGROUND_MODES];
        for (const key of UNUSED_PURPOSE_STRINGS) {
            delete c.modResults[key];
        }
        return c;
    });
};
