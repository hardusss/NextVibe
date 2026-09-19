"""
nv — interactive console for NextVibe pushes and emails.

Entry point: ``python manage.py nv`` (user/management/commands/nv.py) which
calls :func:`nvcli.menu.run`. No models, no migrations: campaign state lives
in JSONL files under ``nvcli/logs/`` (gitignored), templates are YAML files
under ``nvcli/templates/``.
"""
from pathlib import Path

PKG_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = PKG_DIR / "templates"
EMAIL_TEMPLATES_DIR = TEMPLATES_DIR / "email"
DEFAULT_LOGS_DIR = PKG_DIR / "logs"
