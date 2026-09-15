// This file is intentionally empty.
// Discovery deduplication lives in two places:
// - natively, per device with a short cooldown after each read (8s after a
//   successful read, 1.5s after a failed one), so the same phone isn't
//   reconnected in a loop but can be retried almost immediately;
// - in JS, per token/path in src/proximity/promptStore.ts, where the window
//   depends on how the prompt ended (declined, failed, confirmed).
