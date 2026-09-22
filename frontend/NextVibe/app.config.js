import 'dotenv/config';

// iOS purpose strings (App Review 5.1.1(ii)): each names the feature that asks.
// Plugins below get the same text because their options override infoPlist.
const CAMERA_USAGE = "NextVibe uses the camera to take photos for your posts and profile picture, and photos or videos to send in chats.";
const MICROPHONE_USAGE = "NextVibe uses the microphone to record sound when you shoot a video to send in a chat.";
const PHOTOS_USAGE = "NextVibe accesses your photo library so you can choose a profile picture, a chat wallpaper, or photos and videos to send in chats.";
const PHOTOS_ADD_USAGE = "NextVibe saves an image to your photo library only when you choose Save Image, for example when you share your Seeker Verified card.";
const LOCATION_USAGE = "NextVibe uses your location to show where you are on the map, to add a place to a post when you choose to, and to confirm you're at the venue when you check in or meet someone at an event.";
const BLUETOOTH_USAGE = "NextVibe uses Bluetooth to detect a phone held right next to yours when you Tap to Meet someone in person or check in at an event.";

export default {
    expo: {
        name: "NextVibe",
        slug: "NextVibe",
        version: "1.0.6",
        orientation: "portrait",
        icon: "./assets/new_icon.png",
        scheme: "nextvibe",
        userInterfaceStyle: "automatic",
        newArchEnabled: true,
        jsEngine: "hermes",
        ios: {
            jsEngine: "hermes",
            supportsTablet: false,
            bundleIdentifier: "com.nextvibe.app",
            googleServicesFile: "./GoogleService-Info.plist",
            usesAppleSignIn: true,
            infoPlist: {
                ITSAppUsesNonExemptEncryption: false,
                NSCameraUsageDescription: CAMERA_USAGE,
                // Chat videos from the camera record sound (expo-image-picker).
                NSMicrophoneUsageDescription: MICROPHONE_USAGE,
                NSPhotoLibraryUsageDescription: PHOTOS_USAGE,
                // "Save Image" in the share sheet (Seeker card) needs it.
                NSPhotoLibraryAddUsageDescription: PHOTOS_ADD_USAGE,
                NSLocationWhenInUseUsageDescription: LOCATION_USAGE,
                NSBluetoothAlwaysUsageDescription: BLUETOOTH_USAGE,
                NSBluetoothPeripheralUsageDescription: BLUETOOTH_USAGE,
                // Enforced by ./withStripIosKeys.js; expo-video would add "audio".
                UIBackgroundModes: ["remote-notification"]
            },
            associatedDomains: ["applinks:nextvibe.io"]
        },
        android: {
            versionCode: 6,
            jsEngine: "hermes",
            softwareKeyboardLayoutMode: "resize",
            adaptiveIcon: {
                foregroundImage: "./assets/new_icon.png",
                backgroundColor: "#0A0410"
            },
            notification: {
                icon: "./assets/push_icon.png",
                color: "#A855F7",
                androidMode: "default",
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
                // Bluetooth permissions (incl. BLUETOOTH_SCAN with neverForLocation
                // and BLUETOOTH_ADVERTISE) come from modules/ble-share's manifest.
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
                        },
                        {
                            scheme: "https",
                            host: "nextvibe.io",
                            pathPrefix: "/event-checkin"
                        },
                        {
                            scheme: "https",
                            host: "nextvibe.io",
                            pathPrefix: "/event-nfc-receive"
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
            // First on purpose: Info.plist mods run in reverse order, so this one runs last.
            "./withStripIosKeys.js",
            "@react-native-firebase/app",
            "expo-router",
            "expo-image",
            "expo-web-browser",
            [
                "expo-build-properties",
                {
                    ios: {
                        "useFrameworks": "static",
                        "newArchEnabled": true,
                        "forceStaticLinking": ["RNFBApp", "RNFBAuth"],
                        "extraPods": [
                            {
                                "name": "FirebaseAuth",
                                "modular_headers": true
                            },
                            {
                                "name": "FirebaseCore",
                                "modular_headers": true
                            },
                            {
                                "name": "GoogleUtilities",
                                "modular_headers": true
                            }
                        ]
                    },
                    android: {
                        usesCleartextTraffic: true,
                        enableProguardInReleaseBuilds: true,
                        enableShrinkResourcesInReleaseBuilds: true,
                        extraProguardRules: "-dontwarn javazoom.jl.**\n-dontwarn java.applet.**\n-keep class com.swmansion.rnscreens.** { *; }\n-keepclassmembers class com.swmansion.rnscreens.** { *; }\n-dontwarn com.google.firebase.ktx.**\n-dontwarn com.google.firebase.**.ktx.**"
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
                    cameraPermissionText: CAMERA_USAGE,
                    enableMicrophonePermission: true,
                    microphonePermissionText: MICROPHONE_USAGE
                }
            ],
            [
                "expo-image-picker",
                {
                    photosPermission: PHOTOS_USAGE,
                    cameraPermission: CAMERA_USAGE,
                    microphonePermission: MICROPHONE_USAGE
                }
            ],
            [
                "expo-video",
                {
                    supportsBackgroundPlayback: true,
                    supportsPictureInPicture: true
                }
            ],
            "expo-font",
            // Never used with requireAuthentication, so no Face ID string.
            ["expo-secure-store", { faceIDPermission: false }],
            "react-native-compressor",
            "expo-notifications",
            [
                "expo-location",
                {
                    // Foreground only: false removes the "Always" strings.
                    locationAlwaysAndWhenInUsePermission: false,
                    locationAlwaysPermission: false,
                    locationWhenInUsePermission: LOCATION_USAGE
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
            "expo-apple-authentication",
            [
                "@react-native-google-signin/google-signin",
                {
                    iosUrlScheme: "com.googleusercontent.apps.1063264156706-9of910einuhchb1pef6g482vu8b91nh4"
                }
            ]
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
        runtimeVersion: "0.0.2-events",
        updates: {
            url: "https://u.expo.dev/4c7d8842-f989-419d-b3ec-49ceece00b6e"
        }
    }
};
