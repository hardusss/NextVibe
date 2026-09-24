/**
 * Wallet-optional collectibles, the pure part: what a card says in each
 * state. On-chain and off-chain items use the same card; only the chip,
 * the Claim button and the chain section differ (components/Collectibles).
 */
import type {
    Collectible,
    CollectibleCounts,
    CollectibleFilter,
    CollectibleStatus,
} from "@/src/api/collectibles";

export const FILTERS: { key: CollectibleFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "poap", label: "POAPs" },
    { key: "meet", label: "Proof of Meet" },
    { key: "post", label: "Collected" },
];

export const NOT_ON_SOLANA = "Not on Solana yet";
export const EMPTY_TAB_TEXT = "Check in at an event or tap phones with someone. Everything you collect shows up here.";
export const SAVED_NOTE = "Saved to your profile. Connect a wallet anytime to put it on Solana.";
export const FAILED_TEXT = "Couldn't put this on Solana";

/** How long the "saved off-chain" banner stays away once dismissed. */
export const BANNER_SNOOZE_MS = 7 * 24 * 3600 * 1000;

/** A socket or Claim update for one card (the server's truth wins on the next fetch). */
export interface CollectibleUpdate {
    status?: CollectibleStatus;
    asset_id?: string | null;
}

export function statusOf(item: Pick<Collectible, "onchain" | "status">): CollectibleStatus {
    if (item.status) return item.status;
    return item.onchain ? "minted" : "offchain";
}

export function isPending(item: Pick<Collectible, "onchain" | "status">): boolean {
    const status = statusOf(item);
    return status === "queued" || status === "minting";
}

/** The owner's Claim button shows on off-chain and failed items (never someone else's). */
export function showsClaim(item: Pick<Collectible, "can_claim">): boolean {
    return item.can_claim === true;
}

export function claimLabel(item: Pick<Collectible, "onchain" | "status">): string {
    const status = statusOf(item);
    if (status === "failed") return "Try again";
    if (status === "queued" || status === "minting") return "Minting…";
    return "Claim";
}

/** "8xK…3fQ", like the cards the server draws. */
export function shortAddress(address: string | null | undefined): string {
    if (!address) return "";
    return address.length > 8 ? `${address.slice(0, 3)}…${address.slice(-3)}` : address;
}

/** Under a Proof of Meet post, and in the detail sheet's header. */
export function chainLine(item: { onchain: boolean; asset_id?: string | null }): string {
    if (item.onchain && item.asset_id) return `On Solana · ${shortAddress(item.asset_id)}`;
    return NOT_ON_SOLANA;
}

export function formatDate(iso: string | null | undefined): string {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** "Recorded on NextVibe · Sep 26, 2026": the chain section of an item not on Solana yet. */
export function recordedLine(item: Pick<Collectible, "recorded_at">): string {
    const date = formatDate(item.recorded_at);
    return date ? `Recorded on NextVibe · ${date}` : "Recorded on NextVibe";
}

/** The card's small line: the kind and the date ("POAP · Sep 26, 2026"). */
export function cardSubtitle(item: Pick<Collectible, "kind" | "kind_label" | "collection" | "recorded_at">): string {
    const kind = item.kind === "external" ? item.collection || item.kind_label : item.kind_label;
    const date = formatDate(item.recorded_at);
    return date ? `${kind} · ${date}` : kind;
}

/** The card's title: a meet reads "with @toji", everything else its own name. */
export function cardTitle(item: Pick<Collectible, "kind" | "name" | "with" | "edition">): string {
    if (item.kind === "meet" && item.with?.username) return `with @${item.with.username}`;
    return item.name;
}

export function applyUpdate<T extends Collectible>(item: T, update: CollectibleUpdate | undefined): T {
    if (!update) return item;
    const next: T = { ...item };
    if (update.status) {
        // Someone else's card has no status, only "on Solana or not"
        if (item.status !== undefined) next.status = update.status;
        next.onchain = update.status === "minted";
        if (item.can_claim !== undefined) next.can_claim = update.status === "offchain" || update.status === "failed";
        if (item.error !== undefined) next.error = update.status === "failed" ? FAILED_TEXT : null;
    }
    if (update.asset_id) {
        next.asset_id = update.asset_id;
        next.explorer_url = `https://solscan.io/token/${update.asset_id}`;
    }
    return next;
}

export function countFor(counts: CollectibleCounts | undefined, filter: CollectibleFilter): number | null {
    if (!counts) return null;
    return filter === "all" ? counts.all : counts[filter];
}

export function savedOffchainText(count: number): string {
    return `${count} ${count === 1 ? "collectible" : "collectibles"} saved off-chain`;
}

/** The connect success line: "Putting 7 collectibles on Solana…" → "7 collectibles are on Solana". */
export function landingText(total: number, landed: number): string {
    const noun = total === 1 ? "collectible" : "collectibles";
    if (landed >= total) return total === 1 ? "Your collectible is on Solana" : `${total} collectibles are on Solana`;
    return `Putting ${total} ${noun} on Solana…`;
}

export function bannerSnoozed(dismissedAt: number | null | undefined, now: number): boolean {
    return !!dismissedAt && now - dismissedAt < BANNER_SNOOZE_MS;
}
