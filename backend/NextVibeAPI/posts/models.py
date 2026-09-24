from django.db import models
from django.conf import settings
from django.utils import timezone
from .managers import PostsManager, CommentManager, CommentReplyManager
from decimal import Decimal
import uuid


class Post(models.Model):
    class Meta:
        indexes = [
            models.Index(fields=['-create_at', '-count_likes']),
            models.Index(fields=['owner', '-create_at']),
        ]
    owner = models.ForeignKey("user.User", on_delete=models.CASCADE)
    about = models.TextField(max_length=255, default="", null=True, blank=True)
    count_likes = models.IntegerField(default=0, null=True)
    create_at = models.DateTimeField(auto_now_add=True)
    location = models.CharField(default=None, null=True, blank=True, max_length=255)
    h3_geo = models.CharField(default=None, null=True, blank=True, max_length=255)
    is_ai_generated = models.BooleanField(default=False)
    is_approved = models.BooleanField(default=False)  
    moderation_status = models.CharField(max_length=20, default="pending")
    categories = models.JSONField(default=list, blank=True)
    is_comments_enabled = models.BooleanField(default=True, blank=True, null=True)
    is_luma_event = models.BooleanField(default=False)
    luma_event_url = models.CharField(default=None, null=True, blank=True, max_length=255)
    luma_event_verified = models.BooleanField(default=False)
    luma_event_start_time = models.DateTimeField(default=None, null=True, blank=True)
    luma_event_end_time = models.DateTimeField(default=None, null=True, blank=True)
    is_hide = models.BooleanField(default=False)
    # NFT logic
    is_nft = models.BooleanField(default=False)
    
    # Limited Edition
    total_supply = models.IntegerField(default=50, null=True, blank=True)
    minted_count = models.IntegerField(default=0)
    on_event = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='event_posts',
        help_text="The event during which this post was created"
    )
    reputation_earned = models.IntegerField(
        default=0,
        null=True,
        blank=True,
        help_text="Reputation points earned for creating this post"
    )
    # Proof of Meet selfie posts (posts/src/meet_photos.py): the owner took the
    # photo, the co-author is the other person in it. Both profiles show it;
    # meet_slug marks the post type "proof_of_meet". Never writable by clients.
    co_author = models.ForeignKey(
        "user.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="coauthored_posts",
    )
    meet_slug = models.CharField(max_length=16, null=True, blank=True, db_index=True)
    objects = PostsManager()
    all_objects = models.Manager()

    @property
    def is_proof_of_meet(self) -> bool:
        return bool(self.meet_slug)

    def __str__(self):
        return f"Post by {self.owner.username} with id {self.id}"

class PostsMedia(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="media")
    file = models.FileField(upload_to='posts_media/')
    preview = models.ImageField(upload_to='posts_previews/', null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    @property
    def file_url(self):
        """Return full file URL"""
        if self.file:
            return f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/{self.file.name}"
        return None
    
    @property
    def preview_url(self):
        """Return full preview URL"""
        if self.preview:
            return f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/{self.preview.name}"
        return None

    def __str__(self):
        return f"Media for Post {self.post.id}"
    
class PostReport(models.Model):
    class ReportType(models.TextChoices):
        SPAM = 'spam', 'Spam'
        NUDITY = 'nudity', 'Nudity / Sexual Content'
        VIOLENCE = 'violence', 'Violence / Threats'
        HATE_SPEECH = 'hate_speech', 'Hate Speech'
        SCAM = 'scam', 'Scam / Fraud'
        ILLEGAL = 'illegal_activity', 'Illegal Activity'
        OTHER = 'other', 'Other'

    class Meta:
        unique_together = ('post', 'reporter')

    post = models.ForeignKey(Post, on_delete=models.CASCADE)
    reporter = models.ForeignKey("user.User", on_delete=models.CASCADE)
    report_type = models.CharField(
        max_length=20,
        choices=ReportType.choices,
        default=ReportType.SPAM
    )
    description = models.TextField(null=True, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.reporter.username} report for post (ID {self.post.id}) with report type: {self.report_type}"

class Comment(models.Model):
    owner = models.ForeignKey("user.User", on_delete=models.CASCADE)
    post = models.ForeignKey(Post, on_delete=models.CASCADE)
    content = models.TextField(max_length=255)
    create_at = models.DateTimeField(auto_now_add=True)
    count_likes = models.IntegerField(default=0, null=True)
    objects = CommentManager()
    all_objects = models.Manager()
    
    def __str__(self) -> str:
        return f"Comment by {self.owner.user_id} in post {self.post.id}"

class CommentReply(models.Model):
    owner = models.ForeignKey("user.User", on_delete=models.CASCADE)
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name="replies")
    content = models.TextField(max_length=255)
    create_at = models.DateTimeField(auto_now_add=True)
    count_likes = models.IntegerField(default=0, null=True)
    objects = CommentReplyManager()
    all_objects = models.Manager()

    def __str__(self) -> str:
        return f"Reply by {self.owner.user_id} in comment {self.comment.id}"

