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

/**
 * FEATURE_IOS_SWAP gates the wallet Swap quick action on iOS. Ships disabled.
 * Android is unaffected. Even when enabled, swap stays hidden for deep-link
 * ('mwa') wallets on iOS — that path can't sign transactions
 * (see useWalletAddress.ios.ts).
 */
export const FEATURE_IOS_SWAP = false;
