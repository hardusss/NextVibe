"""
Proof of Meet v2: the selfie two people take together right after a tap.

    lock ─▶ upload (draft, up to 3 retakes) ─▶ send ─▶ pending ─▶ approve ─▶ approved ─▶ mint ─▶ minted
                                                        │  ╲                      │
                                   reject / 24 h / block ▼   ▼ moderation         ▼ either person, any time
                                          rejected / expired   moderation_failed   taken_down

Either person can take the photo. The first to lock the meet (3 minutes,
in the cache) is the photographer; the other phone shows who is taking it.
Every upload is EXIF-stripped and re-encoded (meet_photo_image), checked by
the moderation service before the other person can ever see it, and
rendered with the NextVibe layer on the server (meet_photo_card): the
preview the photographer sends is that render. The subject has 24 hours.
Their approval runs moderation again, publishes the card at
meet/<slug>/story.jpg and og.jpg, then mints one cNFT per person with a
wallet (the other one gets theirs when they connect a wallet) and creates
the post both profiles show. Nothing is minted or posted for a photo that
wasn't approved, and no extra REP is given for a selfie.

Either person can take it down at any time: the post is deleted, the public
images turn back into the v1 card at the same URLs, the metadata stops
mentioning the photo, and the private files are deleted. The cNFTs stay
(nothing on-chain can be erased), with the v1 image.

Limits per meet: one active photo (active_slug), 3 retakes per draft,
8 uploads in all and 2 rejections; after that the v1 card stays.
"""
import logging
import secrets
import threading
from datetime import timedelta

import requests
from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import F, Q, Value
from django.db.models.functions import Greatest
from django.utils import timezone

from posts.constants import NFT_SERVICE_URL
from posts.models import MeetPhoto, Post, PostsMedia
from posts.src import meet_card, meet_photo_card, moderation, realtime
from posts.src.meet_card import local_time
from posts.src.meet_photo_image import PhotoRejected, clean_upload, open_jpeg
from posts.src.meet_photo_store import (
    delete_private, delete_public, private_store, public_key, public_url, put_public,
)
from posts.src.meets import TIER_LABELS, is_deleted, load_meet, meet_url
from user.models import User
from user.src import og_image as og
from user.src.blocking import blocked_user_ids
from user.src.send_push_message import send as send_push

logger = logging.getLogger("posts.meet_photos")

Status = MeetPhoto.Status
LOCK_SECONDS = 180
DECISION_WINDOW = timedelta(hours=24)
EXPIRED_KEEP = timedelta(days=7)
FAILED_KEEP = timedelta(hours=24)
DRAFT_STALE = timedelta(minutes=30)
MAX_RETAKES = 3
MAX_UPLOADS = 8
MAX_REJECTIONS = 2
CAPTION_MAX = 255
ONCHAIN_NAME_BYTES = 32  # Bubblegum's limit for the on-chain name
SWEEP_MINT_BATCH = 20
PUSH_TITLE = "Proof of Meet"
TIER_NAMES = {"in_person": "In person", "peer_verified": "Peer verified", "organizer_verified": "Organizer verified"}
ROLES = ("photographer", "subject")
UNAVAILABLE = "Selfies aren't available yet."
CANT_USE = "This photo can't be used — try another one."


class MeetPhotoError(Exception):
    def __init__(self, code, message, http=400, **extra):
        super().__init__(message)
        self.code, self.message, self.http, self.extra = code, message, http, extra


class MintError(Exception):
    pass


def _not_found():
    return MeetPhotoError("NOT_FOUND", "Not found", 404)


# ── Who and what ─────────────────────────────────────────────────────────

def is_available() -> bool:
    return private_store() is not None


def lock_key(slug) -> str:
    return f"meet_photo_lock:{slug}"


def participants(slug, user, strict=True):
    """
    (meet, the other person) when `user` is one of the two people who met.
    strict: the meet must be visible to them (no block between the two, nobody
    banned, the other account still exists). Takedowns aren't strict.
    Anyone else gets NOT_FOUND, whatever the reason.
    """
    meet = load_meet(slug, viewer=user, visible_only=strict)
    if meet is None:
        raise _not_found()
    ids = [person.user_id for person in meet.people]
    if user.user_id not in ids:
        raise _not_found()
    other_id = ids[1] if ids[0] == user.user_id else ids[0]
    other = User.all_objects.filter(user_id=other_id).first()
    if other is None or (strict and is_deleted(other)):
        raise _not_found()
    return meet, other


def _photos(slug):
    return MeetPhoto.objects.filter(meet_slug=slug).select_related("photographer", "subject", "post")


def _active(photos):
    return next((p for p in photos if p.active_slug), None)


def _uploads_used(photos) -> int:
    return sum(1 + p.retakes for p in photos)


def _rejections(photos) -> int:
    return sum(1 for p in photos if p.status == Status.REJECTED)


def _role(photo, user) -> str:
    return "photographer" if photo.photographer_id == user.user_id else "subject"


def _folder(raw_key) -> str:
    return raw_key.rsplit("/", 1)[0]


