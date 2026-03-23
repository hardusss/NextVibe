/**
 * Portfolio token shape returned by usePortfolio.
 */
export interface PortfolioToken {
    symbol: string;
    name: string;
    logoURI?: string;
    amount: number;
    valueUsd: number;
}

/**
 * Theme color tokens consumed by all swap sub-components.
 */
export interface SwapColors {
    text: string;
    muted: string;
    accent: string;
    chip: string;
    chipBorder: string;
    cardBorder: string;
    modalBg: string;
    isDark: boolean;
}