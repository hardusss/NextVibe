"""Rich console, theme and the small helpers every nv screen shares."""
import datetime
import traceback

from django.conf import settings
from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from rich.theme import Theme

THEME = Theme({
    "ok": "bold green",
    "err": "bold red",
    "warn": "bold yellow",
    "muted": "grey50",
    "accent": "bold magenta",
    "title": "bold white",
    "prod": "bold white on red",
    "dev": "bold black on green",
})

console = Console(theme=THEME, highlight=False)


def env_name() -> str:
    return getattr(settings, "ENV", "dev") or "dev"


def is_prod() -> bool:
    return env_name() == "prod"


def env_badge() -> Text:
    name = env_name()
    return Text(f" {name.upper()} ", style="prod" if is_prod() else "dev")


def clear() -> None:
    console.clear()


def ok(msg: str) -> None:
    console.print(f"[ok]✓[/] {msg}")


def warn(msg: str) -> None:
    console.print(f"[warn]![/] {msg}")


def err(msg: str, fix: str | None = None) -> None:
    """One red line, optionally followed by the fix. Never a traceback."""
    line = f"[err]✗ {msg}[/]"
    if fix:
        line += f"\n  [muted]→ {fix}[/]"
    console.print(line)


def log_exception(context: str):
    """Append the current traceback to logs/errors.log and return the path."""
    from nvcli import log  # lazy: log imports nothing from here, but keep it one-way

    path = log.error_log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(f"\n--- {datetime.datetime.now().isoformat(timespec='seconds')} {context}\n")
        fh.write(traceback.format_exc())
    return path


def panel(body, title: str | None = None, style: str = "accent", **kw) -> Panel:
    return Panel(body, title=title, border_style=style, title_align="left", **kw)


def short_wallet(addr: str | None) -> str:
    if not addr:
        return "—"
    return addr if len(addr) <= 12 else f"{addr[:4]}…{addr[-4:]}"


def fmt_dt(dt) -> str:
    if not dt:
        return "—"
    return dt.strftime("%Y-%m-%d %H:%M")


def fmt_month(dt) -> str:
    if not dt:
        return "—"
    return dt.strftime("%b %Y")


def yes_no(flag) -> str:
    return "[ok]✓[/]" if flag else "[muted]✗[/]"
