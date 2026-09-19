"""
Main loop and every screen of ``python manage.py nv``.

Every action returns to the menu; Ctrl-C anywhere goes back to the menu
(questionary's ``unsafe_ask`` raises KeyboardInterrupt, the loop catches
it). Any other exception becomes one red line + a traceback in
``logs/errors.log``.
"""
import datetime
import random
import signal
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field

import questionary
from django.conf import settings
from questionary import Choice
from rich.panel import Panel
from rich.progress import BarColumn, MofNCompleteColumn, Progress, SpinnerColumn, TextColumn, TimeElapsedColumn
from rich.syntax import Syntax
from rich.table import Table
from rich.text import Text

from nvcli import audience, log, receipts, render, send_email, send_push
from nvcli.console import (
    clear, console, env_badge, err, fmt_dt, fmt_month, log_exception, ok, panel, short_wallet, warn, yes_no,
)
from nvcli.render import Template, UnresolvedPlaceholder
from user.views_pac.optout import make_token

DIRECT_CAMPAIGN = "direct"
CONFIRM_TYPED_ABOVE = 50
PREVIEW_ROWS = 15
SAMPLE_PANELS = 3


# ── prompt helpers ─────────────────────────────────────────────────────

def select(message, choices, **kw):
    return questionary.select(message, choices=choices, pointer="❯", qmark="", **kw).unsafe_ask()


def confirm(message, default=False):
    return questionary.confirm(message, default=default, qmark="").unsafe_ask()


def text(message, default="", **kw):
    return questionary.text(message, default=default, qmark="", **kw).unsafe_ask()


def pause(message="Press Enter to return"):
    console.print()
    questionary.press_any_key_to_continue(f"{message} ").unsafe_ask()


def echo(label, value):
    console.print(f"  [muted]{label:<10}[/] {value}")


def ask_username(message="Username", usernames=None):
    usernames = usernames if usernames is not None else audience.load_usernames()
    while True:
        name = questionary.autocomplete(
            message, choices=usernames, match_middle=True, ignore_case=True, qmark="",
            validate=lambda v: bool(v.strip()) or "type a username",
        ).unsafe_ask()
        user = audience.find_user(name)
        if user:
            return user
        err(f"no user named @{name.strip().lstrip('@')}", "pick one from the autocomplete list")


def ask_operator():
    current = log.read_operator()
    console.print("[muted]Who are you? The test send goes to this account.[/]")
    usernames = audience.load_usernames()
    default = current if current in usernames else ""
    while True:
        name = questionary.autocomplete(
            "Your username", choices=usernames, default=default, match_middle=True, ignore_case=True, qmark="",
        ).unsafe_ask()
        user = audience.find_user(name)
        if user:
            log.save_operator(user.username)
            return user
        err(f"no user named @{name}")


def channel_choices(user=None):
    """push / email / both; with a user, channels they lack are greyed out."""
    choices = []
    for ch in ("push", "email", "both"):
        disabled = None
        if user is not None:
            if ch == "push" and not audience.has_push(user):
                disabled = "no push token"
            elif ch == "email" and not audience.has_email(user):
                disabled = "no email on file"
            elif ch == "both" and not (audience.has_push(user) and audience.has_email(user)):
                disabled = "needs both a token and an email"
        choices.append(Choice(ch, value=ch, disabled=disabled))
    return choices


# ── header + overview ──────────────────────────────────────────────────

def header():
    total = audience.base_queryset().count()
    body = Text.assemble(("NextVibe Console", "title"), " · ", env_badge(), " · ", (f"{total} users", "muted"))
    return panel(body, style="err" if env_badge().plain.strip() == "PROD" else "accent")


def audience_overview():
    o = audience.overview()
    t = Table(title="Audience", show_header=True, header_style="accent", title_justify="left")
    t.add_column("Segment")
    t.add_column("Users", justify="right")

    def row(label, key, style=None):
        t.add_row(label if not style else f"[{style}]{label}[/]", f"[{style or 'white'}]{o[key]:,}[/]")

    row("Total (active, not banned)", "total")
    row("Push token", "push")
    row("Email", "email")
    row("Push + email", "both")
    row("Push only", "push_only")
    row("Email only", "email_only")
    row("Unreachable", "unreachable", "muted")
    row("Seeker Verified", "seeker")
    share = (o["seeker"] / o["total"] * 100) if o["total"] else 0
    t.add_row(f"[muted]  {share:.0f}% of users[/]", "")
    row("Seeker with push", "seeker_push")
    row("Active 30d (last login)", "active_30d")
    t.add_row("[muted]Excluded: banned / inactive[/]", f"[muted]{o['excluded']:,}[/]")
    t.add_row("[muted]Opted out: push / email[/]", f"[muted]{o['optout_push']:,} / {o['optout_email']:,}[/]")
    console.print(t)
    pause()