def _private_keys(raw_key):
    folder = _folder(raw_key)
    return [raw_key, f"{folder}/story.jpg", f"{folder}/og.jpg"]


def _overdue(photo, now=None) -> bool:
    return photo.status == Status.PENDING and photo.sent_at and photo.sent_at + DECISION_WINDOW <= (now or timezone.now())


def photo_version(photo) -> str:
    return og.version_hash(meet_photo_card.PHOTO_DESIGN_VERSION, photo.pk, photo.status,
                           photo.asset_id_photographer, photo.asset_id_subject)


def live_photo(slug):
    """The minted photo of a meet, or None: /u/meet/<slug> and its card show it."""
    return MeetPhoto.objects.filter(meet_slug=slug, status=Status.MINTED).order_by("-created_at", "-id").first()


def metadata_url(slug) -> str:
    return f"{settings.PUBLIC_API_URL}/meta/meet/{slug}.json"


# ── Lock ─────────────────────────────────────────────────────────────────

def _lock_holder(slug):
    return cache.get(lock_key(slug))


def _hold_lock(slug, user, other):
    """Take or refresh the meet's lock for `user`; LOCKED when the other person has it."""
    key = lock_key(slug)
    holder = cache.get(key)
    if holder == user.user_id:
        cache.touch(key, LOCK_SECONDS)
        return False
    if holder is None and cache.add(key, user.user_id, LOCK_SECONDS):
        return True
    if cache.get(key) == user.user_id:
        return False
    raise MeetPhotoError("LOCKED", f"@{other.username} is taking the photo…", 409, photographer=other.username)


def _release_lock(slug, user):
    key = lock_key(slug)
    if cache.get(key) == user.user_id:
        cache.delete(key)


def _check_can_start(photos, user, other, now=None):
    """Raise unless `user` may start (or keep working on) a photo for this meet."""
    active = _active(photos)
    if active is not None:
        if active.status == Status.DRAFT:
            if active.photographer_id == user.user_id:
                return active
            if _lock_holder(active.meet_slug) == active.photographer_id:
                raise MeetPhotoError("LOCKED", f"@{other.username} is taking the photo…", 409,
                                     photographer=other.username)
            _expire(active, now=now)  # their session ended without sending
        else:
            raise MeetPhotoError("PHOTO_EXISTS", "This meet already has a photo.", 409, photo_status=active.status)
    if _rejections(photos) >= MAX_REJECTIONS or _uploads_used(photos) >= MAX_UPLOADS:
        raise MeetPhotoError("NO_MORE_TRIES", "No more photos for this meet — the card stays as it is.", 409)
    return None


def acquire_lock(slug, user):
    """POST …/photo/lock: the first of the two to call it takes the photo."""
    meet, other = participants(slug, user)
    if not is_available():
        raise MeetPhotoError("PHOTOS_UNAVAILABLE", UNAVAILABLE, 503)
    _expire_overdue(slug)
    photos = list(_photos(slug))
    _check_can_start(photos, user, other)
    if _hold_lock(slug, user, other):
        realtime.publish([other.user_id], _event(slug, "taking", by=user))
    return meet, other


def cancel(slug, user):
    """POST …/photo/cancel: the photographer leaves without sending; the draft is discarded."""
    meet, other = participants(slug, user, strict=False)
    draft = MeetPhoto.objects.filter(active_slug=slug, status=Status.DRAFT, photographer=user).first()
    if draft is not None:
        _expire(draft)
    had_lock = _lock_holder(slug) == user.user_id
    _release_lock(slug, user)
    if draft is not None or had_lock:
        realtime.publish([other.user_id], _event(slug, "released"))
    return meet, other


# ── Upload and send ──────────────────────────────────────────────────────