# --- NEW MODEL: USER COLLECTION (Who claimed what) ---
class UserCollection(models.Model):
    user = models.ForeignKey(
        "user.User",
        on_delete=models.CASCADE,
        related_name='nft_collection'
    )
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name='mints'
    )
    asset_id = models.CharField(max_length=64, unique=True, null=True, blank=True)   # cNFT assetId (PublicKey)
    signature = models.CharField(max_length=128, null=True, blank=True)  # base64 tx sig
    edition = models.PositiveIntegerField(default=1)           # edition number (1 of 50)
    price = models.DecimalField(max_digits=10, decimal_places=6, default=Decimal('0'))  # SOL price
    minted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-minted_at']
        verbose_name = "NFT Item"
        unique_together = ('user', 'post')  # one user = one mint on post

    def __str__(self):
        return f"NFT #{self.edition} of post {self.post.id} owned by {self.user.username}"

class PendingClaim(models.Model):
    """
    A reserved edition for an in-flight free collect (two-phase mint).

    Created by collect/prepare when the edition is reserved and the partially
    signed transaction is handed to the client; deleted by collect/submit on
    success. Rows past `expires_at` are ignored for edition counting and
    swept lazily on the next prepare for the same post.
    """
    user = models.ForeignKey("user.User", on_delete=models.CASCADE, related_name="pending_claims")
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="pending_claims")
    edition = models.PositiveIntegerField()
    claim_id = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)
    message_hash = models.CharField(max_length=128, blank=True, default="")
    tx_base64 = models.TextField(blank=True, default="")
    asset_id = models.CharField(max_length=64, blank=True, null=True, default=None)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["post", "edition"]),
        ]

    def __str__(self):
        return f"Pending claim {self.claim_id} for post {self.post_id} ed.{self.edition} by {self.user_id}"


class EventRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    user = models.ForeignKey("user.User", on_delete=models.CASCADE, related_name='event_requests')
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='event_requests')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'post')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} request for event {self.post.id} ({self.status})"

class EventCheckin(models.Model):
    class MintStatus(models.TextChoices):
        PENDING = 'pending'
        MINTED = 'minted'
        FAILED = 'failed'

    user = models.ForeignKey("user.User", on_delete=models.CASCADE, related_name='event_checkins')
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='event_checkins')
    is_registered = models.BooleanField(default=False)
    checked_in_at = models.DateTimeField(auto_now_add=True)
    # The check-in doubles as the pending-mint record for the POAP cNFT:
    # created 'pending' at verification, transitioned by ClaimEventNftView.
    mint_status = models.CharField(
        max_length=10,
        choices=MintStatus.choices,
        default=MintStatus.PENDING,
    )

    class Meta:
        unique_together = ('user', 'post')
        ordering = ['-checked_in_at']

    def __str__(self):
        status = "registered" if self.is_registered else "unregistered"
        return f"{self.user.username} checked in ({status}) at event {self.post.id}"


