import type { Collectible } from "@/src/api/collectibles";
import {
    applyUpdate,
    bannerSnoozed,
    BANNER_SNOOZE_MS,
    cardSubtitle,
    cardTitle,
    chainLine,
    claimLabel,
    countFor,
    FAILED_TEXT,
    isPending,
    landingText,
    NOT_ON_SOLANA,
    recordedLine,
    savedOffchainText,
    shortAddress,
    showsClaim,
    statusOf,
} from "../collectibles";

const ASSET = "8xKq9ZrYpD3fQh1LmNbVcXz2Wt5Ue6Rs7Ta8Pb9Qc3fQ";

function item(overrides: Partial<Collectible> = {}): Collectible {
    return {
        id: 7,
        kind: "meet",
        kind_label: "Proof of Meet",
        name: "Proof of Meet — @alice × @toji",
        image_url: "https://api.nextvibe.io/api/v1/meet/AbCdEfGhIjKl/card.png?v=story",
        recorded_at: "2026-09-26T12:00:00Z",
        edition: null,
        onchain: false,
        asset_id: null,
        minted_at: null,
        wallet: null,
        explorer_url: null,
        metadata_uri: "https://api.nextvibe.io/meta/meet/AbCdEfGhIjKl/2.json",
        claimed_later: false,
        event_id: null,
        post_id: null,
        meet_slug: "AbCdEfGhIjKl",
        with: { user_id: 3, username: "toji", avatar: null, deleted: false },
        ...overrides,
    };
}

describe("what a card says", () => {
    it("the same title and subtitle on-chain or not", () => {
        const offchain = item();
        const onchain = item({ onchain: true, asset_id: ASSET });
        expect(cardTitle(offchain)).toBe("with @toji");
        expect(cardTitle(onchain)).toBe(cardTitle(offchain));
        expect(cardSubtitle(offchain)).toBe("Proof of Meet · Sep 26, 2026");
        expect(cardSubtitle(onchain)).toBe(cardSubtitle(offchain));
        const poap = item({ kind: "poap", kind_label: "POAP", name: "Superteam Ukraine Kyiv #12", with: null });
        expect(cardTitle(poap)).toBe("Superteam Ukraine Kyiv #12");
        expect(cardSubtitle(poap)).toBe("POAP · Sep 26, 2026");
        expect(cardSubtitle(item({ kind: "external", kind_label: "In your wallet", collection: "Mad Lads", recorded_at: null })))
            .toBe("Mad Lads");
    });

    it("the chain line and the recorded line", () => {
        expect(chainLine({ onchain: true, asset_id: ASSET })).toBe("On Solana · 8xK…3fQ");
        expect(chainLine({ onchain: false, asset_id: null })).toBe(NOT_ON_SOLANA);
        expect(NOT_ON_SOLANA).toBe("Not on Solana yet");
        expect(recordedLine(item())).toBe("Recorded on NextVibe · Sep 26, 2026");
        expect(shortAddress(ASSET)).toBe("8xK…3fQ");
        expect(shortAddress(null)).toBe("");
    });

    it("the owner's Claim button: Claim, Minting…, Try again; never on someone else's card", () => {
        const mine = item({ status: "offchain", can_claim: true, error: null });
        expect(showsClaim(mine)).toBe(true);
        expect(claimLabel(mine)).toBe("Claim");
        expect(claimLabel({ ...mine, status: "queued" })).toBe("Minting…");
        expect(claimLabel({ ...mine, status: "minting" })).toBe("Minting…");
        expect(claimLabel({ ...mine, status: "failed" })).toBe("Try again");
        expect(showsClaim(item())).toBe(false); // someone else's: no status, no can_claim
        expect(statusOf(item())).toBe("offchain");
        expect(statusOf(item({ onchain: true }))).toBe("minted");
        expect(isPending({ onchain: false, status: "queued" })).toBe(true);
        expect(isPending(item())).toBe(false);
    });
});

describe("live updates", () => {
    it("a card lands in place: on Solana, its asset id, no more Claim", () => {
        const mine = item({ status: "queued", can_claim: false, error: null });
        const landed = applyUpdate(mine, { status: "minted", asset_id: ASSET });
        expect(landed).toMatchObject({ onchain: true, status: "minted", can_claim: false, asset_id: ASSET,
            explorer_url: `https://solscan.io/token/${ASSET}` });
        expect(mine.onchain).toBe(false); // not mutated
    });

    it("a failed one gets its Try again back", () => {
        const failed = applyUpdate(item({ status: "minting", can_claim: false, error: null }), { status: "failed" });
        expect(failed).toMatchObject({ status: "failed", can_claim: true, error: FAILED_TEXT, onchain: false });
    });

    it("someone else's card only learns it's on Solana", () => {
        const theirs = applyUpdate(item(), { status: "minted", asset_id: ASSET });
        expect(theirs.status).toBeUndefined();
        expect(theirs.can_claim).toBeUndefined();
        expect(theirs.onchain).toBe(true);
        expect(applyUpdate(item(), undefined)).toEqual(item());
    });
});

describe("counts and banners", () => {
    it("counts per filter", () => {
        const counts = { all: 5, poap: 1, meet: 3, post: 1, badge: 0 };
        expect(countFor(counts, "all")).toBe(5);
        expect(countFor(counts, "meet")).toBe(3);
        expect(countFor(undefined, "all")).toBeNull();
    });

    it("the saved off-chain banner and its 7-day snooze", () => {
        expect(savedOffchainText(3)).toBe("3 collectibles saved off-chain");
        expect(savedOffchainText(1)).toBe("1 collectible saved off-chain");
        const now = 1_700_000_000_000;
        expect(bannerSnoozed(null, now)).toBe(false);
        expect(bannerSnoozed(now - BANNER_SNOOZE_MS + 1000, now)).toBe(true);
        expect(bannerSnoozed(now - BANNER_SNOOZE_MS - 1000, now)).toBe(false);
    });

    it("the connect progress line", () => {
        expect(landingText(7, 0)).toBe("Putting 7 collectibles on Solana…");
        expect(landingText(7, 3)).toBe("Putting 7 collectibles on Solana…");
        expect(landingText(7, 7)).toBe("7 collectibles are on Solana");
        expect(landingText(1, 0)).toBe("Putting 1 collectible on Solana…");
        expect(landingText(1, 1)).toBe("Your collectible is on Solana");
    });

    it("no forbidden words in what the cards and banners say", () => {
        const copy = [
            savedOffchainText(2), landingText(2, 1), NOT_ON_SOLANA, FAILED_TEXT, recordedLine(item()),
            claimLabel(item({ status: "failed" })), claimLabel(item({ status: "offchain" })),
        ].join(" ");
        expect(copy).not.toMatch(/\b(reward|earn|farm|points)\w*|\bSKR\b/i);
    });
});