# ── user card ──────────────────────────────────────────────────────────

def badges(user):
    out = []
    if user.official:
        out.append("[bold cyan]official[/]")
    if user.seeker_verified:
        out.append(f"[accent]seeker[/] [muted]({user.seeker_verified_source or 'onchain'})[/]")
    return "  ".join(out) if out else "[muted]no badges[/]"


def user_card(user):
    s = audience.user_stats(user)
    lines = [
        f"[title]@{user.username}[/]  {badges(user)}",
        f"[muted]joined[/] {fmt_month(s['joined'])}   [muted]wallet[/] {short_wallet(s['wallet'])}   [muted]last login[/] {fmt_dt(s['last_login'])}",
        f"[muted]rep[/] {s['rep']}   [muted]events[/] {s['events']}   [muted]met[/] {s['met']}",
        f"[muted]push[/] {yes_no(s['push'])}   [muted]email[/] {yes_no(s['email'])}"
        + (f" [muted]{user.email}[/]" if s["email"] else ""),
    ]
    return panel("\n".join(lines), title=f"user {user.user_id}")


def deliveries_table(user):
    rows = log.deliveries_for_user(user.user_id)
    if not rows:
        console.print("[muted]no deliveries logged for this user[/]")
        return
    t = Table(title="Past deliveries", header_style="accent", title_justify="left")
    for col in ("when", "campaign", "wave", "channel", "variant", "status", "title"):
        t.add_column(col)
    for r in rows[:20]:
        status = r.get("status") or "?"
        style = {"sent": "ok", "delivered": "ok", "failed": "err", "unregistered": "muted", "test": "warn"}.get(status, "white")
        t.add_row((r.get("ts") or "")[:16].replace("T", " "), r.get("campaign") or "", str(r.get("wave") or ""),
                  r.get("channel") or "", r.get("variant") or "", f"[{style}]{status}[/]", (r.get("title") or "")[:40])
    console.print(t)


def find_user():
    user = ask_username()
    console.print(user_card(user))
    deliveries_table(user)
    action = select("", [
        Choice("Send push to this user", "push", disabled=None if audience.has_push(user) else "no push token"),
        Choice("Send email to this user", "email", disabled=None if audience.has_email(user) else "no email on file"),
        Choice("Back", None),
    ])
    if action:
        send_to_one_user(user=user, channel=action)


# ── message selection ──────────────────────────────────────────────────

def templates_for(channel):
    return [t for t in render.load_templates().values() if channel == "both" or t.channel in (channel, "both")]


def write_message(channel) -> Template:
    title = text("Title", validate=lambda v: bool(v.strip()) or "a title is needed").strip()
    body = questionary.text(
        "Body", multiline=True, qmark="", instruction="(Esc then Enter to finish)",
        validate=lambda v: bool(v.strip()) or "a body is needed",
    ).unsafe_ask().strip()
    default_link = "https://nextvibe.io" if channel == "email" else "nextvibe://profile"
    deeplink = text("Deep link (empty for none)", default=default_link).strip() or None
    data = {}
    if channel != "email":
        kind = text("data.type (optional)", default="announcement").strip()
        if kind:
            data["type"] = kind
    t = Template(name="adhoc", channel=channel, title=title, body=body, deeplink=deeplink, data=data)
    bad = render.wording_violations(f"{title}\n{body}")
    if bad:
        warn(f"wording guard: {', '.join(sorted(set(bad)))} — these words never go in user-facing copy")
    return t


def choose_message(channel, label="Message") -> Template:
    choices = [Choice(f"{t.name}  [{t.channel}]  {t.title[:48]}", value=t) for t in templates_for(channel)]
    choices.append(Choice("Write it now", value="write"))
    picked = select(label, choices)
    template = write_message(channel) if picked == "write" else picked
    extra = template.extra_placeholders()
    if extra:
        console.print(f"  [muted]placeholders[/] " + "  ".join("{%s}" % p for p in sorted(template.placeholders())))
    return template


