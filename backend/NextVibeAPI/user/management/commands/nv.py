from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Interactive console for NextVibe pushes and emails: audience overview, "
        "find a user, send to one user or a segment, campaign status, push "
        "receipts, token validation, templates. Everything is asked "
        "interactively; every send previews and asks for confirmation."
    )

    def handle(self, *args, **options):
        from nvcli.menu import run

        run()
