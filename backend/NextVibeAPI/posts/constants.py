"""Constants for the free collect flow."""

# Maximum number of editions a post can ever have (edition 1 = owner publish).
COLLECT_MAX_EDITIONS = 50

# How many posts a user may collect per UTC day.
COLLECT_DAILY_LIMIT = 10

# Editions 2..(1 + COLLECT_IRL_RESERVED_EDITIONS) are reserved for
# IRL-connected users while the reservation window is open.
COLLECT_IRL_RESERVED_EDITIONS = 10

# Reservation window length, counted from post creation.
COLLECT_IRL_RESERVE_HOURS = 24

# Reputation awarded to the claimer when they are IRL-connected to the author.
COLLECT_IRL_REP_BONUS = 2

# How long a prepared claim (and its blockhash) stays valid.
COLLECT_CLAIM_TTL_SECONDS = 75

# Base URL of the Elysia nft-service.
NFT_SERVICE_URL = "http://localhost:3000"

# Reputation awarded to each side of an IRL (outside-of-event) tap.
IRL_TAP_POINTS = 1

# Maximum IRL taps a user can be part of per UTC day.
IRL_TAP_DAILY_LIMIT = 15

# H3 resolution stored on IRL tap reputation rows (coarse on purpose —
# event taps keep res 15, IRL taps only need neighbourhood precision).
IRL_TAP_H3_RESOLUTION = 9
