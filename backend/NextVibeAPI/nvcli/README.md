# nv — NextVibe push & email console

`python manage.py nv` opens a full-screen menu (arrow keys + Enter, Ctrl-C = back to menu): audience overview, find a user, send to one user, send to a segment (campaign wizard with A/B variants, deterministic samples, test-to-yourself, typed confirmation above 50 recipients), campaign status, Expo push receipts, push-token validation, templates.

State lives in `nvcli/logs/` (gitignored): one `<campaign>.jsonl` per campaign (one line per delivery, `(user_id, channel)` already `sent` is never re-sent), `_index.json`, `optout.json` (written by the public `GET /u/e/<token>` and `/u/p/<token>` unsubscribe links), `errors.log` (tracebacks never reach the screen).

Templates are YAML in `nvcli/templates/` (`name`, `channel`, `title`, `body`, `deeplink`, `data`, `cta_label`); placeholders `{username} {first_name} {rep} {joined} {events} {met} {seeker} {seeker_total}` resolve per user, anything else is asked for in the wizard, and an unresolved placeholder blocks the send. `nvcli/templates/email/base.html` wraps email bodies (inline CSS + plain-text alternative + unsubscribe link).

Sending: Expo in batches of 100 with 2 s pauses and 3 retries on 429/5xx (`EXPO_ACCESS_TOKEN` optional); push `data` carries `{campaign, variant, wave}` so the app can report `campaign_open` to Vexo. Email goes through `RESEND_API_KEY` when set (also `NV_EMAIL_FROM`), otherwise Django's `EMAIL_BACKEND`; consumer/unconfigured SMTP is capped at 50 recipients.

Only DB writes: clearing `expo_push_token` when Expo says `DeviceNotRegistered`. Tests: `manage.py test nvcli`. Wording guard: templates must not contain reward / earn / SKR / farm / "points for".