def collect_extra(templates, prefill=None) -> dict:
    """Prompt for every non-user placeholder used by the chosen templates."""
    names = set()
    for t in templates:
        names |= t.extra_placeholders()
    extra = {}
    for name in sorted(names):
        extra[name] = text(f"Value for {{{name}}}", default=str((prefill or {}).get(name, "")),
                           validate=lambda v: bool(v.strip()) or "needed").strip()
    return extra


def preview_panel(rendered, user, channel, variant=None):
    title = f"Sample — @{user.username}" + (f" · variant {variant}" if variant else "")
    lines = [f"[title]{rendered.title}[/]", rendered.body]
    if rendered.deeplink:
        internal, external = render.app_path(rendered.deeplink)
        lines.append(f"[muted]→ {rendered.deeplink}[/]" + (f"  [muted]({'app' if internal else 'external'})[/]"))
    if channel != "email" and rendered.data:
        lines.append("[muted]data " + " ".join(f"{k}={v}" for k, v in rendered.data.items()) + "[/]")
    if channel == "email":
        lines.append("[muted]HTML + plain text, unsubscribe link in the footer[/]")
    return panel("\n".join(lines), title=title, style="muted")


def unsubscribe_url(user) -> str:
    return f"{settings.PUBLIC_API_URL.rstrip('/')}/u/e/{make_token(user.user_id)}"


def deliver_push(user, rendered, campaign, variant, wave):
    return send_push.send_one(user.expo_push_token, rendered, campaign=campaign, variant=variant, wave=wave)


def deliver_email(user, rendered):
    url = unsubscribe_url(user)
    html = render.email_html(rendered, url)
    return send_email.send_email(user.email, rendered.title, render.email_text(rendered, url), html, unsubscribe_url=url)


def log_result(campaign, wave, user, channel, variant, rendered, status, ticket=None, error=None):
    log.append(campaign, log.entry(
        campaign=campaign, wave=wave, user_id=user.user_id, username=user.username, channel=channel,
        variant=variant, status=status, ticket=ticket, error=error, title=rendered.title, body=rendered.body,
    ))


# ── send to one user ───────────────────────────────────────────────────

def send_to_one_user(user=None, channel=None):
    if user is None:
        user = ask_username()
        console.print(user_card(user))
    if channel is None:
        channel = select("Channel", channel_choices(user))
    template = choose_message(channel)
    extra = collect_extra([template])
    ctx = {**render.user_context(user), **extra}
    try:
        rendered = render.render(template, ctx)
    except UnresolvedPlaceholder as e:
        err(str(e), "add the placeholder value or edit the template")
        pause()
        return
    console.print(preview_panel(rendered, user, channel))
    if not confirm(f"Send to @{user.username} via {channel}?"):
        console.print("[muted]not sent[/]")
        pause()
        return
    for ch in audience.channels_for(user, channel):
        if ch == "push":
            r = deliver_push(user, rendered, DIRECT_CAMPAIGN, "A", 1)
            status, ticket, error = r.status, r.ticket, r.error
            if status == "unregistered":
                receipts.clear_tokens([user.user_id])
        else:
            r = deliver_email(user, rendered)
            status, ticket, error = r.status, r.message_id, r.error
        log_result(DIRECT_CAMPAIGN, 1, user, ch, "A", rendered, status, ticket, error)
        if status == "sent":
            ok(f"{ch} sent · {ticket or 'no id'}")
        else:
            err(f"{ch} {status}: {error}")
    log.update_index(DIRECT_CAMPAIGN, channel="mixed", segments="one-off sends")
    pause()


# ── campaign wizard ────────────────────────────────────────────────────

@dataclass
class Delivery:
    user: object
    channel: str
    variant: str
    rendered: render.Rendered


@dataclass
class Plan:
    name: str
    wave: int
    channel: str
    include: list
    exclude: list
    variants: dict            # {"A": Template, "B": Template}
    split_a: float
    share_label: str
    deliveries: list = field(default_factory=list)
    per_minute: float = send_email.DEFAULT_PER_MINUTE

    def describe_segments(self):
        s = " AND ".join(self.include)
        if self.exclude:
            s += "  minus  " + " OR ".join(self.exclude)
        return s


