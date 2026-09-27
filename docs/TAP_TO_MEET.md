# Tap to Meet

Two people hold their phones together; one confirms; both get REP and a Proof of Meet.
This page covers how the phones find each other, which platform pairs work, what the
backend checks and what it stores.

## The short version

1. The sharing phone (open on **Profile → Tap to Meet**) asks the API for a short-lived
   token and broadcasts a link: `https://nextvibe.io/u/e?t=<token>`.
2. The other phone picks the link up over NFC, Bluetooth or a QR code and shows
   "Meet @name?" with **Not now** and **Confirm**. The sharing phone shows
   "They picked you up".
3. On Confirm, the API records the meet for both people and answers with the result
   ("You met @name", "+1 REP", "Reputation added for both of you.").
4. Each person gets a Proof of Meet collectible (on Solana if they have a wallet) and can
   take a selfie together and share the card on X.

## Transports

Every transport carries the same link. The app turns links from any source into one prompt
(`src/proximity/promptStore.ts`, rendered by `components/Proximity/ProximityPrompt.tsx`).

### NFC (Android sends, both platforms receive)

- The Android module `modules/nfc-send` is a host card emulation service
  (`NdefHostApduService.kt`): the phone acts as an NFC Forum Type 4 tag holding one NDEF URI
  record with the link. It answers the NDEF application select (AID `D2760000850101`) and the
  capability container and NDEF files. The service is off until a share screen turns it on.
- The reading phone needs no NextVibe screen open: iPhones read the tag in the background and
  show a NextVibe banner that opens the app (universal link on `nextvibe.io`); Android
  dispatches the link to the app through its `nextvibe.io/u` app link.
- iPhones can't emulate a tag, so they never send over NFC (the iOS module is a stub).

### Bluetooth LE (both platforms)

- `modules/ble-share` advertises one service UUID (`A1B2C3D4-E5F6-7890-ABCD-EF1234567890`)
  with no name or data; the link is a readable GATT characteristic.
- The scanner runs while the app is in the foreground and signed in. To feel like a tap, it
  only accepts a phone whose averaged signal is at least −45 dBm (phones held close together),
  picks the strongest phone over a 350 ms window, and waits 15 s before reading
  the same phone again.
- Both apps have to be open.

### QR code (iPhone fallback)

- On iPhone the share screen can show the link as a QR code (`components/Proximity/TapQrCode.tsx`);
  it rotates with the token. The other phone scans it with the system camera.

On Android the share screen has an NFC / Bluetooth switch (NFC is the default); on iPhone,
Bluetooth / QR. While sharing, each phone also scans for Bluetooth, so one working direction
is enough.

## Platform matrix

| Pair | What works |
|---|---|
| Android ↔ Android | NFC (the reader doesn't need the app open) or Bluetooth (both apps open) |
| Android → iPhone | NFC (the iPhone shows a banner) or Bluetooth if the Android phone switched to it |
| iPhone → Android | Bluetooth (both apps open) or QR code |
| iPhone ↔ iPhone | Bluetooth (both apps open) or QR code; no NFC in either direction |

## Tokens and the confirm step

- `POST /api/v1/posts/proximity/generate-token/` returns an 8-character token stored in the
  cache for 5 minutes with the owner, the mode (`irl`, `networking` at an event, `checkin`)
  and the event. The app renews it every 50 s while sharing. A user checked in to an event
  that's running gets an event (`networking`) token automatically.
- The reading phone first calls `POST /api/v1/posts/proximity/verify-token/` with
  `preview: true`: all checks run, nothing is written, and the app shows who it is.
- **Confirm** calls it again without `preview`, with the location when it's available.
- The sharing phone learns the result by polling `GET /api/v1/posts/user-event-connections/`.

What the API checks (`posts/view_pac/event_connections.py`):

- You can't tap yourself, and blocked people can't tap each other (the answer doesn't reveal
  the name).
- **Outside an event:** one meet per pair per UTC day, and at most 15 taps per person per day.
- **At an event:** the person confirming must be checked in and, when the event has a
  location, within two H3 cells of it; each pair meets once per event.

## What gets stored

| Where | What |
|---|---|
| `Reputation` (two rows, one per person) | Source `irl` or `event`, the other person, the event, an H3 cell (resolution 9 outside events, 15 at events), and a shared `meet_slug`. |
| REP | Outside an event: +1 REP each. At an event: the person with less REP gets more — `max(2, min(20, 15 % of the difference))` — and the other gets 2. |
| `meet_slug` | 12 characters, an HMAC of the pair and the UTC day (outside events) or the event. Public page: `nextvibe.io/u/meet/<slug>`; card image: `GET /api/v1/meet/<slug>/card.png`. |
| `Collectible` (two rows) | One Proof of Meet per person: `queued` for Solana if they have a wallet, `offchain` otherwise. See [SOLANA.md](SOLANA.md#proof-of-meet). |
| Push | Outside events the sharing person gets "Tap to Meet — @name tapped with you." |

REP and meets live in the database; only the Proof of Meet leaves go on-chain.

## The selfie (optional)

After a meet, either person can take one selfie for the pair (`posts/src/meet_photos.py`):

1. `POST /api/v1/meet/<slug>/photo/lock` — the first person to open the camera reserves the
   shot for 3 minutes.
2. `POST /api/v1/meet/<slug>/photo` — upload: EXIF is removed, the image is re-encoded and
   checked by moderation, previews are drawn (limits: 3 retakes, 8 uploads per meet).
3. `POST /api/v1/meet/<slug>/photo/send` — the other person has 24 hours to answer.
4. `POST /api/v1/meet/<slug>/photo/decision` — only they can approve. Approval runs moderation
   again and publishes a post on both profiles (owner and co-author), and the metadata of both
   Proof of Meet cNFTs shows the photo.
5. Either person can take the photo down at any time; the cNFTs stay.

Raw uploads live in a private R2 bucket and are read through 10-minute signed URLs.

## Code map

| Piece | Where |
|---|---|
| Share screen | `frontend/NextVibe/components/Events/EventNFCShareScreen.tsx` |
| Broadcast / scan hooks | `hooks/useProximityBroadcast.ts`, `hooks/useBleScanner.tsx`, `hooks/useShareChannel.ts`, `hooks/useProximityReadiness.ts` |
| Receive prompt | `src/proximity/promptStore.ts`, `components/Proximity/ProximityPrompt.tsx`, `app/+native-intent.ts` |
| Native modules | `modules/nfc-send` (Android HCE), `modules/ble-share` (iOS and Android) |
| Backend | `backend/NextVibeAPI/posts/view_pac/proximity_token.py`, `event_connections.py`, `posts/src/meets.py`, `posts/src/meet_photos.py` |
