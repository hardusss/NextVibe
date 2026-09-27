# moderation_service

A small Go HTTP service that checks the text and media of new posts with OpenAI's
`omni-moderation-latest` model and reports the result back to the API.

## How it fits in

1. When a post is finalized, the API's Celery task sends
   `POST http://127.0.0.1:8080/moderation` with `{"id", "content", "media_urls"}`
   (`backend/NextVibeAPI/posts/tasks.py`). Proof of Meet selfies and captions use the same
   endpoint synchronously (`posts/src/moderation.py`).
2. The service checks the text, then each media URL as an image (`openai_text_moderation.go`,
   `open_ai_image_moderation.go`). A check that errors counts as not passed, with the error
   type as the reason.
3. It answers the request with the result and also posts the same JSON to `CALLBACK_URL`
   (by default the API's `/api/v1/posts/moderation-callback/`) with the header
   `X-Moderation-Secret: <MODERATION_CALLBACK_SECRET>`; the API refuses callbacks without the
   right secret. The callback approves or rejects the post and notifies its author.

Response: `{"id", "content", "text": {"passed", "errors", …}, "files": [ … ], "passed", "reason"}`.

`GET /health` answers `200` when the process is up.

The Sightengine image, text and video code in this folder (`image_moderation.go`,
`text_moderation.go`, `video_moderation.go`) and the keyword category detection
(`category_detection.go`, `category_keywords.json`) are not called by `main.go`.

## Run it

```bash
cd moderation_service
cp .env.example .env          # set OPENAI_API_KEY
go build -o moderator_bin .
./moderator_bin               # listens on 127.0.0.1:8080; logs to moderation.log
```

In production, `.github/workflows/deploy.yml` rebuilds `moderator_bin` on every deploy and
restarts the `nextvibe-moderation` systemd unit.

## Environment variables

Listed in [.env.example](.env.example); `godotenv` loads `.env` from the working directory.

| Variable | Required | Purpose |
|---|---|---|
| `HOST` | no | Address to listen on (default 127.0.0.1: only the API on this host calls the service) |
| `PORT` | no | HTTP port (default 8080; the API calls http://127.0.0.1:8080/moderation) |
| `MODERATION_CALLBACK_SECRET` | yes | Sent as X-Moderation-Secret on the callback; must equal the API's MODERATION_CALLBACK_SECRET |
| `CALLBACK_URL` | no | API endpoint that receives moderation results (default http://127.0.0.1:8000/api/v1/posts/moderation-callback/) |
| `OPENAI_API_KEY` | yes | OpenAI API key; /moderation checks text and images with omni-moderation-latest |
| `SIGHTENGINE_USER` | no | Not used by the running handler: read only by the Sightengine code (image_moderation.go, text_moderation.go, video_moderation.go), which main.go doesn't call. Pairs SIGHTENGINE_USER/SIGHTENGINE_SECRET, then …2 to …10. |
| `SIGHTENGINE_SECRET` | no | Sightengine secret for SIGHTENGINE_USER (unused, see above) |

## Files

| File | What |
|---|---|
| `main.go` | HTTP server, `/moderation` and `/health`, the callback |
| `openai_text_moderation.go`, `open_ai_image_moderation.go` | OpenAI moderation calls |
| `error_handler.go`, `helpers.go` | Error types and helpers |

## Tests

`go test ./...` runs `main_test.go`: the callback sends the secret header when it's set, and
no header when it isn't.