class Reputation(models.Model):
    """Tracks reputation points earned through interactions."""
    user = models.ForeignKey(
        "user.User",
        on_delete=models.CASCADE,
        related_name='reputation_received',
        help_text="The user who received reputation",
    )
    given_by = models.ForeignKey(
        "user.User",
        on_delete=models.CASCADE,
        related_name='reputation_given',
        help_text="The user who gave the reputation",
    )
    points = models.IntegerField(
        default=1,
        help_text="How many reputation points were awarded",
    )
    is_checkin = models.BooleanField(
        default=False,
        help_text="Whether this reputation was from an event check-in",
    )
    event = models.ForeignKey(
        Post,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reputation_entries',
        help_text="The event (post) where this interaction took place",
    )
    h3_geo = models.CharField(
        max_length=255,
        default=None,
        null=True, 
        blank=True, 
        help_text="H3 Geo index with max resolution for accuracy"
    )
    post = models.ForeignKey(
        Post,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reputation_entries_for_post',
        help_text="The post for which this reputation was awarded"
    )
    post_type = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text="The type of post (e.g. event_post)"
    )
    source = models.CharField(
        max_length=10,
        default='event',
        db_index=True,
        help_text="Where the reputation came from: 'event' (tap at an event), 'irl' (tap outside events), 'checkin', 'post'",
    )
    # Both rows of one tap share it: the Proof of Meet id behind
    # nextvibe.io/u/meet/<slug>. Written with the rows, backfilled by
    # `manage.py backfill_meet_slugs` (posts/src/meets.py).
    meet_slug = models.CharField(
        max_length=16,
        default=None,
        null=True,
        blank=True,
        db_index=True,
        help_text="Proof of Meet id shared by both rows of one tap (source 'irl' or 'event')",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        src = "check-in" if self.is_checkin else "interaction"
        return f"{self.given_by.username} → {self.user.username}: +{self.points} rep ({src})"

class MeetPhoto(models.Model):
    """
    Proof of Meet v2: the selfie two people take together right after a tap,
    and the consent around it. One row per attempt; the flow lives in
    posts/src/meet_photos.py.

    Nothing about a photo is visible to anyone but the two people until the
    subject approves it. Raw uploads and previews stay in the private bucket;
    only the composited card is ever public (after approval).
    """

    class Status(models.TextChoices):
        DRAFT = "draft"  # the photographer's preview, never shown to the subject
        PENDING = "pending"  # sent; the subject has 24 h to answer
        APPROVED = "approved"  # both agreed, moderation passed; minting
        REJECTED = "rejected"
        EXPIRED = "expired"
        MODERATION_FAILED = "moderation_failed"
        MINTED = "minted"
        TAKEN_DOWN = "taken_down"

    meet_slug = models.CharField(max_length=16, db_index=True)
    # The slug while the row is active (not rejected, expired or failed
    # moderation): one active photo per meet. MySQL can't enforce a unique
    # constraint with a condition (Django skips creating it there), but it
    # does enforce a unique column that allows many NULLs.
    active_slug = models.CharField(max_length=16, null=True, blank=True, unique=True)
    photographer = models.ForeignKey(
        "user.User", related_name="meet_photos_taken", on_delete=models.CASCADE,
    )
    subject = models.ForeignKey(
        "user.User", related_name="meet_photos_in", on_delete=models.CASCADE,
    )
    # Private bucket key of the EXIF-stripped JPEG; previews sit next to it
    raw_key = models.CharField(max_length=255)
    # Public key of the composited story card, once approved
    final_key = models.CharField(max_length=255, blank=True, default="")
    # sha256 of the stored raw JPEG (after EXIF stripping), published in the
    # cNFT metadata so the photo can't be swapped unnoticed
    raw_sha256 = models.CharField(max_length=64)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    retakes = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    taken_down_at = models.DateTimeField(null=True, blank=True)
    # Private files are gone (raw + previews)
    purged_at = models.DateTimeField(null=True, blank=True)
    asset_id_photographer = models.CharField(max_length=64, blank=True, default="")
    asset_id_subject = models.CharField(max_length=64, blank=True, default="")
    # The wallet each leaf went to (co-authors in the metadata)
    wallet_photographer = models.CharField(max_length=50, blank=True, default="")
    wallet_subject = models.CharField(max_length=50, blank=True, default="")
    post = models.ForeignKey(
        "posts.Post", null=True, blank=True, on_delete=models.SET_NULL, related_name="meet_photos",
    )
    # Each co-author can hide the post from their own profile only
    hidden_by_photographer = models.BooleanField(default=False)
    hidden_by_subject = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["subject", "status"]),
            models.Index(fields=["photographer", "status"]),
        ]

    def __str__(self):
        return f"Meet photo {self.meet_slug} by {self.photographer_id} with {self.subject_id} ({self.status})"