def ask_campaign_name():
    today = datetime.date.today().strftime("%b%d").lower()
    while True:
        raw = text("Campaign name", default=f"{today}-", validate=lambda v: bool(log.slug(v)) or "letters, digits and dashes")
        name = log.slug(raw)
        if name == DIRECT_CAMPAIGN:
            err(f"'{DIRECT_CAMPAIGN}' is reserved for one-off sends")
            continue
        if not log.exists(name):
            return name, 1
        wave = log.next_wave(name)
        c = log.counts(log.read(name))
        console.print(f"  [muted]{name}: {c['sent'] + c['delivered']} sent, {c['failed']} failed, {c['unregistered']} unregistered, waves so far {wave - 1}[/]")
        choice = select("This campaign exists", [
            Choice(f"Continue existing campaign (wave {wave})", "continue"),
            Choice("New name", "new"),
        ])
        if choice == "continue":
            return name, wave


def ask_segments(message, allow_empty=False):
    choices = [Choice(f"{name:<13} {desc}", value=name) for name, (desc, _) in audience.SEGMENTS.items()]
    choices += [
        Choice(f"{'event:<id>':<13} {audience.PARAM_SEGMENTS['event']}", value="event"),
        Choice(f"{'sent-in:<c>':<13} {audience.PARAM_SEGMENTS['sent-in']}", value="sent-in"),
        Choice(f"{'from file':<13} {audience.PARAM_SEGMENTS['file']}", value="file"),
    ]
    validate = (lambda v: True) if allow_empty else (lambda v: len(v) > 0 or "pick at least one")
    picked = questionary.checkbox(message, choices=choices, qmark="", pointer="❯", validate=validate).unsafe_ask()
    specs = []
    for p in picked:
        if p == "event":
            from posts.models import Post

            while True:
                pid = text("Event post id", validate=lambda v: v.strip().isdigit() or "a number")
                post = Post.all_objects.filter(id=int(pid)).first()
                if post:
                    console.print(f"  [muted]event {pid}: {(post.about or '')[:60]}[/]")
                    specs.append(f"event:{int(pid)}")
                    break
                err(f"no post with id {pid}")
        elif p == "sent-in":
            names = [n for n in log.list_campaigns() if n != DIRECT_CAMPAIGN]
            if not names:
                warn("no campaign logs yet; skipping sent-in")
                continue
            specs.append("sent-in:" + select("Campaign", [Choice(n, n) for n in names]))
        elif p == "file":
            path = questionary.path("File with usernames (one per line)", qmark="").unsafe_ask()
            try:
                n = len(audience.usernames_from_file(path))
            except OSError as e:
                err(f"can't read {path}: {e}")
                continue
            console.print(f"  [muted]{n} usernames in {path}[/]")
            specs.append(f"file:{path}")
        else:
            specs.append(p)
    return specs


def event_prefill(include):
    from posts.models import Post

    for spec in include:
        if spec.startswith("event:"):
            post = Post.all_objects.filter(id=int(spec.split(":", 1)[1])).first()
            if post:
                start = post.luma_event_start_time
                return {
                    "event": (post.about or "").strip().splitlines()[0][:60] if post.about else "",
                    "date": start.strftime("%a %b %d, %H:%M") if start else "",
                    "id": str(post.id),
                }
    return {}


def ask_share(total):
    choice = select(f"Send to what share of this audience? ({total} users)", [
        Choice("10%", 0.10), Choice("25%", 0.25), Choice("50%", 0.50), Choice("all", 1.0), Choice("custom N", "n"),
    ])
    if choice == "n":
        n = int(text("How many users?", validate=lambda v: v.strip().isdigit() or "a number"))
        return ("n", n, f"{n} users")
    return ("share", choice, "all" if choice == 1.0 else f"{int(choice * 100)}%")


def build_deliveries(plan, users, already_sent):
    seeker_total = audience.seeker_total()
    deliveries = []
    for user in users:
        variant = audience.variant_for(plan.name, user.user_id, plan.split_a) if "B" in plan.variants else "A"
        channels = [ch for ch in audience.channels_for(user, plan.channel) if (user.user_id, ch) not in already_sent]
        if not channels:
            continue
        ctx = {**render.user_context(user, seeker_total), **plan.extra}
        rendered = render.render(plan.variants[variant], ctx)
        for ch in channels:
            deliveries.append(Delivery(user, ch, variant, rendered))
    return deliveries


def audience_table(deliveries):
    by_user = {}
    for d in deliveries:
        by_user.setdefault(d.user.user_id, {"user": d.user, "variant": d.variant, "channels": set()})["channels"].add(d.channel)
    t = Table(title=f"Audience — {len(by_user)} users, {len(deliveries)} deliveries", header_style="accent", title_justify="left")
    for col, just in (("username", "left"), ("seeker", "center"), ("push", "center"), ("email", "center"), ("variant", "center")):
        t.add_column(col, justify=just)
    rows = list(by_user.values())
    for row in rows[:PREVIEW_ROWS]:
        u = row["user"]
        t.add_row(f"@{u.username}", yes_no(u.seeker_verified), yes_no("push" in row["channels"]),
                  yes_no("email" in row["channels"]), row["variant"])
    if len(rows) > PREVIEW_ROWS:
        t.add_row(f"[muted]… and {len(rows) - PREVIEW_ROWS} more[/]", "", "", "", "")
    return t


