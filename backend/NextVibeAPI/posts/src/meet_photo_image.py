"""
Proof of Meet uploads: only JPEG, HEIC or PNG, at most 8 MB. Every upload is
re-encoded before it's stored: the EXIF orientation is applied, then
everything else in the file (EXIF with GPS, XMP, maker notes, ICC) is
dropped, the long side is capped at 2048 px and the result saved as a JPEG.
The sha256 of that stored JPEG goes into the cNFT metadata.
"""
import hashlib
import io
from dataclasses import dataclass
from functools import lru_cache

from PIL import Image, ImageOps

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_SIDE = 2048
MAX_PIXELS = 60_000_000  # a small file can still decode huge
JPEG_QUALITY = 90
# Pillow's names for the accepted types ("MPO" is how some phones' JPEGs open)
ACCEPTED_FORMATS = {"JPEG", "MPO", "PNG", "HEIF"}


class PhotoRejected(Exception):
    def __init__(self, code, message, status):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


@dataclass(frozen=True)
class CleanPhoto:
    jpeg: bytes
    sha256: str
    size: tuple


@lru_cache(maxsize=1)
def _register_heif() -> bool:
    try:
        import pillow_heif
    except ImportError:
        return False
    pillow_heif.register_heif_opener()
    return True


def clean_upload(upload) -> CleanPhoto:
    """The upload (a file-like object) as a stripped JPEG, or PhotoRejected."""
    data = upload.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise PhotoRejected("TOO_LARGE", "This photo is too large (8 MB at most).", 413)
    _register_heif()
    try:
        img = Image.open(io.BytesIO(data))
        fmt = img.format
        if fmt not in ACCEPTED_FORMATS:
            raise PhotoRejected("UNSUPPORTED", "Send a JPEG, HEIC or PNG photo.", 415)
        if img.width * img.height > MAX_PIXELS:
            raise PhotoRejected("TOO_LARGE", "This photo is too large.", 413)
        img.load()
    except PhotoRejected:
        raise
    except Exception:
        raise PhotoRejected("UNSUPPORTED", "Send a JPEG, HEIC or PNG photo.", 415)

    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA", "P"):
        rgba = img.convert("RGBA")
        backing = Image.new("RGB", rgba.size, (11, 7, 20))
        backing.paste(rgba, mask=rgba.split()[-1])
        img = backing
    else:
        img = img.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)

    out = io.BytesIO()
    # Nothing from the original file is passed on: no exif, icc_profile or xmp
    img.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True)
    jpeg = out.getvalue()
    return CleanPhoto(jpeg=jpeg, sha256=hashlib.sha256(jpeg).hexdigest(), size=img.size)


def open_jpeg(data: bytes):
    return Image.open(io.BytesIO(data)).convert("RGB")
