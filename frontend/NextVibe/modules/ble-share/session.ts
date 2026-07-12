/**
 * JS-side scan session state. Mirrors native per-device dedup with URL-level
 * "once per scan session" semantics. Reset only when scanning stops.
 */
const seenUrlsInScanSession = new Set<string>();

export function resetBleScanSession(): void {
  seenUrlsInScanSession.clear();
}

/** Returns true when this URL should trigger an action during the current scan session. */
export function shouldHandleBleDiscovery(url: string): boolean {
  if (!url || seenUrlsInScanSession.has(url)) return false;
  seenUrlsInScanSession.add(url);
  return true;
}