class Collectible(models.Model):
    """
    Everything a person holds from NextVibe, on Solana or not yet: one row per
    person per item (posts/src/collectibles.py). The cNFT tab, Claim and the
    wallet reminders read only this table.

    A check-in or a tap records the row in its own transaction, whether or not
    the person has a wallet: queued (and minted right away) with one, off-chain
    without. Connecting a wallet later queues everything off-chain at once.
    `metadata` is the JSON behind `metadata_uri`, frozen when the row is
    recorded, so an item looks the same before and after it's minted.

    UserCollection, MeetPhoto and OgAvatarMint stay the ledgers of their own
    flows (editions, consent); a mint writes them in the same transaction.
    """

    class Kind(models.TextChoices):
        POAP = "poap", "Event POAP"
        MEET = "meet", "Proof of Meet"
        POST = "post", "Collected post"
        BADGE = "badge", "Badge"

    class Status(models.TextChoices):
        OFFCHAIN = "offchain", "Off-chain"
        QUEUED = "queued", "Queued"
        MINTING = "minting", "Minting"
        MINTED = "minted", "Minted"
        FAILED = "failed", "Failed"

    user = models.ForeignKey("user.User", on_delete=models.CASCADE, related_name="collectibles")
    kind = models.CharField(max_length=8, choices=Kind.choices)
    # event id / meet_slug / post id / badge key
    source_id = models.CharField(max_length=64)
    # The event (POAP) or the collected post; a minted row outlives a deleted post
    post = models.ForeignKey(
        Post, null=True, blank=True, on_delete=models.SET_NULL, related_name="collectibles",
    )
    # Proof of Meet: the other person
    counterpart = models.ForeignKey(
        "user.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
    )
    metadata_uri = models.URLField(max_length=300)
    metadata = models.JSONField(default=dict, blank=True)
    # Cached from the metadata for fast grids
    image_url = models.URLField(max_length=500, blank=True, default="")
    name = models.CharField(max_length=120)
    # POAP and collected-post editions (part of the frozen metadata)
    edition = models.PositiveIntegerField(null=True, blank=True)
    # When it happened: the check-in, the tap, the collect
    recorded_at = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OFFCHAIN, db_index=True)
    # The wallet it goes (or went) to
    wallet = models.CharField(max_length=50, blank=True, default="")
    asset_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    signature = models.CharField(max_length=128, blank=True, default="")
    minted_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.TextField(blank=True, default="")
    # Backoff: a queued row isn't picked before this
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    # What queued it ("connect:<ts>", "claim_all:<ts>", …): one push per batch
    batch = models.CharField(max_length=40, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            # The double-mint guard: one row per person per source
            models.UniqueConstraint(fields=["user", "kind", "source_id"], name="one_collectible_per_source"),
        ]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["user", "-recorded_at"]),
            models.Index(fields=["kind", "source_id"]),
            models.Index(fields=["status", "next_attempt_at"]),
        ]
        ordering = ["-recorded_at", "-id"]

    @property
    def is_onchain(self) -> bool:
        return self.status == self.Status.MINTED

    def __str__(self):
        return f"{self.get_kind_display()} {self.source_id} for {self.user_id} ({self.status})"


class CollectibleReminder(models.Model):
    """
    A wallet reminder that went out (or was skipped) for one person, one step,
    one channel. The unique constraint keeps a step from ever going out twice
    (posts/src/wallet_reminders.py).
    """
    user = models.ForeignKey("user.User", on_delete=models.CASCADE, related_name="collectible_reminders")
    step = models.CharField(max_length=16)  # 24h, 3d, 7d, w1 … w4
    channel = models.CharField(max_length=8)  # push | email
    status = models.CharField(max_length=16)  # sent | failed | unregistered | skipped
    # Expo ticket / Resend id, or the reason it failed
    detail = models.CharField(max_length=255, blank=True, default="")
    receipt_checked = models.BooleanField(default=False)
    # The job's clock when it went out (the 3-day gap is measured from it)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "step", "channel"], name="one_reminder_per_step"),
        ]
        indexes = [models.Index(fields=["user", "-created_at"])]

    def __str__(self):
        return f"Wallet reminder {self.step}/{self.channel} for {self.user_id} ({self.status})"


class ReminderPreference(models.Model):
    """
    Settings → Notifications for one person. No row means the defaults:
    wallet reminders on, time zone unknown (Europe/Kyiv).
    """
    user = models.OneToOneField(
        "user.User", on_delete=models.CASCADE, primary_key=True, related_name="reminder_preference",
    )
    wallet_reminders = models.BooleanField(default=True)
    # IANA name the app reports, for quiet hours
    timezone = models.CharField(max_length=64, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Reminder settings of {self.user_id}"
