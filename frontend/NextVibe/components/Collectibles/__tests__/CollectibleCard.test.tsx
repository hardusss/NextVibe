import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import CollectibleCard from "../CollectibleCard";
import CollectibleChainSection from "../CollectibleChainSection";
import type { Collectible } from "@/src/api/collectibles";

const ASSET = "8xKq9ZrYpD3fQh1LmNbVcXz2Wt5Ue6Rs7Ta8Pb9Qc3fQ";

function item(overrides: Partial<Collectible> = {}): Collectible {
    return {
        id: 7,
        kind: "poap",
        kind_label: "POAP",
        name: "Superteam Ukraine Kyiv #12",
        image_url: "https://media.nextvibe.io/posts_media/kyiv.jpg",
        recorded_at: "2026-09-26T12:00:00Z",
        edition: 12,
        onchain: false,
        asset_id: null,
        minted_at: null,
        wallet: null,
        explorer_url: null,
        metadata_uri: "https://api.nextvibe.io/api/v1/posts/5/metadata/12/",
        claimed_later: false,
        event_id: 5,
        post_id: null,
        meet_slug: null,
        with: null,
        ...overrides,
    };
}

const onchainFields = {
    onchain: true, asset_id: ASSET, minted_at: "2026-09-27T09:00:00Z", wallet: "3x9az88Dkbxa6tkKByxqEn7jBTJCJCD4dVvou49L24ET",
    explorer_url: `https://solscan.io/token/${ASSET}`,
};

function render(element: React.ReactElement) {
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(element as any); });
    return tree!;
}

function texts(root: ReactTestInstance): string[] {
    return root.findAll((n) => (n.type as unknown) === "Text")
        .flatMap((n) => n.children.filter((c): c is string => typeof c === "string"));
}

/** Host views with this testID (what ends up on screen) */
function byTestId(root: ReactTestInstance, id: string) {
    return root.findAll((n) => n.props.testID === id && typeof n.type === "string");
}

/** The pressable itself (it holds onPress) */
function pressable(root: ReactTestInstance, id: string) {
    return root.find((n) => n.props.testID === id && typeof n.props.onPress === "function");
}

describe("CollectibleCard: the same card on-chain or not", () => {
    it("renders the same component for both states; off-chain adds only the chip", () => {
        const offchain = render(<CollectibleCard item={item()} width={170} onPress={jest.fn()} />);
        const onchain = render(<CollectibleCard item={item(onchainFields)} width={170} onPress={jest.fn()} />);
        expect(offchain.toJSON()).toMatchSnapshot("off-chain");
        expect(onchain.toJSON()).toMatchSnapshot("on-chain");

        // Same image, name, kind and date
        for (const tree of [offchain, onchain]) {
            expect(texts(tree.root)).toEqual(expect.arrayContaining(["Superteam Ukraine Kyiv #12", "POAP · Sep 26, 2026"]));
        }
        expect(byTestId(offchain.root, "not-on-solana-chip")).toHaveLength(1);
        expect(texts(offchain.root)).toContain("Not on Solana yet");
        expect(byTestId(onchain.root, "not-on-solana-chip")).toHaveLength(0);

        // Take the chip away and the two trees are the same card
        const strip = (json: any): any => {
            if (!json || typeof json !== "object") return json;
            if (Array.isArray(json)) return json.map(strip).filter(Boolean);
            if (json.props?.testID === "not-on-solana-chip") return null;
            const { accessibilityLabel, ...props } = json.props ?? {};
            return { ...json, props, children: json.children ? strip(json.children) : json.children };
        };
        expect(JSON.stringify(strip(offchain.toJSON()))).toEqual(JSON.stringify(strip(onchain.toJSON())));
    });

    it("the owner's Claim button; nothing for someone else's", () => {
        const onClaim = jest.fn();
        const mine = item({ status: "offchain", can_claim: true, error: null });
        const owner = render(<CollectibleCard item={mine} width={170} onPress={jest.fn()} onClaim={onClaim} />);
        expect(byTestId(owner.root, "claim-button")).toHaveLength(1);
        expect(texts(owner.root)).toContain("Claim");
        act(() => { pressable(owner.root, "claim-button").props.onPress(); });
        expect(onClaim).toHaveBeenCalledWith(mine);

        const visitor = render(<CollectibleCard item={item()} width={170} onPress={jest.fn()} />);
        expect(byTestId(visitor.root, "claim-button")).toHaveLength(0);

        const minted = render(<CollectibleCard item={item({ ...onchainFields, status: "minted", can_claim: false })}
            width={170} onPress={jest.fn()} onClaim={onClaim} />);
        expect(byTestId(minted.root, "claim-button")).toHaveLength(0);
    });

    it("Minting… while it goes, Try again after it failed", () => {
        const pending = render(<CollectibleCard item={item({ status: "minting", can_claim: false })}
            width={170} onPress={jest.fn()} onClaim={jest.fn()} />);
        expect(texts(pending.root)).toContain("Minting…");
        const failed = render(<CollectibleCard item={item({ status: "failed", can_claim: true, error: "Couldn't put this on Solana" })}
            width={170} onPress={jest.fn()} onClaim={jest.fn()} />);
        expect(texts(failed.root)).toEqual(expect.arrayContaining(["Couldn't put this on Solana", "Try again"]));
    });
});

describe("the detail sheet's chain section", () => {
    it("off-chain: recorded on NextVibe and Claim, no chain fields at all", () => {
        const tree = render(<CollectibleChainSection item={item({ status: "offchain", can_claim: true })} onClaim={jest.fn()} />);
        const shown = texts(tree.root);
        expect(shown).toEqual(expect.arrayContaining(["Recorded on NextVibe · Sep 26, 2026", "Claim to put this on Solana", "Claim"]));
        for (const field of ["Asset ID", "Minted", "Owner wallet", "View on Solana", "N/A"]) {
            expect(shown).not.toContain(field);
        }
        expect(JSON.stringify(tree.toJSON())).not.toMatch(/solscan|8xK/);
    });

    it("someone else's off-chain item: no Claim", () => {
        const tree = render(<CollectibleChainSection item={item()} />);
        expect(texts(tree.root)).toEqual(["Recorded on NextVibe · Sep 26, 2026", "Not on Solana yet"]);
    });

    it("on-chain: the asset id, the mint date, the owner's wallet and View on Solana", () => {
        const tree = render(<CollectibleChainSection item={item({ ...onchainFields, claimed_later: true })} />);
        expect(texts(tree.root)).toEqual(expect.arrayContaining([
            "Asset ID", "8xK…3fQ", "Minted", "Owner wallet", "3x9…4ET", "View on Solana",
        ]));
        expect(JSON.stringify(tree.toJSON())).toContain("claimed later");
        expect(texts(tree.root)).not.toContain("Recorded on NextVibe · Sep 26, 2026");
    });
});
