"""Constants for the free collect flow."""

import os

# Maximum number of editions a post can ever have (edition 1 = owner publish).
COLLECT_MAX_EDITIONS = 50

# How many posts a user may collect per UTC day.
COLLECT_DAILY_LIMIT = 10

# How many collect transactions one user may prepare per UTC day. Each one is
# already signed by the backend as fee payer, so it counts even when the
# client never calls submit.
COLLECT_DAILY_PREPARE_LIMIT = COLLECT_DAILY_LIMIT * 3

# How many of their own posts a user may publish as a cNFT per UTC day
# (the backend pays every mint).
PUBLISH_DAILY_LIMIT = 20

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
NFT_SERVICE_URL = os.environ.get("NFT_SERVICE_URL", "http://localhost:3000")

# Shared secret nft-service checks on every call (x-internal-secret).
NFT_SERVICE_SECRET = os.environ.get("NFT_SERVICE_SECRET", "")


def nft_service_headers() -> dict:
    """Headers for every call to nft-service."""
    return {"x-internal-secret": NFT_SERVICE_SECRET} if NFT_SERVICE_SECRET else {}

# Reputation awarded to each side of an IRL (outside-of-event) tap.
IRL_TAP_POINTS = 1

# Maximum IRL taps a user can be part of per UTC day.
IRL_TAP_DAILY_LIMIT = 15

# H3 resolution stored on IRL tap reputation rows (coarse on purpose —
# event taps keep res 15, IRL taps only need neighbourhood precision).
IRL_TAP_H3_RESOLUTION = 9

# Event geofence: a user counts as "at the event" when their H3 cell (at the
# event cell's resolution) is within this many rings of Post.h3_geo, i.e.
# gridDisk(h3_geo, GEOFENCE_RINGS). Check-in, networking taps, event posts and
# the organizer map (event-taps) all use it.
GEOFENCE_RINGS = 2
