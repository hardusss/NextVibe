"""
Unsubscribe links for nv campaigns: /u/e/<token> (email) and GET
/u/p/<token> (push). Public, no auth — the token is a signed user id
(django.core.signing) so it can't be guessed. State goes to
nvcli/logs/optout.json; the campaign wizard always excludes those users.

The email link is GET (the footer link) and POST: RFC 8058 one-click
unsubscribe, which Gmail and Apple Mail send to the List-Unsubscribe URL
without cookies or a CSRF token.
"""
from django.core import signing
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from nvcli import log

SALT = "nv-optout"
_HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>NextVibe</title></head>
<body style="margin:0;background:#0a0410;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:80px auto;padding:0 24px;text-align:center;">
<h1 style="font-size:22px;margin:0 0 12px 0;">%s</h1>
<p style="color:#b8aecd;font-size:15px;line-height:22px;margin:0;">%s</p>
</div></body></html>"""


def make_token(user_id: int) -> str:
    return signing.dumps(int(user_id), salt=SALT)


def _optout(request, token: str, channel: str, done: str):
    try:
        user_id = signing.loads(token, salt=SALT)
    except signing.BadSignature:
        return HttpResponse(_HTML % ("This link isn't valid", "It may have been cut off when copied."), status=400)
    log.add_optout(channel, int(user_id))
    return HttpResponse(_HTML % ("You're unsubscribed", done))


@csrf_exempt
@require_http_methods(["GET", "POST"])
def email_optout(request, token: str):
    return _optout(request, token, "email", "You won't get emails like this from NextVibe anymore.")


@require_GET
def push_optout(request, token: str):
    return _optout(request, token, "push", "You won't get announcement pushes from NextVibe anymore.")