def upload(slug, user, upload_file):
    """
    POST …/photo: a new photo, or a retake of the draft. Stripped, checked by
    moderation and rendered with the layer; returns the draft.
    """
    meet, other = participants(slug, user)
    store = private_store()
    if store is None:
        raise MeetPhotoError("PHOTOS_UNAVAILABLE", UNAVAILABLE, 503)
    _expire_overdue(slug)
    photos = list(_photos(slug))
    draft = _check_can_start(photos, user, other)
    if draft is not None and draft.retakes >= MAX_RETAKES:
        raise MeetPhotoError("NO_MORE_RETAKES", "That was the last retake. Send it, or skip the selfie.", 409)
    _hold_lock(slug, user, other)

    try:
        clean = clean_upload(upload_file)
    except PhotoRejected as e:
        raise MeetPhotoError(e.code, e.message, e.status)

    folder = f"meet-photos/{slug}/{secrets.token_hex(8)}"
    raw_key = f"{folder}/raw.jpg"
    store.put(raw_key, clean.jpeg)
    try:
        passed = moderation.image_passes(store.signed_url(raw_key), ref=slug)
    except moderation.ModerationUnavailable:
        delete_private([raw_key])
        raise MeetPhotoError("MODERATION_UNAVAILABLE", "We couldn't check this photo just now. Try again in a moment.", 503)
    if not passed:
        # Kept 24 h for review, never shown to the other person
        MeetPhoto.objects.create(
            meet_slug=slug, photographer=user, subject=other, raw_key=raw_key, raw_sha256=clean.sha256,
            status=Status.MODERATION_FAILED, decided_at=timezone.now(),
        )
        raise MeetPhotoError("MODERATION_FAILED", CANT_USE, 422)

    picture = open_jpeg(clean.jpeg)
    for variant in ("story", "og"):
        store.put(f"{folder}/{variant}.jpg", meet_photo_card.render_jpeg(meet, picture, variant))

    try:
        with transaction.atomic():
            if draft is None:
                photo = MeetPhoto.objects.create(
                    meet_slug=slug, active_slug=slug, photographer=user, subject=other,
                    raw_key=raw_key, raw_sha256=clean.sha256, status=Status.DRAFT,
                )
            else:
                photo = MeetPhoto.objects.select_for_update().get(pk=draft.pk)
                if photo.status != Status.DRAFT:
                    raise MeetPhotoError("PHOTO_EXISTS", "This meet already has a photo.", 409, photo_status=photo.status)
                old_key = photo.raw_key
                photo.raw_key, photo.raw_sha256 = raw_key, clean.sha256
                photo.retakes += 1
                photo.save(update_fields=["raw_key", "raw_sha256", "retakes"])
                transaction.on_commit(lambda: delete_private(_private_keys(old_key)))
    except (IntegrityError, MeetPhotoError) as e:
        delete_private(_private_keys(raw_key))
        if isinstance(e, MeetPhotoError):
            raise
        raise MeetPhotoError("PHOTO_EXISTS", "This meet already has a photo.", 409)
    logger.info("meet_photos.uploaded slug=%s photo=%s by=%s retakes=%s", slug, photo.pk, user.user_id, photo.retakes)
    return photo


def send(slug, user):
    """POST …/photo/send: the draft goes to the other person, who has 24 hours to answer."""
    meet, other = participants(slug, user)
    with transaction.atomic():
        photo = MeetPhoto.objects.select_for_update().filter(active_slug=slug).first()
        if photo is None or photo.status != Status.DRAFT or photo.photographer_id != user.user_id:
            raise MeetPhotoError("NO_DRAFT", "There's no photo to send.", 409)
        photo.status = Status.PENDING
        photo.sent_at = timezone.now()
        photo.save(update_fields=["status", "sent_at"])
        transaction.on_commit(lambda: _after_send(photo, user, other))
    _release_lock(slug, user)
    logger.info("meet_photos.sent slug=%s photo=%s", slug, photo.pk)
    return photo


def _after_send(photo, photographer, subject):
    realtime.publish([subject.user_id], _event(photo.meet_slug, "pending", photo=photo, by=photographer))
    _push(subject, f"@{photographer.username} took your Proof of Meet photo", photo)


# ── The subject's answer ─────────────────────────────────────────────────

def decide(slug, user, approve: bool):
    """POST …/photo/decision: only the subject answers, once, within 24 hours."""
    meet, other = participants(slug, user)
    photo = MeetPhoto.objects.filter(active_slug=slug).select_related("photographer", "subject").first()
    if photo is None or photo.status != Status.PENDING:
        raise MeetPhotoError("NOT_PENDING", "There's no photo waiting for you.", 409,
                             photo_status=photo.status if photo else "none")
    if photo.subject_id != user.user_id:
        raise MeetPhotoError("ONLY_SUBJECT", f"@{other.username} decides on this photo.", 403)
    if _overdue(photo):
        _expire(photo)
        raise MeetPhotoError("EXPIRED", "This request expired.", 410)

    if not approve:
        with transaction.atomic():
            locked = _lock_pending(photo.pk)
            locked.status = Status.REJECTED
            locked.active_slug = None
            locked.decided_at = timezone.now()
            locked.save(update_fields=["status", "active_slug", "decided_at"])
            transaction.on_commit(lambda: _after_reject(locked))
        logger.info("meet_photos.rejected slug=%s photo=%s", slug, photo.pk)
        return locked

    store = private_store()
    if store is None:
        raise MeetPhotoError("PHOTOS_UNAVAILABLE", UNAVAILABLE, 503)
    try:
        passed = moderation.image_passes(store.signed_url(photo.raw_key), ref=slug)
    except moderation.ModerationUnavailable:
        raise MeetPhotoError("MODERATION_UNAVAILABLE", "We couldn't check this photo just now. Try again in a moment.", 503)
    if not passed:
        with transaction.atomic():
            locked = _lock_pending(photo.pk)
            locked.status = Status.MODERATION_FAILED
            locked.active_slug = None
            locked.decided_at = timezone.now()
            locked.save(update_fields=["status", "active_slug", "decided_at"])
            transaction.on_commit(lambda: _after_moderation_failed(locked))
        logger.info("meet_photos.moderation_failed slug=%s photo=%s", slug, photo.pk)
        raise MeetPhotoError("MODERATION_FAILED", CANT_USE, 422)

    picture = open_jpeg(store.get(photo.raw_key))
    cards = {variant: meet_photo_card.render_jpeg(meet, picture, variant) for variant in ("story", "og")}
    with transaction.atomic():
        locked = _lock_pending(photo.pk)
        try:
            for variant, data in cards.items():
                put_public(public_key(slug, variant), data)
        except Exception:
            logger.error("meet_photos.publish_failed slug=%s photo=%s", slug, photo.pk, exc_info=True)
            for variant in cards:
                delete_public(public_key(slug, variant))
            raise MeetPhotoError("STORAGE_ERROR", "Couldn't save the photo just now. Try again in a moment.", 503)
        locked.status = Status.APPROVED
        locked.final_key = public_key(slug, "story")
        locked.decided_at = timezone.now()
        locked.save(update_fields=["status", "final_key", "decided_at"])
        transaction.on_commit(lambda: _after_approve(locked))
    logger.info("meet_photos.approved slug=%s photo=%s", slug, photo.pk)
    return locked


