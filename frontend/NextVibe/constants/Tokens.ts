export const TOKEN_MINT_CONSTANTS = {
    // Circle
    USDC_MINT: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', 
};

export const TOKENS = {
    // ═══════════════════════════════════════════
    // Base Assets
    // ═══════════════════════════════════════════
    SOL: {
      symbol: "SOL",
      name: "Solana",
      logoURL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      priceKey: 'solana' as const,
      mint: null,
      decimals: 9
    },
    USDC: {
      symbol: "USDC",
      name: "USD Coin",
      logoURL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
      priceKey: 'usd-coin' as const,
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      decimals: 6
    },
    SKR: {
      symbol: "SKR",
      name: "Seeker",
      logoURL: "https://s2.coinmarketcap.com/static/img/coins/64x64/39377.png",
      priceKey: 'seeker' as const,
      mint: "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3",
      decimals: 6
    },
    USDG: {
      symbol: "USDG",
      name: "Global Dollar",
      logoURL: "https://assets.coingecko.com/coins/images/51281/standard/GDN_USDG_Token_200x200.png?1730484111",
      priceKey: 'global-dollar' as const,
      mint: "C6FQWMidLdyVBpfRot59ZEamkiafXSwyHTS3ZpGpcVGX",
      decimals: 6
    },
    JUP: {
      symbol: "JUP",
      name: "Jupiter",
      logoURL: "https://assets.coingecko.com/coins/images/34188/standard/jup.png?1704266489",
      priceKey: 'jupiter-exchange-solana' as const,
      mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
      decimals: 6
    },

    // ═══════════════════════════════════════════
    // Stablecoins
    // ═══════════════════════════════════════════
    USDT: {
      symbol: "USDT",
      name: "Tether",
      logoURL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
      priceKey: 'tether' as const,
      mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      decimals: 6
    },
    PYUSD: {
      symbol: "PYUSD",
      name: "PayPal USD",
      logoURL: "https://assets.coingecko.com/coins/images/31212/standard/PYUSD_Logo_%282%29.png",
      priceKey: 'paypal-usd' as const,
      mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZzHmZzG88mB",
      decimals: 6
    },

    // ═══════════════════════════════════════════
    // Liquid Staking Tokens (LSTs)
    // ═══════════════════════════════════════════
    JitoSOL: {
      symbol: "JitoSOL",
      name: "Jito Staked SOL",
      logoURL: "https://assets.coingecko.com/coins/images/28046/standard/JitoSOL-256.png",
      priceKey: 'jito-staked-sol' as const,
      mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
      decimals: 9
    },
    mSOL: {
      symbol: "mSOL",
      name: "Marinade SOL",
      logoURL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png",
      priceKey: 'marinade-staked-sol' as const,
      mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
      decimals: 9
    },
    bSOL: {
      symbol: "bSOL",
      name: "BlazeStake SOL",
      logoURL: "https://assets.coingecko.com/coins/images/26636/standard/blazeStakedSol.png",
      priceKey: 'blazestake-staked-sol' as const,
      mint: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piD1",
      decimals: 9
    },
    INF: {
      symbol: "INF",
      name: "Sanctum Infinity",
      logoURL: "https://assets.coingecko.com/coins/images/36987/standard/inf.png",
      priceKey: 'sanctum-infinity' as const,
      mint: "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxzbPNpVfHjC4vTGU",
      decimals: 9
    },

    // ═══════════════════════════════════════════
    // DeFi (DEX, Lending, Oracles)
    // ═══════════════════════════════════════════
    RAY: {
      symbol: "RAY",
      name: "Raydium",
      logoURL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png",
      priceKey: 'raydium' as const,
      mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
      decimals: 6
    },
    ORCA: {
      symbol: "ORCA",
      name: "Orca",
      logoURL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsjigcvaQYjM1b2gNAkZ/logo.png",
      priceKey: 'orca' as const,
      mint: "orcaEKTdK7LKz57vaAYr9QeNsjigcvaQYjM1b2gNAkZ",
      decimals: 6
    },
    PYTH: {
      symbol: "PYTH",
      name: "Pyth Network",
      logoURL: "https://assets.coingecko.com/coins/images/31924/standard/pyth.png",
      priceKey: 'pyth-network' as const,
      mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3AkTftjAQYCJT5",
      decimals: 6
    },
    JTO: {
      symbol: "JTO",
      name: "Jito",
      logoURL: "https://assets.coingecko.com/coins/images/33228/standard/jto.png",
      priceKey: 'jito-governance-token' as const,
      mint: "jtojtomepa8beP8AuQc6eY1e1QYVAn5YwR7y9pA2qA6",
      decimals: 9
    },
    KMNO: {
      symbol: "KMNO",
      name: "Kamino",
      logoURL: "https://assets.coingecko.com/coins/images/36422/standard/kamino.png",
      priceKey: 'kamino' as const,
      mint: "KMNo3nJsBXUcpJtCQANY3GqEAMyY1F4k4yUvq3G2xW6",
      decimals: 6
    },
    DRIFT: {
      symbol: "DRIFT",
      name: "Drift Protocol",
      logoURL: "https://assets.coingecko.com/coins/images/36572/standard/drift.png",
      priceKey: 'drift-protocol' as const,
      mint: "DriFtXqqWn8K7y7n2fXhK25f7HofN1BwL5GzU4z4d4B",
      decimals: 6
    },
    TNSR: {
      symbol: "TNSR",
      name: "Tensor",
      logoURL: "https://assets.coingecko.com/coins/images/36185/standard/tensor.png",
      priceKey: 'tensor' as const,
      mint: "TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddZ3eVzY",
      decimals: 9
    },

    // ═══════════════════════════════════════════
    // Infrastructure & DePIN
    // ═══════════════════════════════════════════
    HNT: {
      symbol: "HNT",
      name: "Helium",
      logoURL: "https://assets.coingecko.com/coins/images/4284/standard/Helium_HNT.png",
      priceKey: 'helium' as const,
      mint: "hntyVP6YFm1Hg25TN9WGLqM12b8CQ3kS2y2Zk71bXn9",
      decimals: 8
    },
    MOBILE: {
      symbol: "MOBILE",
      name: "Helium Mobile",
      logoURL: "https://assets.coingecko.com/coins/images/29087/standard/mobile.png",
      priceKey: 'helium-mobile' as const,
      mint: "mb1eu7TzEc71KxDpsmsKoucZTyrMEK3y6D4T8V2GgXm",
      decimals: 6
    },
    RENDER: {
      symbol: "RENDER",
      name: "Render",
      logoURL: "https://assets.coingecko.com/coins/images/11636/standard/rndr.png",
      priceKey: 'render-token' as const,
      mint: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
      decimals: 8
    },
    W: {
      symbol: "W",
      name: "Wormhole",
      logoURL: "https://assets.coingecko.com/coins/images/35087/standard/wormhole_logo.png",
      priceKey: 'wormhole' as const,
      mint: "85VBFQYC9TZkfaptCWsjyq8WwJ3x4rM4pA7bJ4A5YmZ5",
      decimals: 6
    },
    NOS: {
      symbol: "NOS",
      name: "Nosana",
      logoURL: "https://assets.coingecko.com/coins/images/22092/standard/nosana.png",
      priceKey: 'nosana' as const,
      mint: "nosXBqwBxWEQupiZA2a4rE5E7Y9Uoz7ZrtzZ9Z1N2Zp",
      decimals: 6
    },

    // ═══════════════════════════════════════════
    // Memecoins
    // ═══════════════════════════════════════════
    BONK: {
      symbol: "BONK",
      name: "Bonk",
      logoURL: "https://assets.coingecko.com/coins/images/28600/standard/bonk.jpg",
      priceKey: 'bonk' as const,
      mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      decimals: 5
    },
    WIF: {
      symbol: "WIF",
      name: "dogwifhat",
      logoURL: "https://assets.coingecko.com/coins/images/33566/standard/dogwifhat.jpg",
      priceKey: 'dogwifcoin' as const,
      mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYtM22BBG6b",
      decimals: 6
    },
    BOME: {
      symbol: "BOME",
      name: "BOOK OF MEME",
      logoURL: "https://assets.coingecko.com/coins/images/36071/standard/bome.jpg",
      priceKey: 'book-of-meme' as const,
      mint: "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82",
      decimals: 6
    },
    POPCAT: {
      symbol: "POPCAT",
      name: "Popcat",
      logoURL: "https://assets.coingecko.com/coins/images/35734/standard/popcat.jpg",
      priceKey: 'popcat' as const,
      mint: "7GCihgDB8fe6KNjn2gGZzGqA1T9B9m37Z1s2N2wK1B4N",
      decimals: 4
    },
    MEW: {
      symbol: "MEW",
      name: "cat in a dogs world",
      logoURL: "https://assets.coingecko.com/coins/images/36440/standard/mew.png",
      priceKey: 'cat-in-a-dogs-world' as const,
      mint: "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",
      decimals: 5
    },
    WEN: {
      symbol: "WEN",
      name: "Wen",
      logoURL: "https://assets.coingecko.com/coins/images/34856/standard/wen.png",
      priceKey: 'wen-4' as const,
      mint: "WENWENvqqNya429ubB5GzWwQj7C1qA32fA16Ltz1d4X",
      decimals: 5
    },
}