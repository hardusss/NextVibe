# Smoothness manual checklist

Use on a mid-range Android device and one iPhone after changes to wallet, navigation, and feed.

## Wallet

- [ ] Open wallet dashboard — balance shimmer, then staggered sections (header → balance → actions → activity → portfolio)
- [ ] Pull-to-refresh — data stays visible; no full-screen blank flash
- [ ] Dashboard → Swap → back — modal slide; header height consistent; no second portfolio fetch (check dev log: one `[Portfolio] fetch` per wallet session)
- [ ] Swap default pair — SOL/USDC or highest balance → USDC with correct mint
- [ ] Swap flip / percent / swipe — haptic feedback on flip and quick actions
- [ ] All tokens scroll — no per-row entrance animation stutter
- [ ] Transaction history scroll — smooth; prices render correctly

## Navigation

- [ ] Tab switch (home ↔ profile) — instant, no slide
- [ ] Push deposit / select-token / transaction-detail — modal-style slide from bottom or slide from right
- [ ] Pop back — reverse animation feels natural

## Social

- [ ] Home feed scroll 30+ posts — no severe jank
- [ ] Profile grid — stable keys (no random remounts on scroll)
- [ ] Open post from profile — no layout jump

## Profile grids (Posts / cNFTs)

- [ ] Account with 30+ posts and 30+ cNFTs: switch tabs repeatedly — no growing lag, no frame drops
- [ ] Scroll a 30+ item grid to the bottom, switch tabs, switch back — scroll position/cache behavior is sane
- [ ] Pagination ("load more") still works on both tabs
- [ ] Own profile vs. another user's profile (UserProfilePage) both smooth

## Comments

- [ ] Open a post with replies, expand and hide replies repeatedly — no nested-list warning and no visual regression

## Toasts

- [ ] Web3Toast — slides in; progress bar animates without jank

## Dev

- [ ] `npx tsc --noEmit` in `frontend/NextVibe` passes
- [ ] React DevTools Profiler: Dashboard and MainPage — no excessive re-renders on balance toggle