def _lock_pending(pk):
    photo = MeetPhoto.objects.select_for_update().select_related("photographer", "subject").get(pk=pk)
    if photo.status != Status.PENDING:
        raise MeetPhotoError("NOT_PENDING", "There's no photo waiting for you.", 409, photo_status=photo.status)
    return photo


def _after_reject(photo):
    _purge(photo)
    # The subject's own sheet already knows; the photographer's opens with the news
    realtime.publish([photo.photographer_id], _event(photo.meet_slug, "rejected", photo=photo))
    _push(photo.photographer, f"@{photo.subject.username} passed on this one", photo)


def _after_moderation_failed(photo):
    realtime.publish([photo.photographer_id, photo.subject_id], _event(photo.meet_slug, "moderation_failed", photo=photo))
    _push(photo.photographer, CANT_USE, photo)


def _after_approve(photo):
    realtime.publish([photo.photographer_id, photo.subject_id], _event(photo.meet_slug, "approved", photo=photo))
    _enqueue_mint(photo.pk)


def _enqueue_mint(photo_id):
    try:
        from posts.tasks import mint_meet_photo
        mint_meet_photo.delay(photo_id)
    except Exception:
        # The sweep retries approved photos every 10 minutes
        logger.warning("meet_photos.enqueue_failed photo=%s", photo_id, exc_info=True)


# ── Minting and publishing ───────────────────────────────────────────────

def onchain_name(meet) -> str:
    """The metadata's name when it fits Bubblegum's 32 bytes; shorter forms otherwise."""
    a, b = meet.people
    for name in (f"Proof of Meet — @{a.username} × @{b.username}", f"@{a.username} × @{b.username}", "Proof of Meet"):
        if len(name.encode("utf-8")) <= ONCHAIN_NAME_BYTES:
            return name
    return "Proof of Meet"


def _mint_leaf(photo, meet, wallet) -> str:
    body = {"recipient": wallet, "slug": photo.meet_slug, "name": onchain_name(meet), "uri": metadata_url(photo.meet_slug)}
    try:
        response = requests.post(f"{NFT_SERVICE_URL}/mint/meet", json=body, timeout=90)
        data = response.json()
    except Exception as e:
        raise MintError(str(e)) from e
    if not data.get("success") or not data.get("assetId"):
        raise MintError(data.get("error") or f"HTTP {response.status_code}")
    return data["assetId"]


def mint(photo_id):
    """
    Mint the missing leaves of an approved (or already live) photo, one per
    person with a wallet; publish once the first exists. Safe to run again:
    a leaf that exists is never minted twice, and runs don't overlap.
    """
    guard = f"meet_photo_mint:{photo_id}"
    if not cache.add(guard, 1, 300):
        return
    try:
        photo = MeetPhoto.objects.select_related("photographer", "subject").filter(pk=photo_id).first()
        if photo is None or photo.status not in (Status.APPROVED, Status.MINTED):
            return
        meet = load_meet(photo.meet_slug, visible_only=False)
        if meet is None:
            return
        for role in ROLES:
            user = getattr(photo, role)
            if getattr(photo, f"asset_id_{role}") or not user.wallet_address or is_deleted(user) or user.is_baned:
                continue
            try:
                asset_id = _mint_leaf(photo, meet, user.wallet_address)
            except MintError as e:
                logger.warning("meet_photos.mint_failed photo=%s role=%s: %s", photo.pk, role, e)
                continue
            MeetPhoto.objects.filter(pk=photo.pk).update(
                **{f"asset_id_{role}": asset_id, f"wallet_{role}": user.wallet_address},
            )
            logger.info("meet_photos.minted photo=%s role=%s asset=%s", photo.pk, role, asset_id)
        photo.refresh_from_db()
        if photo.status == Status.APPROVED and (photo.asset_id_photographer or photo.asset_id_subject):
            publish(photo)
    finally:
        cache.delete(guard)


def mint_for_user(user_id):
    """A person connected a wallet: the leaves they're owed land now."""
    ids = (
        MeetPhoto.objects.filter(status__in=(Status.APPROVED, Status.MINTED))
        .filter(Q(photographer_id=user_id, asset_id_photographer="") | Q(subject_id=user_id, asset_id_subject=""))
        .values_list("pk", flat=True)
    )
    for pk in list(ids):
        mint(pk)


