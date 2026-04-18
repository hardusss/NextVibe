import 'dotenv/config';

export default {
    expo: {
        name: "NextVibe",
        slug: "NextVibe",
        version: "1.0.1",
        orientation: "portrait",
        icon: "./assets/new_icon.png",
        scheme: "nextvibe",
        userInterfaceStyle: "automatic",
        newArchEnabled: false,
        jsEngine: "hermes",
        ios: {
            jsEngine: "hermes",
            supportsTablet: true,
            bundleIdentifier: "com.nextvibe.app",
            infoPlist: {
                NSCameraUsageDescription: "NextVibe needs access to your Camera.",
                NSMicrophoneUsageDescription: "NextVibe needs access to your Microphone.",
                NFCReaderUsageDescription: "NextVibe needs NFC to connect you with friends.",
                ITSAppUsesNonExemptEncryption: false,
                NSLocationWhenInUseUsageDescription: "NextVibe needs your location to show you on the VibeMap and find nearby drops.",
                NSLocationAlwaysAndWhenInUseUsageDescription: "NextVibe needs your location to notify you about Vibe Zones nearby."
            }
        },
        android: {
            jsEngine: "hermes",
            softwareKeyboardLayoutMode: "resize",
            adaptiveIcon: {
                foregroundImage: "./assets/new_icon.png",
                backgroundColor: "#0A0410"
            },
            package: "com.nextvibe.app",
            launchMode: "singleTask",
            googleServicesFile: "./google-services.json",
            permissions: [
                "android.permission.NFC",
                "android.permission.CAMERA",
                "android.permission.RECORD_AUDIO",
                "android.permission.MODIFY_AUDIO_SETTINGS",
                "android.permission.VIBRATE",
                "android.permission.ACCESS_COARSE_LOCATION",
                "android.permission.ACCESS_FINE_LOCATION"
            ],
            intentFilters: [
                {
                    action: "VIEW",
                    autoVerify: true,
                    data: [
                        {
                            scheme: "https",
                            host: "nextvibe.io",
                            pathPrefix: "/u"
                        },
                        {
                            scheme: "https",
                            host: "nextvibe.io",
                            pathPrefix: "/transaction"
                        }
                    ],
                    category: [
                        "BROWSABLE",
                        "DEFAULT"
                    ]
                }
            ]
        },
        web: {
            bundler: "metro",
            output: "static",
            favicon: "./assets/images/favicon.png"
        },
        plugins: [
            "expo-router",
            [
                "expo-build-properties",
                {
                    android: {
                        usesCleartextTraffic: true
                    }
                }
            ],
            "expo-updates",
            [
                "expo-splash-screen",
                {
                    image: "./assets/images/splash-icon.png",
                    imageWidth: 200,
                    resizeMode: "contain",
                    backgroundColor: "#0A0410"
                }
            ],
            [
                "react-native-vision-camera",
                {
                    cameraPermissionText: "NextVibe needs access to your Camera.",
                    enableMicrophonePermission: true,
                    microphonePermissionText: "NextVibe needs access to your Microphone."
                }
            ],
            [
                "react-native-nfc-manager",
                {
                    nfcPermission: "NextVibe needs NFC to connect you with friends."
                }
            ],
            "expo-image-picker",
            [
                "expo-video",
                {
                    supportsBackgroundPlayback: true,
                    supportsPictureInPicture: true
                }
            ],
            "expo-font",
            "expo-audio",
            "expo-secure-store",
            "react-native-compressor",
            "expo-notifications",
            [
                "expo-location",
                {
                    locationAlwaysAndWhenInUsePermission: "NextVibe needs your location to show you on the VibeMap and find nearby drops.",
                    locationAlwaysPermission: "NextVibe needs your location to notify you about Vibe Zones nearby.",
                    locationWhenInUsePermission: "NextVibe needs your location to show you on the VibeMap."
                }
            ],
            [
                "@rnmapbox/maps",
                {
                    RNMapboxMapsImpl: "mapbox",
                    RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN
                }
            ],
            "./withMapboxMaven.js",
            "./withSolanaMWA.js",
            "./withHCE.js"
        ],
        experiments: {
            typedRoutes: true
        },
        extra: {
            router: {
                origin: false
            },
            eas: {
                projectId: "4c7d8842-f989-419d-b3ec-49ceece00b6e"
            }
        },
        owner: "nextvibe",
        runtimeVersion: "0.0.1-collections",
        updates: {
            url: "https://u.expo.dev/4c7d8842-f989-419d-b3ec-49ceece00b6e"
        }
    }
};