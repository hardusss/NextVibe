# Events

Organizers bring a Luma event into NextVibe, approve who comes, check people in with a tap,
and watch the room on the organizer dashboard. Attendees get REP and a POAP for checking in,
and REP for meeting each other.

An event is a post with event fields (`is_luma_event`, `luma_event_url`, start and end time,
an H3 location cell). Code: `backend/NextVibeAPI/posts/view_pac/` (`luma_event.py`,
`event_requests.py`, `event_checkin.py`, `event_connections.py`, `event_analytics.py`,
`event_taps.py`, `event_update.py`) and the app's `components/Events/`.

## 1. Import from Luma

1. `POST /api/v1/posts/luma-event/preview/` with a `lu.ma` or `luma.com` link. The API reads
   the public event page: title, cover image, description, venue and coordinates (from the
   page's structured data, a map link, or geocoding), start and end time.
2. The organizer proves the event is theirs with an **NV code**: the API returns a code like
   `NV-123` (kept for 15 minutes); the organizer pastes it into the Luma event description.
3. `POST /api/v1/posts/luma-event/verify/` fetches the page again and looks for the code.
4. The app or dashboard creates the event post (`POST /api/v1/posts/posts/?v2=true`), uploads
   the cover (`/posts/add-media/`), finalizes it for moderation, and publishes the event's
   first edition (`/posts/cnft-mint/`). The location is stored as an H3 cell at resolution 11.

Online-only Luma events can't be added from the app.

## 2. Requests and approval

- An attendee asks to join: `POST /api/v1/posts/event-requests/create/<event_id>/`
  (`EventRequest`, one per person and event: pending, approved or rejected).
- The organizer sees requests (`GET /api/v1/posts/event-requests/`) and approves or rejects
  them (`POST /api/v1/posts/event-requests/action/<request_id>/`). Both sides get a
  notification and a push.
- Only approved attendees can check in.

## 3. Check-in

Two ways in:

- **Tap check-in (the normal path).** The organizer opens the check-in sheet in the app
  (`components/Events/NfcCheckinSheet.tsx`). It broadcasts a rotating `checkin` token over NFC,
  Bluetooth or a QR code, exactly like [Tap to Meet](TAP_TO_MEET.md), and refreshes the list of
  checked-in people every 3 seconds. The attendee's phone reads it and the API checks them in
  (`POST /api/v1/posts/proximity/verify-token/`).
- **Self check-in** from an event link: `POST /api/v1/posts/event-checkin/<event_id>/`.

What the API checks:

- The attendee has an approved request.
- **Geofence:** when the event has a location, the attendee's coordinates must fall within
  two H3 cells of the event's cell (resolution 11), so coordinates are required.
- One check-in per person per event (`EventCheckin` is unique, and repeating it is harmless).

The event's hours are not checked at check-in. They decide when taps between checked-in
people count as event taps, which events show as active, and when a post made at the venue
gets the +10 REP event bonus.

What a check-in writes:

- an `EventCheckin` row;
- 5–20 REP (random), given by the organizer;
- a POAP for the attendee (next section).

## 4. POAPs

- Each event post has a supply (`total_supply`, default 50). The organizer can change it with
  `PATCH /api/v1/posts/event-update/<event_id>/`, but not below what's already minted. The
  organizer publishes first, so their edition is normally #1.
- At check-in the attendee's POAP is recorded as the next edition (`#N of 50`). If the supply is
  used up, the check-in still counts but no POAP is recorded.
- With a wallet linked, the POAP goes on Solana right away (queued for the worker, see
  [SOLANA.md](SOLANA.md#poap-at-an-event-check-in)). Without one, it's saved to the profile
  and can be claimed any time.
- The check-in screen asks for it with `POST /api/v1/posts/claim-event-cnft/<event_id>/`
  (the geofence is checked again) and shows one of:

  | State | Text |
  |---|---|
  | Minting | Minting POAP… |
  | Minted | POAP minted · +N REP |
  | No wallet | POAP saved · claim anytime |
  | Failed | POAP didn't go through · Retry |

## 5. At the event

- Checked-in people can Tap to Meet each other; those taps count as event taps (REP depends on
  the difference in REP, 2–20 each, see [TAP_TO_MEET.md](TAP_TO_MEET.md#what-gets-stored)).
- Posts made at the venue while checked in are tied to the event and get +10 REP.
- The organizer can push a message to all approved attendees:
  `POST /api/v1/posts/event-broadcast/<event_id>/`.

## 6. Organizer dashboard

The dashboard at **https://dashboard.nextvibe.io** is a separate Next.js app
(repository `nextvibe-organizers-portal`). It calls the same API:

| Panel | Endpoint |
|---|---|
| Create an event (Luma preview, NV code, post, cover, publish) | `luma-event/preview`, `luma-event/verify`, `posts/`, `add-media/`, `finalize/`, `cnft-mint/` |
| Events list | `GET /posts/posts-menu/<user_id>/?is_event=true` |
| Requests and attendees | `GET /posts/event-requests/`, `POST …/action/<id>/`, `GET …/attendees/<event_id>/` |
| Analytics: requests, check-ins, taps, total REP, POAP claims, wallet share, hourly activity | `GET /posts/event-analytics/<event_id>/` |
| Top attendees | `GET /posts/event-top-users/<event_id>/` |
| Who met whom (graph) | `GET /posts/event-social-graph/<event_id>/` |
| Tap heat map | `GET /posts/event-taps/<event_id>/` |
| Posts made at the event | `GET /posts/event-posts/<event_id>/` |
| Broadcast push | `POST /posts/event-broadcast/<event_id>/` |
| Edit or delete the event | `PATCH /posts/event-update/<event_id>/`, `DELETE /posts/delete-post/` |

The app has the same organizer tools for phones: add a Luma event, requests, attendees and
the tap check-in sheet (`components/Events/EventsScreen.tsx`).
