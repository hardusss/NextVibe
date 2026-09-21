"""
Campaign state without models: one JSONL file per campaign under
``nvcli/logs/``, one line per delivery, plus ``_index.json`` (campaign list
for the menu), ``optout.json`` (users who unsubscribed via /u/e and /u/p, or
whose address bounced) and ``_events.jsonl`` (Resend webhook events).
"""
import datetime
import fcntl
import json
import os
import re
from collections import Counter, defaultdict
from contextlib import contextmanager
from pathlib import Path

from nvcli import DEFAULT_LOGS_DIR

# Tests point this at a temp dir with mock.patch("nvcli.log.LOGS_DIR", ...).
LOGS_DIR: Path = DEFAULT_LOGS_DIR

# Statuses that count as "already reached" for idempotency.
DELIVERED = frozenset({"sent", "delivered"})
STATUSES = ("sent", "delivered", "failed", "unregistered", "test", "dry")
# Lines that aren't a real send: they never open a new wave.
NOT_A_WAVE = frozenset({"test", "dry"})
FIELDS = (
    "ts", "campaign", "wave", "user_id", "username", "channel", "variant",
    "status", "ticket", "error", "title", "body",
)

SLUG_RE = re.compile(r"[^a-z0-9-]+")


def slug(name: str) -> str:
    return SLUG_RE.sub("-", (name or "").strip().lower()).strip("-")


def _ensure() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)


def campaign_path(name: str) -> Path:
    return LOGS_DIR / f"{name}.jsonl"


def exists(name: str) -> bool:
    return campaign_path(name).exists()


def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def entry(**kw) -> dict:
    """A delivery line with every field present (None when unknown)."""
    row = {k: None for k in FIELDS}
    row["ts"] = now_iso()
    row.update(kw)
    return row


def read(name: str) -> list[dict]:
    return _read_jsonl(campaign_path(name))


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # a half-written line from an interrupted run
    return rows


def append(name: str, row: dict) -> None:
    _ensure()
    with campaign_path(name).open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")
        fh.flush()


