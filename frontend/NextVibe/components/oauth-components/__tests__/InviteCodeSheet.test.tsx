import React from "react";
import { Dimensions, Keyboard, Text } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import InviteCodeSheet from "../InviteCodeSheet";

// A stand-in for @gorhom/bottom-sheet: present() mounts the header and the
// body, dismiss() unmounts them and fires onDismiss, like the real modal.
jest.mock("@gorhom/bottom-sheet", () => {
    const React = require("react");
    const { View, ScrollView, TextInput } = require("react-native");
    const BottomSheetModal = React.forwardRef(function BottomSheetModal(props: any, ref: any) {
        const [shown, setShown] = React.useState(false);
        React.useImperativeHandle(ref, () => ({
            present: () => { setShown(true); props.onAnimate?.(-1, 0); },
            dismiss: () => { setShown(false); props.onDismiss?.(); },
        }));
        if (!shown) return null;
        const Header = props.handleComponent;
        return React.createElement(View, { testID: "sheet", sheetProps: props },
            React.createElement(Header), props.children);
    });
    return {
        BottomSheetModal,
        BottomSheetScrollView: (props: any) => React.createElement(ScrollView, props),
        BottomSheetTextInput: React.forwardRef(function BottomSheetTextInput(props: any, ref: any) {
            return React.createElement(TextInput, { ...props, ref });
        }),
        BottomSheetBackdrop: (props: any) => React.createElement(View, props),
    };
});
jest.mock("react-native-safe-area-context", () => ({
    useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-native-toast-message", () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock("@/hooks/useReduceMotion", () => ({ useReduceMotion: () => false }));

type Sheet = { present: () => void; dismiss: () => void };

const keyboard: Record<string, (e?: any) => void> = {};
const mounted: ReturnType<typeof create>[] = [];
beforeEach(() => {
    jest.spyOn(Keyboard, "addListener").mockImplementation(((event: string, cb: (e?: any) => void) => {
        keyboard[event] = cb;
        return { remove: jest.fn() };
    }) as any);
    jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
});
afterEach(() => {
    act(() => mounted.splice(0).forEach((t) => t.unmount()));
    jest.restoreAllMocks();
});

async function flush() {
    await act(async () => { await Promise.resolve(); });
}

function setup(onSubmit: jest.Mock) {
    const ref = React.createRef<Sheet>();
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<InviteCodeSheet ref={ref as any} onSubmit={onSubmit} /> as any); });
    mounted.push(tree!);
    act(() => ref.current!.present());
    const byId = (id: string) => tree!.root.find((n) => n.props.testID === id && typeof n.type !== "string");
    const texts = () => tree!.root.findAllByType(Text as any).map((t: ReactTestInstance) =>
        React.Children.toArray(t.props.children).join(""));
    const typeCode = (value: string) => act(() => byId("invite-code-input").props.onChangeText(value));
    return { ref, tree: tree!, byId, texts, typeCode };
}

describe("InviteCodeSheet", () => {
    it("shows production copy, with Skip in the header and under Join", () => {
        const { texts } = setup(jest.fn(async () => {}));
        const all = texts();
        expect(all).toEqual(expect.arrayContaining([
            "Have an invite code?",
            "Enter a friend's code to connect with them right away — or skip for now.",
            "Join NextVibe",
        ]));
        expect(all.filter((t) => t === "Skip")).toHaveLength(2);
        expect(all.join(" ")).not.toMatch(/beta|invite only|waitlist|early access/i);
    });

    it("keeps Join disabled until all 6 characters are in", async () => {
        const onSubmit = jest.fn(async () => {});
        const { byId, typeCode } = setup(onSubmit);
        expect(byId("invite-join").props.disabled).toBe(true);
        typeCode("ab12");
        expect(byId("invite-join").props.disabled).toBe(true);
        typeCode("AB 12 CD");
        expect(byId("invite-code-input").props.value).toBe("AB12CD");
        expect(byId("invite-join").props.disabled).toBe(false);
        await act(async () => { byId("invite-join").props.onPress(); });
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit).toHaveBeenCalledWith("AB12CD");
    });

    it.each(["invite-skip-header", "invite-skip"])("%s signs up without a code", async (id) => {
        const onSubmit = jest.fn(async () => {});
        const { byId, tree } = setup(onSubmit);
        await act(async () => { byId(id).props.onPress(); });
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit).toHaveBeenCalledWith("");
        // The sheet closed itself, and closing after a finished sign-up is not another skip
        expect(tree.root.findAll((n) => n.props.testID === "sheet")).toHaveLength(0);
        await flush();
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("treats a drag down, a backdrop tap or Android back as Skip", async () => {
        const onSubmit = jest.fn(async () => {});
        const { ref } = setup(onSubmit);
        await act(async () => { ref.current!.dismiss(); });
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(onSubmit).toHaveBeenCalledWith("");
    });

    it("shows a wrong code in the sheet and still lets the person skip", async () => {
        const onSubmit = jest.fn(async (code: string) => {
            if (code) throw { response: { data: { error: "invalid_invite_code" } } };
        });
        const { byId, typeCode, texts, ref } = setup(onSubmit);
        typeCode("ZZZZZZ");
        await act(async () => { byId("invite-join").props.onPress(); });
        expect(texts()).toContain("Invalid invite code. Check it and try again, or skip.");
        expect(byId("invite-skip-header").props.disabled).toBe(false);
        await act(async () => { ref.current!.dismiss(); });
        expect(onSubmit.mock.calls).toEqual([["ZZZZZZ"], [""]]);
    });

    it("caps the sheet at 90% of the window and at the space above the keyboard", () => {
        const { byId } = setup(jest.fn(async () => {}));
        const h = Dimensions.get("window").height;
        const max = () => byId("sheet").props.sheetProps.maxDynamicContentSize;
        expect(max()).toBe(Math.min(Math.round(h * 0.9), h - 20 - 8));
        act(() => keyboard.keyboardWillShow({ endCoordinates: { height: 300 } }));
        expect(max()).toBe(Math.min(Math.round(h * 0.9), h - 20 - 8 - 300));
        act(() => keyboard.keyboardWillHide());
        expect(max()).toBe(Math.min(Math.round(h * 0.9), h - 20 - 8));
    });
});