def publish(photo):
    """First leaf minted: the card gets its asset id, and the co-authored post goes up."""
    slug = photo.meet_slug
    meet = load_meet(slug, visible_only=False)
    store = private_store()
    if meet is None or store is None:
        return
    picture = open_jpeg(store.get(photo.raw_key))
    cards = {variant: meet_photo_card.render_jpeg(meet, picture, variant) for variant in ("story", "og")}
    with transaction.atomic():
        locked = MeetPhoto.objects.select_for_update().select_related("photographer", "subject").get(pk=photo.pk)
        if locked.status != Status.APPROVED:
            return  # taken down meanwhile
        for variant, data in cards.items():
            put_public(public_key(slug, variant), data)
        post = Post.objects.create(
            owner=locked.photographer,
            co_author=locked.subject,
            meet_slug=slug,
            about="",
            location=None,  # the card shows the city already (and never coordinates)
            is_approved=True,
            moderation_status="approved",  # checked twice already
            is_nft=False,
        )
        PostsMedia.objects.create(post=post, file=public_key(slug, "story"))
        locked.post = post
        locked.status = Status.MINTED
        locked.save(update_fields=["post", "status"])
        User.all_objects.filter(user_id__in=[locked.photographer_id, locked.subject_id]).update(
            post_count=F("post_count") + 1,
        )
        transaction.on_commit(lambda: _after_publish(locked))
    logger.info("meet_photos.live slug=%s photo=%s post=%s", slug, photo.pk, post.pk)


def _after_publish(photo):
    realtime.publish([photo.photographer_id, photo.subject_id], _event(photo.meet_slug, "minted", photo=photo))
    _push(photo.photographer, f"@{photo.subject.username} said yes — your Proof of Meet is live", photo)


# ── Takedown, expiry, clean-up ───────────────────────────────────────────

TAKE_DOWN_STATUSES = (Status.PENDING, Status.APPROVED, Status.MINTED)


def take_down(slug, user):
    """POST …/photo/takedown: either person, any time, whoever blocked whom."""
    participants(slug, user, strict=False)
    with transaction.atomic():
        photo = (
            MeetPhoto.objects.select_for_update().select_related("photographer", "subject", "post")
            .filter(meet_slug=slug, status__in=TAKE_DOWN_STATUSES)
            .filter(Q(photographer=user) | Q(subject=user))
            .order_by("-created_at", "-id").first()
        )
        if photo is None:
            done = MeetPhoto.objects.filter(meet_slug=slug, status=Status.TAKEN_DOWN).filter(
                Q(photographer=user) | Q(subject=user)).first()
            if done is not None:
                return done
            raise _not_found()
        _take_down_locked(photo)
    logger.info("meet_photos.taken_down slug=%s photo=%s by=%s", slug, photo.pk, user.user_id)
    return photo


def _take_down_locked(photo):
    """Inside a transaction, with the row locked."""
    was_public = photo.status in (Status.APPROVED, Status.MINTED)
    post_id = photo.post_id
    photo.status = Status.TAKEN_DOWN
    photo.taken_down_at = timezone.now()
    photo.post = None
    photo.save(update_fields=["status", "taken_down_at", "post"])
    if post_id:
        Post.all_objects.filter(pk=post_id).delete()
        User.all_objects.filter(user_id__in=[photo.photographer_id, photo.subject_id]).update(
            post_count=Greatest(F("post_count") - 1, Value(0)),
        )
    if was_public:
        _restore_v1_card(photo.meet_slug)
    transaction.on_commit(lambda: _after_take_down(photo))


def _restore_v1_card(slug):
    """story.jpg / og.jpg become the v1 card; if that can't be written, they're deleted."""
    meet = load_meet(slug, visible_only=False)
    for variant in ("story", "og"):
        key = public_key(slug, variant)
        try:
            png = meet_card.get_card_png(meet, variant)[0] if meet else meet_card.not_found_png(variant)
            put_public(key, meet_photo_card.png_to_jpeg(png))
        except Exception:
            logger.error("meet_photos.restore_failed slug=%s variant=%s", slug, variant, exc_info=True)
            delete_public(key)


def _after_take_down(photo):
    _purge(photo)
    realtime.publish([photo.photographer_id, photo.subject_id], _event(photo.meet_slug, "taken_down", photo=photo))


def take_down_all_for(user):
    """Account deletion: every photo the person is in goes down; unsent drafts are discarded."""
    rows = MeetPhoto.objects.filter(Q(photographer=user) | Q(subject=user))
    for pk in list(rows.filter(status__in=TAKE_DOWN_STATUSES).values_list("pk", flat=True)):
        with transaction.atomic():
            photo = MeetPhoto.objects.select_for_update().get(pk=pk)
            if photo.status in TAKE_DOWN_STATUSES:
                _take_down_locked(photo)
    for photo in rows.filter(status=Status.DRAFT):
        _expire(photo)


def expire_between(user_id, other_id):
    """A block: requests between the two expire; a live photo stays until someone takes it down."""
    rows = MeetPhoto.objects.filter(status__in=(Status.DRAFT, Status.PENDING)).filter(
        Q(photographer_id=user_id, subject_id=other_id) | Q(photographer_id=other_id, subject_id=user_id))
    for photo in rows:
        cache.delete(lock_key(photo.meet_slug))
        _expire(photo)


