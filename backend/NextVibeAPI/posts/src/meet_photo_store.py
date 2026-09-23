"""
Where Proof of Meet photos live.

Private: raw uploads and previews, meet-photos/<slug>/<nonce>/{raw,story,og}.jpg,
in an R2 bucket that is never public (settings.MEET_PHOTO_BUCKET, env
R2_PRIVATE_BUCKET_NAME). The app and the moderation service only get signed
URLs that expire after 10 minutes. Without that bucket the feature is off
(uploads answer 503): nothing ever falls back to the public bucket.
settings.MEET_PHOTO_LOCAL_DIR keeps them on disk instead, for tests and
local runs, with URLs signed for MeetPhotoFileView.

Public: the composited card, only once both people approved:
meet/<slug>/story.jpg and og.jpg in the normal media bucket, at the stable
URL the cNFT metadata points to. Cached for 5 minutes, so a takedown, which
replaces both files with the v1 card, reaches Cloudflare's edge quickly.
"""
import logging
from functools import lru_cache
from pathlib import Path

import boto3
from botocore.config import Config
from django.conf import settings
from django.core import signing
from django.core.files.base import ContentFile
from django.core.files.storage import storages

from user.src import og_image as og

logger = logging.getLogger("posts.meet_photos")

SIGNED_URL_SECONDS = 600
PUBLIC_CACHE_CONTROL = "public, max-age=300"
FILE_SALT = "nextvibe.meet_photo_file"
JPEG = "image/jpeg"


# ── Private ──────────────────────────────────────────────────────────────

class R2PrivateStore:
    def __init__(self, bucket):
        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name="auto",
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    def put(self, key, data: bytes):
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=JPEG, CacheControl="private, no-store")

    def get(self, key) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def delete(self, key):
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def signed_url(self, key) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key, "ResponseContentType": JPEG},
            ExpiresIn=SIGNED_URL_SECONDS,
        )


class LocalPrivateStore:
    """Files on disk; signed URLs point at MeetPhotoFileView."""

    def __init__(self, root):
        self.root = Path(root)

    def _path(self, key) -> Path:
        path = (self.root / key).resolve()
        if self.root.resolve() not in path.parents:
            raise ValueError("key outside the store")
        return path

    def put(self, key, data: bytes):
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get(self, key) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key):
        self._path(key).unlink(missing_ok=True)

    def signed_url(self, key) -> str:
        token = signing.dumps({"k": key}, salt=FILE_SALT, compress=True)
        return f"{settings.PUBLIC_API_URL}/api/v1/meet/photo-file/{token}"

    def key_for_token(self, token):
        """The key a signed URL names, or None when it's forged or older than 10 minutes."""
        try:
            return signing.loads(token, salt=FILE_SALT, max_age=SIGNED_URL_SECONDS)["k"]
        except (signing.BadSignature, KeyError, TypeError):
            return None


@lru_cache(maxsize=4)
def _store_for(bucket, local_dir):
    if bucket:
        return R2PrivateStore(bucket)
    if local_dir:
        return LocalPrivateStore(local_dir)
    return None


def private_store():
    """The private store, or None when the feature isn't configured."""
    return _store_for(settings.MEET_PHOTO_BUCKET, settings.MEET_PHOTO_LOCAL_DIR)


def delete_private(keys):
    """Best effort; returns True when every key is gone."""
    store = private_store()
    if store is None:
        return False
    ok = True
    for key in keys:
        try:
            store.delete(key)
        except Exception:
            ok = False
            logger.warning("meet_photos.private_delete_failed key=%s", key, exc_info=True)
    return ok


# ── Public ───────────────────────────────────────────────────────────────

def public_key(slug, variant) -> str:
    return f"meet/{slug}/{variant}.jpg"


def public_url(slug, variant, version=None) -> str:
    url = og.public_file_url(public_key(slug, variant))
    return f"{url}?v={version}" if version else url


def _public_storage():
    storage = storages["default"]
    try:
        from storages.backends.s3boto3 import S3Boto3Storage
    except ImportError:  # pragma: no cover
        return storage
    if isinstance(storage, S3Boto3Storage):
        # Overwrite in place (the URL is fixed) with a short edge cache
        return type(storage)(file_overwrite=True, object_parameters={"CacheControl": PUBLIC_CACHE_CONTROL})
    return storage


def put_public(key, data: bytes):
    storage = _public_storage()
    if not getattr(storage, "file_overwrite", False) and storage.exists(key):
        storage.delete(key)  # FileSystemStorage would save under a new name
    saved = storage.save(key, ContentFile(data))
    if saved != key:
        raise RuntimeError(f"stored as {saved}, not {key}")


def read_public(key) -> bytes:
    with storages["default"].open(key, "rb") as fh:
        return fh.read()


def delete_public(key):
    try:
        storages["default"].delete(key)
    except Exception:
        logger.warning("meet_photos.public_delete_failed key=%s", key, exc_info=True)
