import React from "react";
import { Text, TextInput, TouchableOpacity } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";

import EmailCodeStep from "../EmailCodeStep";
import ForgotPassword, { newPasswordProblem } from "../ForgotPassword";

jest.mock("@/src/utils/storage", () => ({ storage: { setItem: jest.fn(), getItem: jest.fn() } }));
jest.mock("@/src/api/emailCodes", () => {
    const actual = jest.requireActual("@/src/api/emailCodes");
    return { ...actual, requestPasswordReset: jest.fn(async () => 60), resetPasswordWithCode: jest.fn() };
});

const emailCodes = jest.requireMock("@/src/api/emailCodes");
const mounted: ReturnType<typeof create>[] = [];

afterEach(() => {
    act(() => mounted.splice(0).forEach((t) => t.unmount()));
    jest.clearAllMocks();
    jest.useRealTimers();
});

async function flush() {
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function render(element: React.ReactElement) {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(element as any); });
    mounted.push(tree);
    return tree;
}

const texts = (root: ReactTestInstance) =>
    root.findAllByType(Text as any).map((t) => [].concat(t.props.children).join("")).join("\n");

const button = (root: ReactTestInstance, label: string) =>
    root.findAllByType(TouchableOpacity as any).find((b) => texts(b).includes(label))!;

describe("EmailCodeStep", () => {
    const props = {
        email: "ana@example.com",
        title: "Confirm your email",
        submitLabel: "Confirm and sign in",
        initialResendIn: 60,
        onResend: jest.fn(async () => 60),
        onBack: jest.fn(),
    };

    it("says where the code went and counts down to a new one", () => {
        jest.useFakeTimers();
        const tree = render(<EmailCodeStep {...props} onSubmit={jest.fn()} />);
        expect(texts(tree.root)).toContain("We sent a 6-digit code to");
        expect(texts(tree.root)).toContain("ana@example.com");
        expect(texts(tree.root)).toContain("Send a new code in 60s");
        act(() => { jest.advanceTimersByTime(1000); });
        expect(texts(tree.root)).toContain("Send a new code in 59s");
    });

    it("sends the code by itself once 6 digits are in", async () => {
        const onSubmit = jest.fn(async () => {});
        const tree = render(<EmailCodeStep {...props} autoSubmit onSubmit={onSubmit} />);
        act(() => { tree.root.findByType(TextInput as any).props.onChangeText("12 34-56"); });
        await flush();
        expect(onSubmit).toHaveBeenCalledWith("123456");
    });

    it("shows the server's answer when the code is wrong and clears the field", async () => {
        const onSubmit = jest.fn(async () => {
            throw { response: { data: { code: "INVALID_CODE", error: "That code isn't right. Check the email and try again." } } };
        });
        const tree = render(<EmailCodeStep {...props} onSubmit={onSubmit} />);
        act(() => { tree.root.findByType(TextInput as any).props.onChangeText("654321"); });
        await act(async () => { button(tree.root, "Confirm and sign in").props.onPress(); });
        await flush();
        expect(texts(tree.root)).toContain("That code isn't right.");
        expect(tree.root.findByType(TextInput as any).props.value).toBe("");
    });

    it("asks for a new code once the wait is over", async () => {
        const onResend = jest.fn(async () => 60);
        const tree = render(<EmailCodeStep {...props} initialResendIn={0} onResend={onResend} onSubmit={jest.fn()} />);
        await act(async () => { button(tree.root, "Send a new code").props.onPress(); });
        await flush();
        expect(onResend).toHaveBeenCalled();
        expect(texts(tree.root)).toContain("A new code is on its way.");
    });

    it("shows why the first email didn't go out", () => {
        const tree = render(<EmailCodeStep {...props} initialError="We couldn't send the email." onSubmit={jest.fn()} />);
        expect(texts(tree.root)).toContain("We couldn't send the email.");
    });
});

describe("ForgotPassword", () => {
    it("checks the new password", () => {
        expect(newPasswordProblem("short", "")).toBe("Use at least 8 characters.");
        expect(newPasswordProblem("long enough", "long enougj")).toBe("Passwords don't match.");
        expect(newPasswordProblem("long enough", "long enough")).toBeNull();
    });

    it("sends a code, then sets the password with it and signs in", async () => {
        const session = { user_id: 7, token: { access: "a", refresh: "r" } };
        emailCodes.resetPasswordWithCode.mockResolvedValue(session);
        const onDone = jest.fn();
        const tree = render(<ForgotPassword initialEmail="ana@example.com" onDone={onDone} onBack={jest.fn()} />);

        await act(async () => { button(tree.root, "Send code").props.onPress(); });
        await flush();
        expect(emailCodes.requestPasswordReset).toHaveBeenCalledWith("ana@example.com");
        expect(texts(tree.root)).toContain("Set a new password");

        const [code, password, confirm] = tree.root.findAllByType(TextInput as any);
        act(() => {
            code.props.onChangeText("111222");
            password.props.onChangeText("NewPassword456!");
            confirm.props.onChangeText("NewPassword456!");
        });
        await act(async () => { button(tree.root, "Save password").props.onPress(); });
        await flush();
        expect(emailCodes.resetPasswordWithCode).toHaveBeenCalledWith("ana@example.com", "111222", "NewPassword456!");
        expect(onDone).toHaveBeenCalledWith(session);
    });

    it("won't send without an email", async () => {
        const tree = render(<ForgotPassword initialEmail="" onDone={jest.fn()} onBack={jest.fn()} />);
        await act(async () => { button(tree.root, "Send code").props.onPress(); });
        expect(emailCodes.requestPasswordReset).not.toHaveBeenCalled();
        expect(texts(tree.root)).toContain("Enter the email of your account.");
    });
});