def _expire(photo, now=None):
    """draft/pending → expired. A draft never reached anyone, so its files go now."""
    now = now or timezone.now()
    updated = MeetPhoto.objects.filter(pk=photo.pk, status__in=(Status.DRAFT, Status.PENDING)).update(
        status=Status.EXPIRED, active_slug=None, decided_at=now,
    )
    if not updated:
        return
    was_draft = photo.status == Status.DRAFT
    photo.status, photo.active_slug, photo.decided_at = Status.EXPIRED, None, now
    if was_draft:
        _purge(photo)
    else:
        realtime.publish([photo.photographer_id, photo.subject_id], _event(photo.meet_slug, "expired", photo=photo))


def _expire_overdue(slug):
    for photo in MeetPhoto.objects.filter(meet_slug=slug, status=Status.PENDING):
        if _overdue(photo):
            _expire(photo)


def _purge(photo):
    if photo.purged_at or not photo.raw_key:
        return
    if delete_private(_private_keys(photo.raw_key)):
        now = timezone.now()
        MeetPhoto.objects.filter(pk=photo.pk).update(purged_at=now)
        photo.purged_at = now


def sweep(now=None):
    """Every 10 minutes (Celery beat): expiry, file clean-up and mint retries."""
    now = now or timezone.now()
    for photo in MeetPhoto.objects.filter(status=Status.PENDING, sent_at__lte=now - DECISION_WINDOW):
        _expire(photo, now=now)
    for photo in MeetPhoto.objects.filter(status=Status.DRAFT, created_at__lte=now - DRAFT_STALE):
        if _lock_holder(photo.meet_slug) != photo.photographer_id:
            _expire(photo, now=now)

    unpurged = MeetPhoto.objects.filter(purged_at__isnull=True).exclude(raw_key="")
    due = (
        Q(status__in=(Status.REJECTED, Status.TAKEN_DOWN))
        | Q(status=Status.EXPIRED, sent_at__isnull=True)
        | Q(status=Status.EXPIRED, decided_at__lte=now - EXPIRED_KEEP)
        | Q(status=Status.MODERATION_FAILED, decided_at__lte=now - FAILED_KEEP)
    )
    for photo in unpurged.filter(due):
        _purge(photo)

    # Leaves someone can receive now: a wallet, an account in good standing, no leaf yet.
    # Photos nobody can mint for wait for a wallet (SaveWalletAddressView queues those).
    photographer_owed = Q(asset_id_photographer="", photographer__wallet_address__gt="",
                          photographer__is_baned=False)
    subject_owed = Q(asset_id_subject="", subject__wallet_address__gt="", subject__is_baned=False)
    owed = MeetPhoto.objects.filter(status__in=(Status.APPROVED, Status.MINTED)).filter(
        photographer_owed | subject_owed)
    for pk in list(owed.order_by("decided_at").values_list("pk", flat=True)[:SWEEP_MINT_BATCH]):
        mint(pk)


# ── Caption and profile visibility ───────────────────────────────────────

def _live_for(slug, user):
    participants(slug, user, strict=False)
    photo = MeetPhoto.objects.filter(meet_slug=slug, status=Status.MINTED).filter(
        Q(photographer=user) | Q(subject=user)).first()
    if photo is None or photo.post_id is None:
        raise _not_found()
    return photo


def set_caption(slug, user, text):
    """Either co-author edits the post's caption; the last edit wins."""
    text = (text or "").strip()
    if len(text) > CAPTION_MAX:
        raise MeetPhotoError("CAPTION_TOO_LONG", f"Captions can be {CAPTION_MAX} characters at most.", 400)
    photo = _live_for(slug, user)
    try:
        if not moderation.text_passes(text, ref=f"{slug}-caption"):
            raise MeetPhotoError("CAPTION_REJECTED", "This caption can't be used.", 422)
    except moderation.ModerationUnavailable:
        raise MeetPhotoError("MODERATION_UNAVAILABLE", "We couldn't check this caption just now. Try again in a moment.", 503)
    Post.all_objects.filter(pk=photo.post_id).update(about=text)
    return photo


def set_hidden(slug, user, hidden: bool):
    """Hide the post from your own profile; the other person's profile keeps it."""
    photo = _live_for(slug, user)
    field = f"hidden_by_{_role(photo, user)}"
    MeetPhoto.objects.filter(pk=photo.pk).update(**{field: bool(hidden)})
    setattr(photo, field, bool(hidden))
    return photo


# ── Notifications ────────────────────────────────────────────────────────

def _event(slug, status, photo=None, by=None) -> dict:
    """The socket envelope: a hint to refetch GET …/photo, never the data itself."""
    event = {"type": "meet_photo", "slug": slug, "status": status}
    if photo is not None:
        event["photo_id"] = photo.pk
    if by is not None:
        event["by"] = {"user_id": by.user_id, "username": by.username}
    return event


def _push(user, body, photo):
    token = getattr(user, "expo_push_token", None)
    if not token:
        return
    threading.Thread(target=_send_push, args=(token, body, photo.meet_slug, photo.status), daemon=True).start()


