/**
 * The connect-a-wallet sheet (components/Wallet/ConnectWalletSheet.tsx,
 * mounted once in the root layout). Claim without a wallet, the "saved
 * off-chain" banner, the check-in and tap success notes, Collect without a
 * wallet and nextvibe.io/u/wallet (reminder pushes, the email) all open it.
 * `onConnected` runs once the wallet is saved on the server, so a Collect
 * goes on in one go.
 */
import { create } from "zustand";

export type ConnectWalletReason =
    | "claim"
    | "claim_all"
    | "banner"
    | "checkin"
    | "tap"
    | "collect"
    | "link";

interface ConnectWalletState {
    reason: ConnectWalletReason | null;
    /** Bumped on every open, so opening it again presents it again. */
    openCount: number;
    onConnected: ((address: string) => void) | null;
    show: (reason: ConnectWalletReason, onConnected?: (address: string) => void) => void;
    hide: () => void;
}

export const useConnectWallet = create<ConnectWalletState>((set, get) => ({
    reason: null,
    openCount: 0,
    onConnected: null,
    show: (reason, onConnected) => set({ reason, onConnected: onConnected ?? null, openCount: get().openCount + 1 }),
    hide: () => set({ reason: null, onConnected: null }),
}));

export const openConnectWallet = (reason: ConnectWalletReason, onConnected?: (address: string) => void): void =>
    useConnectWallet.getState().show(reason, onConnected);

export const closeConnectWallet = (): void => useConnectWallet.getState().hide();
