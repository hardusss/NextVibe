// This file is intentionally empty.
// Discovery deduplication lives in two places:
// - natively, per device id with a 3s debounce, while a scan session runs
// - in JS, per token/path with a 60s TTL map in hooks/useBleScanner.tsx
//   (one prompt per unique broadcast token, which rotates every 50s)