def sample_panels(deliveries):
    by_variant = defaultdict(list)
    seen = set()
    for d in deliveries:
        if (d.user.user_id, d.variant) in seen:
            continue
        seen.add((d.user.user_id, d.variant))
        by_variant[d.variant].append(d)
    panels = []
    for variant in sorted(by_variant):
        picks = by_variant[variant][:]
        random.shuffle(picks)
        for d in picks[:SAMPLE_PANELS]:
            panels.append(preview_panel(d.rendered, d.user, d.channel, variant if len(by_variant) > 1 else None))
    return panels


def email_backend_ok(email_count):
    info = send_email.backend_info()
    console.print(f"  [muted]email via[/] {info.label}   [muted]from[/] {send_email.from_address()}")
    if info.bulk_ok or email_count <= send_email.CONSUMER_LIMIT:
        return True
    console.print(Panel(
        f"[err]{email_count} emails through {info.label} is refused.[/]\n\n"
        f"Consumer and unconfigured mailboxes throttle bulk mail and get the domain flagged as spam; "
        f"the wizard caps them at {send_email.CONSUMER_LIMIT} recipients.\n\n[title]Fix:[/] {info.fix}",
        title="email backend", border_style="err", title_align="left",
    ))
    return False


def test_send(plan):
    operator = ask_operator()
    channels = audience.channels_for(operator, plan.channel)
    if not channels:
        err(f"@{operator.username} has no {plan.channel} channel; skipping the test send")
        return
    ctx = {**render.user_context(operator), **plan.extra}
    for variant, template in sorted(plan.variants.items()):
        rendered = render.render(template, ctx)
        for ch in channels:
            if ch == "push":
                r = deliver_push(operator, rendered, plan.name, variant, plan.wave)
                status, ticket, error = r.status, r.ticket, r.error
            else:
                r = deliver_email(operator, rendered)
                status, ticket, error = r.status, r.message_id, r.error
            log_result(plan.name, plan.wave, operator, ch, variant, rendered, "test" if status == "sent" else status, ticket, error)
            if status == "sent":
                ok(f"test {ch} (variant {variant}) sent to @{operator.username} · {ticket or 'no id'}")
            else:
                err(f"test {ch} (variant {variant}) {status}: {error}")
    pause("Check your phone/inbox, then press Enter")


