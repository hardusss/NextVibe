/**
 * Staged feature flags.
 *
 * FEATURE_CNFT_SEND gates the collectible Send flow. Ships disabled
 * ("Send — coming soon") until each wallet path (MWA / deep-link / LazorKit)
 * is tested end-to-end.
 */
export const FEATURE_CNFT_SEND = false;
