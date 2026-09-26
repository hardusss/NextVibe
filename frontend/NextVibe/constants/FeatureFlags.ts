/**
 * Staged feature flags.
 *
 * FEATURE_CNFT_SEND gates the collectible Send flow. The button stays hidden
 * (no placeholder) until each wallet path (MWA / deep-link / LazorKit) is
 * tested end-to-end.
 */
export const FEATURE_CNFT_SEND = false;

/**
 * FEATURE_PROOF_OF_MEET gates the "Take a selfie together" action on the
 * tap success screens (Proof of Meet v2). The server also has to take photos:
 * the action stays hidden until its private storage is set up.
 */
export const FEATURE_PROOF_OF_MEET = true;

/**
 * FEATURE_IOS_SWAP gates the wallet Swap quick action on iOS. Ships disabled.
 * Android is unaffected. Even when enabled, swap stays hidden for deep-link
 * ('mwa') wallets on iOS — that path can't sign transactions
 * (see useWalletAddress.ios.ts).
 */
export const FEATURE_IOS_SWAP = false;