def send_to_segment():
    console.print("[title]Send to a segment[/]\n")
    name, wave = ask_campaign_name()
    echo("campaign", f"{name}  [muted]wave {wave}[/]")

    channel = select("Channel", channel_choices())
    echo("channel", channel)

    include = ask_segments("Audience (space to select, enter to confirm)")
    exclude = ask_segments("Exclude (optional)", allow_empty=True)
    echo("audience", " AND ".join(include) + (("  minus  " + " OR ".join(exclude)) if exclude else ""))
    only_new = True
    if wave > 1:
        only_new = confirm("Only users not yet delivered in this campaign?", default=True)
        echo("only new", "yes" if only_new else "no")

    qs = audience.with_channel(audience.without_optouts(audience.apply(include, exclude), channel), channel)
    users = list(qs)
    if not users:
        err("nobody matches that audience", "loosen the segments or check the channel")
        pause()
        return
    echo("matches", f"{len(users)} users with a {channel} channel (opt-outs excluded)")

    template_a = choose_message(channel, "Message (variant A)")
    variants = {"A": template_a}
    split_a = 1.0
    if confirm("Add a variant B?"):
        variants["B"] = choose_message(channel, "Message (variant B)")
        pct = text("Share for A (%)", default="50", validate=lambda v: (v.strip().isdigit() and 0 < int(v) < 100) or "1–99")
        split_a = int(pct) / 100
        echo("split", f"A {int(split_a * 100)}% / B {100 - int(split_a * 100)}%")
    extra = collect_extra(variants.values(), prefill=event_prefill(include))

    plan = Plan(name=name, wave=wave, channel=channel, include=include, exclude=exclude,
                variants=variants, split_a=split_a, share_label="all")
    plan.extra = extra

    mode, value, plan.share_label = ask_share(len(users))
    picked = audience.sample_n(users, name, value) if mode == "n" else audience.sample(users, name, value)
    echo("sample", f"{plan.share_label} → {len(picked)} users")

    already = log.sent_keys(name) if only_new else set()
    try:
        plan.deliveries = build_deliveries(plan, picked, already)
    except UnresolvedPlaceholder as e:
        err(str(e), "every placeholder must resolve for every recipient; fix the template or its values")
        pause()
        return
    if not plan.deliveries:
        err("nothing left to send", "everyone in this sample was already reached in this campaign")
        pause()
        return

    emails = sum(1 for d in plan.deliveries if d.channel == "email")
    pushes = len(plan.deliveries) - emails
    if emails and not email_backend_ok(emails):
        pause()
        return
    if emails > 100 and confirm("Cold domain? use 100/hour instead of 60/min", default=False):
        plan.per_minute = send_email.COLD_PER_HOUR / 60

    console.print()
    console.print(audience_table(plan.deliveries))
    for p in sample_panels(plan.deliveries):
        console.print(p)
    console.print(f"  [muted]planned[/] push {pushes} · email {emails} · variants {', '.join(sorted(variants))}")

    if confirm("Send this to yourself before the real run?", default=True):
        test_send(plan)

    if len(plan.deliveries) <= CONFIRM_TYPED_ABOVE:
        go = confirm(f"Send {len(plan.deliveries)} deliveries to {len(picked)} users via {channel}?")
    else:
        typed = text(f"Type the campaign name to send {len(plan.deliveries)} deliveries:")
        go = typed.strip() == name
    if not go:
        console.print("[muted]not sent[/]")
        pause()
        return

    stats = run_campaign(plan)
    log.update_index(name, channel=channel, segments=plan.describe_segments(), share=plan.share_label,
                     variants=sorted(variants), templates={v: t.name for v, t in variants.items()})
    summary_panel(plan, stats)
    pause()


def run_campaign(plan) -> dict:
    """Send everything in the plan with a live progress bar; Ctrl-C finishes the current batch."""
    stop = {"flag": False}

    def on_sigint(signum, frame):
        if not stop["flag"]:
            console.print("\n[warn]Ctrl-C — finishing the current batch, then stopping[/]")
        stop["flag"] = True

    stats = defaultdict(Counter)
    for d in plan.deliveries:
        stats[(d.channel, d.variant)]["planned"] += 1

    pushes = [d for d in plan.deliveries if d.channel == "push"]
    emails = [d for d in plan.deliveries if d.channel == "email"]
    random.shuffle(pushes)
    random.shuffle(emails)

    columns = (
        SpinnerColumn(), TextColumn("{task.description}"), BarColumn(), MofNCompleteColumn(),
        TextColumn("[green]sent ✓ {task.fields[sent]}[/]  [red]failed ✗ {task.fields[failed]}[/]  [grey50]unregistered ⊘ {task.fields[unreg]}[/]"),
        TimeElapsedColumn(),
    )
    previous = signal.signal(signal.SIGINT, on_sigint)
    try:
        with Progress(*columns, console=console) as progress:
            if pushes:
                task = progress.add_task("push ", total=len(pushes), sent=0, failed=0, unreg=0)
                c = Counter()
                batches = list(send_push.chunks(pushes))
                for i, batch in enumerate(batches):
                    if stop["flag"]:
                        break
                    messages = [send_push.build_message(d.user.expo_push_token, d.rendered, plan.name, d.variant, plan.wave) for d in batch]
                    results = send_push.send_batch(messages)
                    dead = []
                    for d, r in zip(batch, results):
                        log_result(plan.name, plan.wave, d.user, "push", d.variant, d.rendered, r.status, r.ticket, r.error)
                        stats[("push", d.variant)][r.status] += 1
                        c[r.status] += 1
                        if r.status == "unregistered":
                            dead.append(d.user.user_id)
                    if dead:
                        receipts.clear_tokens(dead)
                    progress.update(task, advance=len(batch), sent=c["sent"], failed=c["failed"], unreg=c["unregistered"])
                    if i < len(batches) - 1 and not stop["flag"]:
                        time.sleep(send_push.BATCH_PAUSE)
            if emails and not stop["flag"]:
                task = progress.add_task("email", total=len(emails), sent=0, failed=0, unreg=0)
                c = Counter()
                limiter = send_email.RateLimiter(plan.per_minute)
                for d in emails:
                    if stop["flag"]:
                        break
                    limiter.wait()
                    r = deliver_email(d.user, d.rendered)
                    log_result(plan.name, plan.wave, d.user, "email", d.variant, d.rendered, r.status, r.message_id, r.error)
                    stats[("email", d.variant)][r.status] += 1
                    c[r.status] += 1
                    progress.update(task, advance=1, sent=c["sent"], failed=c["failed"], unreg=0)
    finally:
        signal.signal(signal.SIGINT, previous)
    if stop["flag"]:
        warn("stopped early — re-run the campaign (continue, same name) to reach the rest")
    return stats


