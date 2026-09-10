/**
 * Staged feature flags.
 *
 * FEATURE_CNFT_SEND gates the collectible Send flow. Ships disabled
 * ("Send — coming soon") until each wallet path (MWA / deep-link / LazorKit)
 * is tested end-to-end.
 */
export const FEATURE_CNFT_SEND = false;

/**
 * FEATURE_PROOF_OF_MEET gates the "Take a selfie together" action on the
 * tap success screen. Ships disabled until the Proof of Meet flow lands.
 */
export const FEATURE_PROOF_OF_MEET = false;