def _send_push(token, body, slug, status):
    try:
        # Older app versions open the meet sheet from `url`; newer ones read `type`
        send_push(token=token, title=PUSH_TITLE, body=body, link=meet_url(slug),
                  extra_data={"type": "meet_photo", "slug": slug, "status": status})
    except Exception:
        logger.warning("meet_photos.push_failed slug=%s", slug, exc_info=True)


# ── API shapes ───────────────────────────────────────────────────────────

def _avatar(user):
    """The avatar URL, the default one included (the app shows it like everywhere else)."""
    name = (user.avatar.name if user.avatar else "") or ""
    if is_deleted(user) or not name:
        return None
    return og.public_file_url(name)


def user_brief(user):
    return {
        "user_id": user.user_id,
        "username": user.username,
        "avatar": _avatar(user),
        "seeker_verified": bool(user.seeker_verified),
        "official": bool(user.official),
    }


def _previews(photo, viewer):
    """(story, og) URLs this viewer may see: signed private ones before approval, public after."""
    role = _role(photo, viewer)
    if photo.status in (Status.APPROVED, Status.MINTED):
        version = photo_version(photo)
        return public_url(photo.meet_slug, "story", version), public_url(photo.meet_slug, "og", version)
    visible = photo.status == Status.PENDING or (photo.status == Status.DRAFT and role == "photographer")
    store = private_store()
    if not visible or store is None or photo.purged_at:
        return None, None
    folder = _folder(photo.raw_key)
    return store.signed_url(f"{folder}/story.jpg"), store.signed_url(f"{folder}/og.jpg")


def photo_payload(photo, viewer):
    role = _role(photo, viewer)
    story, og_url = _previews(photo, viewer)
    mine = getattr(photo, f"asset_id_{role}")
    return {
        "id": photo.pk,
        "status": photo.status,
        "role": role,
        "photographer": user_brief(photo.photographer),
        "subject": user_brief(photo.subject),
        "preview_url": story,
        "og_preview_url": og_url,
        "sent_at": photo.sent_at,
        "expires_at": photo.sent_at + DECISION_WINDOW if photo.status == Status.PENDING and photo.sent_at else None,
        "decided_at": photo.decided_at,
        "retakes_left": max(0, MAX_RETAKES - photo.retakes) if photo.status == Status.DRAFT else 0,
        "minting": photo.status == Status.APPROVED,
        "asset_ids": {r: getattr(photo, f"asset_id_{r}") or None for r in ROLES},
        "my_asset_id": mine or None,
        # Minted for the other person already; theirs lands when they connect a wallet
        "waiting_for_wallet": photo.status in (Status.APPROVED, Status.MINTED) and not mine and not viewer.wallet_address,
        "post_id": photo.post_id,
        "hidden": getattr(photo, f"hidden_by_{role}"),
    }


def state(slug, viewer):
    """GET …/photo: where this meet's photo stands, for either of the two."""
    meet, other = participants(slug, viewer)
    _expire_overdue(slug)
    photos = list(_photos(slug))
    # The subject never learns about drafts or photos that were never sent
    seen = [p for p in photos if p.photographer_id == viewer.user_id or p.sent_at]
    current = seen[0] if seen else None
    holder = _lock_holder(slug)
    active = _active(photos)
    taking = None
    if holder in (viewer.user_id, other.user_id):
        taking = {"user_id": holder, "username": viewer.username if holder == viewer.user_id else other.username,
                  "mine": holder == viewer.user_id}
    if active is None:
        free = True
    elif active.status == Status.DRAFT:
        # Your own draft, or theirs from a session that ended without sending
        free = active.photographer_id == viewer.user_id or holder != active.photographer_id
    else:
        free = False
    can_start = (
        is_available() and free and (taking is None or taking["mine"])
        and _rejections(photos) < MAX_REJECTIONS and _uploads_used(photos) < MAX_UPLOADS
    )
    return {
        "slug": slug,
        "available": is_available(),
        "status": current.status if current else "none",
        "photo": photo_payload(current, viewer) if current else None,
        "other": user_brief(other),
        "taking": taking,
        "can_start": can_start,
        "rejections_left": max(0, MAX_REJECTIONS - _rejections(photos)),
        "uploads_left": max(0, MAX_UPLOADS - _uploads_used(photos)),
    }


def pending_for(user):
    """Photos waiting for this person's answer (the consent sheet on app start)."""
    since = timezone.now() - DECISION_WINDOW
    hidden = blocked_user_ids(user)
    rows = (
        MeetPhoto.objects.filter(subject=user, status=Status.PENDING, sent_at__gt=since)
        .exclude(photographer_id__in=hidden)
        .select_related("photographer", "subject").order_by("-sent_at")[:10]
    )
    return [{"slug": p.meet_slug, **photo_payload(p, user)} for p in rows if not p.photographer.is_baned]