def summary_panel(plan, stats):
    t = Table(header_style="accent", box=None)
    for col, just in (("channel", "left"), ("variant", "center"), ("planned", "right"), ("sent", "right"),
                      ("failed", "right"), ("unregistered", "right")):
        t.add_column(col, justify=just)
    for (channel, variant), c in sorted(stats.items()):
        t.add_row(channel, variant, str(c["planned"]), f"[ok]{c['sent']}[/]", f"[err]{c['failed']}[/]", f"[muted]{c['unregistered']}[/]")
    body = Table.grid()
    body.add_row(t)
    body.add_row(Text(f"\nlog  {log.campaign_path(plan.name)}", style="muted"))
    if any(ch == "push" for ch, _ in stats):
        body.add_row(Text("run  Fetch push receipts in ~15 min to see deliveries and dead tokens", style="muted"))
    console.print(panel(body, title=f"{plan.name} · wave {plan.wave} · done"))


# ── campaign status / receipts ─────────────────────────────────────────

def pick_campaign(message="Campaign"):
    names = log.list_campaigns()
    if not names:
        err("no campaign logs yet", "run 'Send to a segment' first")
        return None
    index = log.read_index()
    choices = []
    for n in names:
        meta = index.get(n, {})
        c = meta.get("counts", {})
        info = f"{meta.get('channel', '?'):<5} {(meta.get('created') or '')[:10]}  sent {c.get('sent', 0) + c.get('delivered', 0)}"
        choices.append(Choice(f"{n:<24} {info}", value=n))
    return select(message, choices)


def campaign_status():
    name = pick_campaign()
    if not name:
        pause()
        return
    rows = log.read(name)
    meta = log.read_index().get(name, {})
    if meta:
        console.print(f"  [muted]channel[/] {meta.get('channel')}   [muted]segments[/] {meta.get('segments')}   [muted]share[/] {meta.get('share', '')}")
        if meta.get("templates"):
            console.print("  [muted]templates[/] " + "  ".join(f"{v}: {t}" for v, t in meta["templates"].items()))
    t = Table(title=name, header_style="accent", title_justify="left")
    for col, just in (("variant", "center"), ("channel", "left"), ("wave", "center"), ("sent", "right"),
                      ("delivered", "right"), ("failed", "right"), ("unregistered", "right"), ("test", "right")):
        t.add_column(col, justify=just)
    for (variant, channel, wave), c in sorted(log.summarize(rows).items()):
        t.add_row(variant, channel, str(wave), str(c["sent"]), f"[ok]{c['delivered']}[/]", f"[err]{c['failed']}[/]",
                  f"[muted]{c['unregistered']}[/]", f"[warn]{c['test']}[/]")
    console.print(t)
    console.print(f"  [muted]opens: check Vexo → campaign_open (campaign={name})[/]")
    console.print(f"  [muted]log: {log.campaign_path(name)}[/]")
    pause()


def fetch_receipts_screen():
    name = pick_campaign("Fetch receipts for")
    if not name:
        pause()
        return
    with console.status("asking Expo for receipts…"):
        try:
            summary = receipts.apply_to_campaign(name)
        except send_push.PushSendError as e:
            err(f"Expo receipts failed: {e}", "try again in a minute")
            pause()
            return
    ok(f"checked {summary.get('checked', 0)} tickets · delivered {summary.get('delivered', 0)} · "
       f"failed {summary.get('failed', 0)} · unregistered {summary.get('unregistered', 0)} · "
       f"still pending {summary.get('pending', 0)}")
    if summary.get("cleared_tokens"):
        ok(f"cleared {summary['cleared_tokens']} dead push tokens")
    pause()