def rewrite(name: str, rows: list[dict]) -> None:
    """Atomic replace so a crash mid-write never truncates the campaign."""
    _ensure()
    path = campaign_path(name)
    tmp = path.with_suffix(".jsonl.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    os.replace(tmp, path)


def sent_keys(name: str) -> set[tuple[int, str]]:
    """(user_id, channel) pairs already reached in this campaign."""
    return {
        (row["user_id"], row["channel"])
        for row in read(name)
        if row.get("status") in DELIVERED
    }


def sent_user_ids(name: str) -> set[int]:
    return {uid for uid, _ in sent_keys(name)}


def next_wave(name: str) -> int:
    waves = [int(r.get("wave") or 0) for r in read(name) if r.get("status") not in NOT_A_WAVE]
    return (max(waves) + 1) if waves else 1


def list_campaigns() -> list[str]:
    if not LOGS_DIR.exists():
        return []
    files = [p for p in LOGS_DIR.glob("*.jsonl") if not p.name.startswith("_")]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return [p.stem for p in files]


def deliveries_for_user(user_id: int) -> list[dict]:
    rows = []
    for name in list_campaigns():
        rows.extend(r for r in read(name) if r.get("user_id") == user_id)
    rows.sort(key=lambda r: r.get("ts") or "", reverse=True)
    return rows


def summarize(rows: list[dict]) -> dict[tuple[str, str, int], Counter]:
    """{(variant, channel, wave): Counter(status)} — for the status screen."""
    out: dict[tuple[str, str, int], Counter] = defaultdict(Counter)
    for r in rows:
        key = (r.get("variant") or "A", r.get("channel") or "?", int(r.get("wave") or 0))
        out[key][r.get("status") or "?"] += 1
    return dict(out)


def counts(rows: list[dict]) -> dict[str, int]:
    c = Counter(r.get("status") for r in rows)
    return {s: c.get(s, 0) for s in STATUSES}


# ── index ──────────────────────────────────────────────────────────────

def index_path() -> Path:
    return LOGS_DIR / "_index.json"


def read_index() -> dict:
    path = index_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def update_index(name: str, **meta) -> dict:
    """Merge metadata for a campaign and refresh its counts from the file."""
    _ensure()
    index = read_index()
    info = index.get(name, {"created": now_iso()})
    info.update({k: v for k, v in meta.items() if v is not None})
    rows = read(name)
    info["counts"] = counts(rows)
    info["waves"] = max([int(r.get("wave") or 0) for r in rows if r.get("status") not in NOT_A_WAVE] or [0])
    info["updated"] = now_iso()
    index[name] = info
    tmp = index_path().with_suffix(".json.tmp")
    tmp.write_text(json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, index_path())
    return info


def error_log_path() -> Path:
    return LOGS_DIR / "errors.log"


# ── opt-out ────────────────────────────────────────────────────────────

OPTOUT_CHANNELS = ("email", "push")


def optout_path() -> Path:
    return LOGS_DIR / "optout.json"


def read_optout() -> dict[str, set[int]]:
    data: dict = {}
    path = optout_path()
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            data = {}
    return {ch: set(int(x) for x in data.get(ch, [])) for ch in OPTOUT_CHANNELS}


def optout_ids(channel: str) -> set[int]:
    return read_optout().get(channel, set())


@contextmanager
def _optout_lock():
    """Web workers (unsubscribe links, bounce webhooks) write concurrently."""
    _ensure()
    with (LOGS_DIR / "optout.lock").open("a") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def add_optout(channel: str, user_id: int) -> bool:
    """Record an unsubscribe. Returns True when it was not there before."""
    if channel not in OPTOUT_CHANNELS:
        raise ValueError(channel)
    with _optout_lock():
        data = read_optout()
        if user_id in data[channel]:
            return False
        data[channel].add(int(user_id))
        payload = {ch: sorted(ids) for ch, ids in data.items()}
        tmp = optout_path().with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        os.replace(tmp, optout_path())
    return True


# ── Resend webhook events ──────────────────────────────────────────────

EMAIL_EVENTS = ("delivered", "opened", "clicked", "bounced", "complained")


def events_path() -> Path:
    return LOGS_DIR / "_events.jsonl"


def append_event(row: dict) -> None:
    """One line per webhook. O_APPEND + a single write keeps lines from
    concurrent web workers whole."""
    _ensure()
    data = (json.dumps(row, ensure_ascii=False) + "\n").encode("utf-8")
    fd = os.open(events_path(), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o644)
    try:
        os.write(fd, data)
    finally:
        os.close(fd)


def read_events() -> list[dict]:
    return _read_jsonl(events_path())


def find_delivery(ticket: str, campaign: str | None = None) -> dict | None:
    """The email line that got this Resend email id, looking in `campaign` first."""
    names = [campaign] if campaign and slug(campaign) == campaign and exists(campaign) else []
    names += [n for n in list_campaigns() if n not in names]
    for name in names:
        for row in read(name):
            if row.get("ticket") == ticket and row.get("channel") == "email":
                return row
    return None


def engagement(rows: list[dict], events: list[dict]) -> dict[str, Counter]:
    """
    {variant: Counter} for a campaign's emails: `sent` (real sends with a
    Resend id — tests and dry runs excluded) plus how many of those were
    delivered / opened / clicked / bounced / complained. Each email counts
    once per event, however often Resend reports it.
    """
    variant_of = {
        r["ticket"]: r.get("variant") or "A"
        for r in rows
        if r.get("channel") == "email" and r.get("ticket") and r.get("status") in DELIVERED
    }
    out: dict[str, Counter] = defaultdict(Counter)
    for variant in variant_of.values():
        out[variant]["sent"] += 1
    seen = set()
    for e in events:
        email_id = e.get("email_id")
        kind = (e.get("event") or "").removeprefix("email.")
        variant = variant_of.get(email_id)
        if variant is None or kind not in EMAIL_EVENTS or (email_id, kind) in seen:
            continue
        seen.add((email_id, kind))
        out[variant][kind] += 1
    return dict(out)


def operator_path() -> Path:
    return LOGS_DIR / "_operator.txt"


def read_operator() -> str:
    path = operator_path()
    return path.read_text(encoding="utf-8").strip() if path.exists() else ""


def save_operator(username: str) -> None:
    _ensure()
    operator_path().write_text(username.strip() + "\n", encoding="utf-8")
