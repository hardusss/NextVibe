# NextVibe API

The Django REST API behind the app, the web share pages and the organizer dashboard.
This list is generated from the URL configuration (`backend/NextVibeAPI/NextVibeAPI/urls.py`
and each app's `urls.py`); nothing here is planned or hypothetical.

- **Base URL:** `https://api.nextvibe.io/api/v1`
- **Format:** JSON in and out, unless noted (PNG cards, NFT metadata JSON).
- **Trailing slashes:** most routes end with `/`. The newer `meet/…`, `collectibles/…` and
  `me/…` routes answer both with and without it.
- **Legacy aliases:** the chat and Cherry routes are also mounted without `v1`
  (`/api/chat/…`, `/api/cherry-…`) for older app builds.

## Authentication

- JWT via `djangorestframework-simplejwt`. Send `Authorization: Bearer <access token>`.
- Sign-in endpoints (email, Google, Apple, wallet) return `{"refresh": …, "access": …}`
  (under `token` in most responses). Access tokens live 1 hour; refresh tokens live 90 days
  and rotate on refresh (`POST /users/token/refresh/`).
- `user.auth.CustomJWTAuthentication` also rejects tokens of deactivated or deleted accounts.
- The default permission is `AllowAny`, so every private view sets `IsAuthenticated` itself.
  Public views are marked **public** below.
- Rate limits are per view (`ScopedRateThrottle` scopes in
  `backend/NextVibeAPI/NextVibeAPI/setting/prod.py`, e.g. `auth` 30/min, `email_code` 5/min,
  `email_code_check` 10/min, `post` 15/min, `mint` 5/min, `rpc_proxy` 300/min). There is no
  global default throttle.
- **Email confirmation** (`EMAIL_VERIFICATION_REQUIRED=true`): an email + password account
  that hasn't confirmed its email gets no tokens. `POST /users/register/` answers `201` with
  `{"verification_required": true, "email", "user_id", "resendIn"}`, and `/users/login/` and
  `/users/token/` answer `403 {"code": "EMAIL_NOT_VERIFIED", "email", "resendIn"}`; both send a
  6-digit code (`sendError` says when the email couldn't go out). `POST /users/email/verify/`
  with `{email, password, code}` answers like login. Google, Apple and wallet sign-in never
  ask for a code. With the switch off, nothing changes.
- The socket service (realtime chat) accepts the same access token; see
  [ARCHITECTURE.md](ARCHITECTURE.md#realtime).

## Users and sign-in — `/users/`

| Method | Path | Purpose |
|---|---|---|
| POST | `/users/register/` | Email sign-up (optional invite code) |
| POST | `/users/login/` | Email + password sign-in |
| POST | `/users/google-sign-in/` | Sign in or sign up with a Google ID token |
| POST | `/users/apple-sign-in/` | Sign in or sign up with an Apple identity token |
| POST | `/users/wallet-sign-in/` | Sign in or sign up with a Solana wallet |
| POST | `/users/token/` | simplejwt token pair from email and password (login rate limit; `403 EMAIL_NOT_VERIFIED` like login) |
| POST | `/users/email/send-code/` | A new code to confirm the email (`{email, password}`; `429 COOLDOWN` with `retryIn`) |
| POST | `/users/email/verify/` | Confirm the email with the code (`{email, password, code}`); answers like login |
| POST | `/users/password/forgot/` | Email a password reset code (`{email}`; the same answer whether or not an account has it) |
| POST | `/users/password/reset/` | Set a new password with the code (`{email, code, newPassword}`); signs out other devices, answers like login |
| POST | `/users/token/refresh/` | New access token from a refresh token |
| GET, POST, PUT | `/users/2fa/` | Two-factor authentication setup and checks |
| PUT | `/users/reset-password/` | Change the password with an authenticator code (older app versions) |
| POST | `/users/link-email/` | Add an email to a wallet-only account |
| GET | `/users/check-status/` | Whether the signed-in account is banned |
| DELETE | `/users/delete-account/` | Anonymizing soft delete of the account |
| GET | `/users/user-detail/<id>/` | Profile of a user, as the signed-in viewer sees it |
| GET | `/users/public/user/<id>/` | **public** Profile with an allowlisted set of fields |
| GET | `/users/lookup/?username=` | User id for a username |
| GET | `/users/search/` | Search users by username |
| GET, POST, DELETE | `/users/history/` | The signed-in user's search history |
| GET | `/users/recommendations/<id>/` | Suggested people to follow |
| PUT | `/users/follow/<id>/` | Follow or unfollow |
| GET | `/users/get-readers/` | Followers of a user |
| GET | `/users/get-follows/` | Accounts a user follows |
| POST | `/users/block/` | Block a user (both sides hidden everywhere) |
| DELETE | `/users/block/<user_id>/` | Unblock |
| GET | `/users/blocked/` | People the signed-in user blocked |
| PUT | `/users/update/user-text/` | Edit name, username, bio |
| PUT, DELETE | `/users/update/user-avatar/` | Upload or remove the avatar |
| GET | `/users/notifications/` | In-app notifications |
| GET | `/users/count-unread-notifications/` | Unread notification count |
| PUT | `/users/read-notifications/` | Mark notifications read |
| GET, POST | `/users/save-push-token/` (alias `/users/me/push-token/`) | Read or store the Expo push token (one per account) |
| POST, DELETE | `/users/save-wallet/` | Link or unlink the user's Solana wallet; an optional `proof` (`{message: "Verify wallet for NextVibe.\nNonce: <ms>", signature: [64 bytes]}`) marks it proven (`walletProven`) |
| GET | `/users/invite-info/` | The user's invite code and how many people used it |
| POST | `/users/seeker/verify/` | Check the linked wallet for a Seeker Genesis Token and grant Seeker Verified; `400 WALLET_NOT_PROVEN` until the wallet is proven (send `proof` as for save-wallet) |
| POST | `/users/mint-og/` | Mint the user's OG badge cNFT (limited edition) |
| GET | `/users/<id>/share/` | **public** Data for the profile share page |
| GET | `/users/<id>/card.png` | **public** Profile link-preview card |
| GET | `/users/<username>/seeker-share/` | **public** Data for the Seeker Verified share page |
| GET | `/users/<username>/seeker-card.png` | **public** Seeker Verified card image |
| GET | `/users/<username>/collectibles?kind=poap\|meet\|post\|badge` | A user's collectibles (POAPs, Proof of Meet, collected posts, badges) |

## Posts, feed and collect — `/posts/`

| Method | Path | Purpose |
|---|---|---|
| GET, POST | `/posts/posts/` | List or create posts (router) |
| GET, PUT, PATCH, DELETE | `/posts/posts/<id>/` | One post (router) |
| POST | `/posts/posts/<id>/finalize/` | Finish a post after its media is uploaded |
| POST | `/posts/add-media/` | Attach media files to a post |
| GET | `/posts/recommendation-feed/` | The home feed |
| GET | `/posts/recomendations/` | Older recommendations feed, kept for older builds |
| GET | `/posts/get-post/` | One post with its viewer-specific state |
| GET | `/posts/posts-menu/<user_id>/` | A profile's posts grid (own posts and co-authored Proof of Meet posts) |
| GET | `/posts/collections-menu/<user_id>/` | A profile's collected cNFTs |
| PUT | `/posts/post-like/<id>/<post_id>/` | Like or unlike a post |
| POST, DELETE | `/posts/comment-create/` | Add or delete a comment |
| POST, DELETE | `/posts/comment-reply/<comment_id>/` | Reply to a comment, or delete a reply |
| PUT | `/posts/comment-like/<comment_id>/` | Like or unlike a comment |
| GET | `/posts/get-comments/<post_id>/` | Comments of a post |
| DELETE | `/posts/delete-post/` | Delete a post |
| POST | `/posts/report-post/` | Report a post |
| POST | `/posts/generate-image/` | Start an AI image generation (Replicate) |
| GET | `/posts/generate-image/status/` | Poll an AI image generation |
| GET | `/posts/get-vibemap-nfts/` | Posts with cNFT drops for the map |
| GET | `/posts/get-vibemap-events/` | Events for the map |
| POST | `/posts/collect/prepare/` | Start a free collect: a transaction the collector co-signs (NextVibe pays the fee) |
| POST | `/posts/collect/submit/` | Send the co-signed collect transaction |
| POST | `/posts/cnft-mint/` | Mint the owner's own edition of their post |
| GET | `/posts/<post_id>/metadata/<edition>/` | **public** cNFT metadata JSON of a post edition or POAP |
| GET | `/posts/collection/metadata/` | **public** Collection metadata JSON |
| GET | `/posts/<id>/share/` | **public** Data for the post share page |
| GET | `/posts/<id>/card.png` | **public** Post link-preview card |
| POST | `/posts/moderation-callback/` | Result callback from the moderation service |

## Events and check-in — `/posts/`

Events are posts with event fields; see [EVENTS.md](EVENTS.md). "Organizer or admin" endpoints
also answer admins (`User.is_admin`) for any event; changing an event stays with its owner.

| Method | Path | Purpose |
|---|---|---|
| GET | `/posts/all-events/` | Every event, newest first, with its owner (admins only; `index`, `limit` up to 500) |
| POST | `/posts/luma-event/preview/` | Read a Luma event page before importing it |
| POST | `/posts/luma-event/verify/` | Verify ownership of a Luma event and import it |
| PATCH | `/posts/event-update/<post_id>/` | Edit an event (organizer) |
| POST | `/posts/event-requests/create/<post_id>/` | Ask to join an event |
| GET | `/posts/event-requests/` | Join requests (organizer) |
| POST | `/posts/event-requests/action/<request_id>/` | Approve or reject a request |
| GET | `/posts/event-requests/attendees/<post_id>/` | Approved attendees (organizer or admin) |
| POST | `/posts/event-checkin/<post_id>/` | Check in at an event (location and time window checked) |
| GET | `/posts/event-checkin/list/<post_id>/` | Checked-in people (organizer or admin) |
| POST | `/posts/claim-event-cnft/<post_id>/` | Claim the event POAP |
| GET | `/posts/active-checkin/` | Events the user is checked in to right now |
| GET | `/posts/user-event-connections/` | Events attended and reputation breakdown |
| GET | `/posts/event-posts/<post_id>/` | Posts made during an event |
| GET | `/posts/event-analytics/<post_id>/` | Dashboard analytics (organizer or admin) |
| GET | `/posts/event-top-users/<post_id>/` | Top attendees by REP and taps (organizer or admin) |
| GET | `/posts/event-taps/<post_id>/` | Check-in and tap coordinates for the heat map (organizer or admin) |
| GET | `/posts/event-social-graph/<post_id>/` | Who met whom at the event (organizer or admin); for the dashboard replay also `total_checkins` and `taps` (`{time, h3, user_a, user_b}` per event tap, oldest first) |
| POST | `/posts/event-broadcast/<post_id>/` | Push a message to approved attendees (organizer) |

## Tap to Meet — `/posts/`

See [TAP_TO_MEET.md](TAP_TO_MEET.md).

| Method | Path | Purpose |
|---|---|---|
| POST | `/posts/proximity/generate-token/` | Short-lived token a phone broadcasts over NFC, Bluetooth or QR |
| POST | `/posts/proximity/verify-token/` | Resolve a received token (`preview: true` shows who it is before confirming) |
| POST | `/posts/irl-tap/` | Record a Tap to Meet outside an event (older builds; `403 NOT_SHARING` unless the other person has Tap to Meet open) |
| POST | `/posts/event-nfc-connect/` | Record a tap between two people checked in to the same event (older builds; `403 NOT_SHARING` as above) |

## Proof of Meet — `/meet/` and `/meta/meet/`

| Method | Path | Purpose |
|---|---|---|
| GET | `/meet/<slug>` | **public** A meet's share data (a token is optional) |
| GET | `/meet/<slug>/card.png?v=og\|story` | **public** Meet card image |
| GET | `/meet/first-tap/<user_id>/card.png` | **public** "Make your first tap" teaser card |
| GET, POST | `/meet/<slug>/photo` | The meet's selfie: read state or upload a draft |
| POST | `/meet/<slug>/photo/lock` | Reserve the selfie slot while one person shoots |
| POST | `/meet/<slug>/photo/send` | Send the previewed selfie to the other person |
| POST | `/meet/<slug>/photo/cancel` | Drop a draft |
| POST | `/meet/<slug>/photo/decision` | The other person approves or declines the selfie |
| POST | `/meet/<slug>/photo/caption` | Caption the published selfie post |
| POST | `/meet/<slug>/photo/hide` | Hide the selfie post from your profile |
| POST | `/meet/<slug>/photo/takedown` | Remove the selfie post |
| GET | `/meet/photos/pending` | Selfies waiting for your decision |
| GET | `/meet/photos/mine` | Your selfies |
| GET | `/meet/photo-file/<token>` | **public** Signed private file (local runs only; production uses signed R2 URLs) |
| GET | `https://api.nextvibe.io/meta/meet/<slug>.json` | **public** Metadata JSON of a meet's cNFTs |
| GET | `https://api.nextvibe.io/meta/meet/<slug>/<user_id>.json` | **public** Metadata JSON of one person's Proof of Meet cNFT |

## Collectibles — `/collectibles/`, `/me/`

Wallet-optional: POAPs and Proof of Meet are recorded first and put on Solana when the
person has a wallet. See [SOLANA.md](SOLANA.md#claim-later).

| Method | Path | Purpose |
|---|---|---|
| GET | `/collectibles/<id>` | One collectible and its detail sheet data |
| POST | `/collectibles/<id>/claim` | Put one collectible on Solana (`400 no_wallet` asks the app to connect one) |
| POST | `/collectibles/claim-all` | Put every unclaimed collectible on Solana |
| GET | `/me/collectibles/summary?tz=` | Counts for the banner and badge |
| GET, PATCH | `/me/notification-settings` | Wallet reminder on/off |

## Wallet — `/wallets/`

| Method | Path | Purpose |
|---|---|---|
| POST | `/wallets/rpc/` | **public** JSON-RPC proxy to Helius, so the app never holds an RPC key |
| POST | `/wallets/get-tokens-price/` | **public** Token prices |
| GET | `/wallets/fee/` | Network fee estimate |
| GET | `/wallets/transactions/` | Indexed transactions of the user's wallet |
| POST | `/wallets/transactions/load-more/` | Older transactions (asks the tx-indexer) |
| POST | `/wallets/transactions/refresh/` | Re-fetch the latest transactions (asks the tx-indexer) |
| POST | `/wallets/webhook-notify/` | Internal: the tx-indexer reports a new transaction (`x-internal-secret`) |

## Chat — `/chat/`

Messages themselves flow through the socket service; these routes manage chat lists.

| Method | Path | Purpose |
|---|---|---|
| GET | `/chat/chats/` | The user's chats; `last_message` has `content`, `created_at`, `sender_id`, `media` (`[{type: image\|video}]`), `is_read` and `read_at` |
| GET | `/chat/unread-count/` | Unread messages count |
| GET | `/chat/online-users/` | Which contacts are online |
| POST | `/chat/create-chat/` | Start a chat |
| DELETE | `/chat/delete-chat/<chat_id>/` | Delete a chat |
| POST | `/chat/cherry-embed-token` | Token for the embedded Cherry group chat |
| GET | `/cherry-members` | Members of the Cherry group |
| GET, POST | `/cherry-mute` | Mute state of the Cherry group chat |
| POST | `/cherry-webhook` | Webhook from Cherry |

## Realtime service — `https://realtime.nextvibe.io/api/v2`

The socket service (`socket_service`) checks the same access token. Chat messages go over
`wss://realtime.nextvibe.io/ws`; these REST routes cover history and keys.

| Method | Path | Purpose |
|---|---|---|
| GET | `/messages/<chat_id>` | Chat history (stored text is a v3 envelope, an older envelope or plain text) |
| POST | `/messages/chat/<chat_id>/read` | Mark a chat read |
| POST | `/media/upload-url` | Presigned upload URL for a chat file (named `chat_media/chat_<chat>_<random>`) |
| POST, DELETE | `/messages/<id>/reactions` | Add or remove a reaction |
| PATCH, DELETE | `/messages/<id>` | Edit or delete a message |
| POST | `/e2ee/devices` | Publish this install's X25519 public key (`{device_id, public_key}`) |
| GET | `/e2ee/devices?user_ids=1,2` | Public keys of up to 20 people, to seal a message for all their devices |
| POST | `/chat/report-message` | Report a message with its decrypted text (not stored yet; see [E2EE_MODERATION_POLICY.md](E2EE_MODERATION_POLICY.md#4-reporting)) |

## Email, push and webhooks (root paths on `api.nextvibe.io`)

| Method | Path | Purpose |
|---|---|---|
| GET, POST | `/u/e/<token>` | Email unsubscribe (POST is one-click, RFC 8058) |
| GET | `/u/p/<token>` | Push opt-out |
| POST | `/api/v1/nv/resend-webhook/` | Resend delivery and open events (Svix signature checked) |
