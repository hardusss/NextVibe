const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withHCE = (config) => {
    config = withAndroidManifest(config, (config) => {
        const app = config.modResults.manifest.application[0];

        const hasCardService = app.service?.some(
            (s) => s.$['android:name'] === 'com.reactnativehce.services.CardService'
        );

        if (!hasCardService) {
            if (!app.service) app.service = [];
            app.service.push({
                $: {
                    'android:name': 'com.reactnativehce.services.CardService',
                    'android:exported': 'true',
                    'android:permission': 'android.permission.BIND_NFC_SERVICE',
                },
                'intent-filter': [
                    {
                        action: [
                            { $: { 'android:name': 'android.nfc.cardemulation.action.HOST_APDU_SERVICE' } },
                        ],
                    },
                ],
                'meta-data': [
                    {
                        $: {
                            'android:name': 'android.nfc.cardemulation.host_apdu_service',
                            'android:resource': '@xml/apduservice',
                        },
                    },
                ],
            });
        }
        return config;
    });

    config = withDangerousMod(config, [
        'android',
        async (config) => {
            const resPath = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
            fs.mkdirSync(resPath, { recursive: true });

            const aidListContent = `<?xml version="1.0" encoding="utf-8"?>
<aid-group xmlns:android="http://schemas.android.com/apk/res/android"
           android:category="other"
           android:description="@string/app_name">
    <aid-filter android:name="D2760000850101" />
</aid-group>`;
            fs.writeFileSync(path.join(resPath, 'aid_list.xml'), aidListContent);

            const apduServiceContent = `<?xml version="1.0" encoding="utf-8"?>
<host-apdu-service xmlns:android="http://schemas.android.com/apk/res/android"
                   android:description="@string/app_name"
                   android:requireDeviceUnlock="false">
    <aid-group android:category="other"
               android:description="@string/app_name">
        <aid-filter android:name="D2760000850101"/>
    </aid-group>
</host-apdu-service>`;
            fs.writeFileSync(path.join(resPath, 'apduservice.xml'), apduServiceContent);

            return config;
        },
    ]);

    return config;
};

module.exports = withHCE;