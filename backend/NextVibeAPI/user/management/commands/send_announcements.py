from django.core.management.base import BaseCommand
from scripts.broadcast_announcements import broadcast_og_cnft_announcement, broadcast_link_email_announcement


class Command(BaseCommand):
    help = "Send announcement broadcasts to NextVibe users."

    def add_arguments(self, parser):
        parser.add_argument(
            '--prod',
            action='store_true',
            help='Run in production mode (target all users instead of test users nxv and vibe_B8KkPq.lzr)',
        )

    def handle(self, *args, **options):
        test_mode = not options['prod']
        self.stdout.write(self.style.SUCCESS(
            f"Running Announcements Broadcast (Mode: {'TEST' if test_mode else 'PRODUCTION'})..."
        ))

        broadcast_og_cnft_announcement(test_mode=test_mode)
        broadcast_link_email_announcement(test_mode=test_mode)

        self.stdout.write(self.style.SUCCESS("All broadcasts completed successfully!"))
