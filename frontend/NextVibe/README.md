# NextVibe app

The NextVibe mobile app for Android and iOS: Tap to Meet, Proof of Meet, events and check-in,
collectibles, wallets and chats. Expo SDK 55, React Native 0.83, expo-router, TypeScript.
Package / bundle id: `com.nextvibe.app`.

## How it talks to the backend

| What | Where |
|---|---|
| REST API | `https://api.nextvibe.io/api/v1`, hardcoded in `src/utils/url_api.ts`; JWT in `Authorization`, refreshed by the axios interceptor (`src/utils/axiosInterceptor.ts`) |
| Realtime | `wss://realtime.nextvibe.io/ws` and `https://realtime.nextvibe.io/api/v2` (`src/services/WebSocketService.ts`, `src/api/chat.ts`) |
| Solana reads | The API's RPC proxy `/api/v1/wallets/rpc/` (`app/_layout.tsx`) |
| Wallets | Mobile Wallet Adapter (Android, Seed Vault on Seeker), LazorKit passkey wallets, Phantom / Solflare / Backpack deep links on iOS |
| Swaps | Jupiter Swap API, Android only (`src/services/JupiterService.ts`) |
| Push | Expo notifications; the token is saved to the API (`src/notifications/`) |

A build from source therefore talks to the production service: you sign in with a real
NextVibe account.

## Run it from source (Android)

Expo Go can't run NextVibe: the app has its own native modules (`modules/nfc-send` for NFC
host card emulation, `modules/ble-share` for Bluetooth) plus Mapbox and the Mobile Wallet
Adapter, so it needs a development build.

You need Node.js (the steps below were checked with Node 26.7 and npm 11.19), JDK 17 and the
Android SDK (Android Studio), and a phone with USB debugging. Tap to Meet needs real phones:
emulators can't emulate NFC, and their Bluetooth support is limited.

```bash
cd frontend/NextVibe
cp .env.example .env
# Set RNMAPBOX_MAPS_DOWNLOAD_TOKEN (and EXPO_PUBLIC_MAPBOX_TOKEN for maps) before the first prebuild
npm install
npx expo prebuild --platform android
npx expo run:android
```

- `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` is a Mapbox secret token with the `DOWNLOADS:READ` scope
  (free Mapbox account). Gradle needs it to download the Mapbox SDK. `withMapboxMaven.js`
  writes it into `node_modules/@rnmapbox/maps/android/build.gradle` on the first prebuild and
  leaves that file alone afterwards, so if you ran prebuild without it, reinstall the package
  and prebuild again: `rm -rf node_modules/@rnmapbox/maps && npm install && npx expo prebuild --platform android --clean`.
- Without `EXPO_PUBLIC_MAPBOX_TOKEN` the app runs but maps stay empty.
- The other variables are optional (table below).
- npm 11 may warn that some packages' install scripts aren't approved; the app doesn't need them.

iOS: `npx expo prebuild --platform ios` and `npx expo run:ios` need Xcode and CocoaPods.
iPhones can't send over NFC, so Tap to Meet uses Bluetooth or a QR code there.

## Environment variables

Listed in [.env.example](.env.example). `EXPO_PUBLIC_*` values are bundled into the app.

| Variable | Required | Purpose |
|---|---|---|
| `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` | yes, to build | Mapbox secret download token (scope DOWNLOADS:READ); needed at prebuild/build time for @rnmapbox/maps |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | for maps | Mapbox public token for the maps and place names; without it maps don't load |
| `EXPO_PUBLIC_JUPITER_API_KEY` | no | Jupiter API key for token swaps; empty uses Jupiter's keyless lite API |
| `EXPO_PUBLIC_PAYMASTER_URL` | no | Paymaster URL for sponsored transactions: LazorKit passkey wallets (default https://paymaster.lazor.sh) and the Kora paymaster for gasless MWA swaps (default https://paymaster.nextvibe.io) |
| `EXPO_PUBLIC_PAYMASTER_API_KEY` | for sponsored transactions | Paymaster API key sent with those requests |
| `EXPO_PUBLIC_VEXO_API_KEY` | no | Vexo analytics key; empty (or a dev build) skips analytics |

## Tests

```bash
npx jest --watchAll=false        # logic: utils, stores, navigation (155 tests)
npm run test:components          # component render tests with snapshots (15 tests)
npx tsc --noEmit                 # type check
```

The component tests use `jest.components.config.js` (the plain React Native preset plus the
mocks in `jest.components.setup.js`).

## Where things are

| Folder | What |
|---|---|
| `app/` | Routes (expo-router); `app/_layout.tsx` sets up providers, push, the Bluetooth scanner and the tap prompt |
| `components/` | Screens and UI by feature (`Events/`, `Proximity/`, `Meet/`, `NftClaim/`, `Collectibles/`, `ProfilePage/`, `Wallet/`, `Chat/`) |
| `src/api/` | API clients |
| `src/proximity/`, `hooks/useProximity*.ts`, `hooks/useBleScanner.tsx` | Tap to Meet (see [docs/TAP_TO_MEET.md](../../docs/TAP_TO_MEET.md)) |
| `src/services/`, `src/stores/` | Wallets, chat transport, Zustand stores |
| `modules/nfc-send`, `modules/ble-share` | Native modules (Kotlin, Swift) |
| `app.config.js`, `with*.js` | Expo config and config plugins (Mapbox Maven, MWA intent queries, iOS Info.plist keys) |

## Releases

EAS builds (`eas.json` profiles `development`, `preview`, `production`) and OTA updates.
`runtimeVersion` is the fixed string `0.0.2-events`, so JS-only changes can ship as updates.