def my_photos(user):
    """Settings → Proof of Meet: every photo you're in, to take down. Blocked people stay anonymous."""
    hidden = blocked_user_ids(user)
    rows = (
        MeetPhoto.objects.filter(Q(photographer=user) | Q(subject=user))
        .filter(status__in=(Status.PENDING, Status.APPROVED, Status.MINTED, Status.TAKEN_DOWN))
        .select_related("photographer", "subject").order_by("-created_at", "-id")[:100]
    )
    out = []
    for photo in rows:
        role = _role(photo, user)
        other = photo.subject if role == "photographer" else photo.photographer
        visible = other.user_id not in hidden
        story = public_url(photo.meet_slug, "story", photo_version(photo)) if photo.status in (
            Status.APPROVED, Status.MINTED) else None
        out.append({
            "slug": photo.meet_slug,
            "id": photo.pk,
            "status": photo.status,
            "role": role,
            "other": user_brief(other) if visible and not is_deleted(other) else None,
            "preview_url": story if visible else None,
            "created_at": photo.created_at,
            "taken_down_at": photo.taken_down_at,
            "post_id": photo.post_id,
            "asset_ids": {r: getattr(photo, f"asset_id_{r}") or None for r in ROLES},
        })
    return out


# ── cNFT metadata (/meta/meet/<slug>.json) ───────────────────────────────

def metadata(slug):
    """
    The off-chain JSON both cNFTs point to, or None. Served from approval on
    (a leaf can be indexed seconds after it's minted). After a takedown the
    image is the v1 card and nothing mentions the photo.
    """
    photo = (
        MeetPhoto.objects.filter(meet_slug=slug, status__in=(Status.APPROVED, Status.MINTED, Status.TAKEN_DOWN))
        .exclude(final_key="").select_related("photographer", "subject").order_by("-created_at", "-id").first()
    )
    if photo is None:
        return None
    meet = load_meet(slug, visible_only=False)
    if meet is None:
        return None
    a, b = meet.people
    selfie = photo.status != Status.TAKEN_DOWN
    local = local_time(meet)
    date_text = f"{local:%b} {local.day}, {local.year}"
    how = f"at {meet.event_name}" if meet.event_name else "in person"
    where = f" in {meet.city}" if meet.city else ""
    image = public_url(slug, "story")
    attributes = [
        {"trait_type": "Type", "value": "Proof of Meet"},
        {"trait_type": "Tier", "value": TIER_NAMES.get(meet.tier, TIER_LABELS.get(meet.tier, meet.tier))},
        {"trait_type": "Participant A", "value": a.username},
        {"trait_type": "Participant B", "value": b.username},
        {"trait_type": "Photographer", "value": photo.photographer.username},
        {"trait_type": "City", "value": meet.city or "—"},
        {"trait_type": "Date", "value": local.date().isoformat()},
        {"trait_type": "Event", "value": meet.event_name or "—"},
        {"trait_type": "Pair meeting #", "value": meet.pair_count},
    ]
    if selfie:
        attributes.append({"trait_type": "Selfie", "value": "Yes"})

    def co_author(user, wallet, role):
        return {"username": user.username, "wallet": (wallet or None) if not is_deleted(user) else None, "role": role}

    properties = {
        "category": "image",
        "files": [{"uri": image, "type": "image/jpeg"}],
        "co_authors": [
            co_author(photo.photographer, photo.wallet_photographer, "photographer"),
            co_author(photo.subject, photo.wallet_subject, "subject"),
        ],
        "meet_slug": slug,
    }
    if selfie:
        properties["photo_sha256"] = photo.raw_sha256
    return {
        "name": f"Proof of Meet — @{a.username} × @{b.username}",
        "symbol": "NVMEET",
        "description": f"@{a.username} and @{b.username} met {how}{where} on {date_text}. "
                       f"Recorded by a phone-to-phone tap on NextVibe.",
        "image": image,
        "external_url": meet_url(slug),
        "attributes": attributes,
        "properties": properties,
    }


# ── Posts ────────────────────────────────────────────────────────────────

def post_meet_fields(post) -> dict:
    """
    What every post payload adds for Proof of Meet posts: the type, the
    co-author (the header reads "@owner with @co_author") and no Collect.
    """
    if not post.meet_slug:
        return {"post_type": "post", "co_author": None, "meet_slug": None, "collectable": True}
    co_author = post.co_author
    return {
        "post_type": "proof_of_meet",
        "co_author": user_brief(co_author) if co_author is not None else None,
        "meet_slug": post.meet_slug,
        # The cNFT is only for the two people who met: nobody collects their faces
        "collectable": False,
    }


def on_profile_q(user_id) -> Q:
    """
    Posts a profile shows: the person's own, plus Proof of Meet posts they're
    the co-author of. Either of the two can hide one from their own profile.
    """
    return (
        (Q(owner__user_id=user_id) & ~Q(meet_photos__hidden_by_photographer=True))
        | (Q(co_author__user_id=user_id) & ~Q(meet_photos__hidden_by_subject=True))
    )


def post_for_meet(post, user):
    """The MeetPhoto behind a Proof of Meet post, when `user` is one of its two people."""
    if not post.meet_slug:
        return None
    return MeetPhoto.objects.filter(post=post).filter(Q(photographer=user) | Q(subject=user)).first()