def validate_tokens_screen():
    total = audience.base_queryset().filter(audience.HAS_PUSH).count()
    if not total:
        warn("no push tokens to validate")
        pause()
        return
    if not confirm(f"Ping {total} push tokens with a silent data-only push?", default=True):
        pause()
        return
    with Progress(SpinnerColumn(), TextColumn("{task.description}"), BarColumn(), MofNCompleteColumn(), console=console) as progress:
        task = progress.add_task("pinging", total=total)
        try:
            dead, checked = receipts.validate_tokens(progress=lambda n: progress.update(task, advance=n))
        except send_push.PushSendError as e:
            err(f"Expo: {e}", "try again in a minute")
            pause()
            return
    if not dead:
        ok(f"all {checked} tokens look alive")
        pause()
        return
    t = Table(title=f"{len(dead)} dead tokens of {checked}", header_style="accent", title_justify="left")
    for col in ("username", "token", "error"):
        t.add_column(col)
    for row in dead[:60]:
        t.add_row(f"@{row['username']}", short_wallet(row["expo_push_token"]), row["error"] or "")
    if len(dead) > 60:
        t.add_row(f"[muted]… and {len(dead) - 60} more[/]", "", "")
    console.print(t)
    if confirm(f"Clear {len(dead)} dead tokens?"):
        n = receipts.clear_tokens([r["user_id"] for r in dead])
        ok(f"cleared {n} tokens")
    pause()


# ── templates ──────────────────────────────────────────────────────────

def templates_screen():
    while True:
        try:
            templates = render.load_templates()
        except render.TemplateError as e:
            err(str(e), "fix the YAML file and come back")
            pause()
            return
        t = Table(title="Templates", header_style="accent", title_justify="left")
        for col in ("name", "channel", "title", "placeholders"):
            t.add_column(col)
        for tpl in templates.values():
            t.add_row(tpl.name, tpl.channel, tpl.title[:50], " ".join("{%s}" % p for p in sorted(tpl.placeholders())))
        console.print(t)
        choice = select("", [Choice(n, value=n) for n in templates] + [Choice("Create a template", "create"), Choice("Back", None)])
        if choice is None:
            return
        if choice == "create":
            create_template(templates)
            continue
        template_actions(templates[choice])


def template_actions(tpl):
    action = select(tpl.name, [Choice("Show", "show"), Choice("Render for a user", "render"), Choice("Back", None)])
    if action == "show":
        console.print(Syntax(tpl.path.read_text(encoding="utf-8") if tpl.path else tpl.to_yaml(), "yaml", theme="ansi_dark"))
        pause()
    elif action == "render":
        user = ask_username()
        extra = collect_extra([tpl])
        try:
            rendered = render.render(tpl, {**render.user_context(user), **extra})
        except UnresolvedPlaceholder as e:
            err(str(e))
            pause()
            return
        console.print(preview_panel(rendered, user, tpl.channel))
        if tpl.channel == "email":
            console.print(Syntax(render.email_text(rendered, unsubscribe_url(user)), "text", theme="ansi_dark"))
        pause()


def create_template(existing):
    name = log.slug(text("Template name (slug)", validate=lambda v: (bool(log.slug(v)) and log.slug(v) not in existing) or "unique slug"))
    channel = select("Channel", channel_choices())
    tpl = write_message(channel)
    tpl.name = name
    path = render.save_template(tpl)
    ok(f"saved {path}")
    console.print(f"  [muted]placeholders[/] " + (" ".join("{%s}" % p for p in sorted(tpl.placeholders())) or "none"))
    pause()


# ── main loop ──────────────────────────────────────────────────────────

MENU = (
    ("Audience overview", audience_overview),
    ("Find a user", find_user),
    ("Send to one user", send_to_one_user),
    ("Send to a segment", send_to_segment),
    ("Campaign status", campaign_status),
    ("Fetch push receipts", fetch_receipts_screen),
    ("Validate push tokens", validate_tokens_screen),
    ("Templates", templates_screen),
)


def run():
    while True:
        try:
            clear()
            console.print(header())
            action = select("", [Choice(label, value=fn) for label, fn in MENU] + [Choice("Quit", value="quit")])
            if action == "quit":
                return
            console.print()
            action()
        except KeyboardInterrupt:
            console.print("\n[muted]↩ back to the menu[/]")
            time.sleep(0.3)
        except EOFError:
            return
        except Exception as e:  # never a traceback on screen
            path = log_exception(type(e).__name__)
            err(f"{type(e).__name__}: {e}", f"traceback in {path}")
            try:
                pause()
            except (KeyboardInterrupt, EOFError):
                pass
            except Exception:  # the prompt itself failed (no TTY?) — still no traceback
                time.sleep(1)
