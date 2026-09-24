import React from "react";
import { StyleSheet } from "react-native";
import { act, create } from "react-test-renderer";

import MeetTileDecor, { MEET_ACCENT, meetTileOther } from "../MeetTileDecor";

const alice = { user_id: 1, username: "alice", avatar: "https://media.nextvibe.io/images/alice.jpg" };
const toji = { user_id: 2, username: "toji", avatar: null };
const meetPost = { post_type: "proof_of_meet", owner: alice, co_author: toji };

function render(element: React.ReactElement) {
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(element as any); });
    return tree!;
}

describe("Proof of Meet grid tile", () => {
    it("shows the person the profile's owner met; other posts get nothing", () => {
        expect(meetTileOther(meetPost, alice.user_id)).toBe(toji);
        expect(meetTileOther(meetPost, toji.user_id)).toBe(alice);
        expect(meetTileOther({ post_type: "post" }, alice.user_id)).toBeUndefined();
        expect(meetTileOther({}, alice.user_id)).toBeUndefined();
    });

    it("the accent border, the glyph (MEET on big tiles) and the mini avatar", () => {
        const big = render(<MeetTileDecor other={toji} tileSize={124} />);
        const border = big.root.find((n) => n.props.testID === "meet-border" && typeof n.type !== "string");
        const style = StyleSheet.flatten(border.props.style);
        expect(style).toMatchObject({ borderWidth: 1.5, borderColor: MEET_ACCENT, borderRadius: 12 });
        expect(MEET_ACCENT).toBe("#8B5CF6");
        expect(JSON.stringify(big.toJSON())).toContain("MEET");
        const avatar = big.root.find((n) => n.props.testID === "meet-avatar" && typeof n.type !== "string");
        expect(avatar.props.accessibilityLabel).toBe("with @toji");
        expect(StyleSheet.flatten(avatar.props.style)).toMatchObject({ width: 22, height: 22, backgroundColor: "#0A0410" });
        expect(big.toJSON()).toMatchSnapshot("big tile");

        const small = render(<MeetTileDecor other={alice} tileSize={111} />);
        expect(JSON.stringify(small.toJSON())).not.toContain("MEET");
        expect(small.root.findAll((n) => n.props.testID === "meet-glyph" && typeof n.type !== "string")).toHaveLength(1);
    });
});
