"""
Device public keys for end-to-end encrypted chats (message format v3, see
frontend/NextVibe/src/services/e2ee/core.ts).

- POST /api/v2/e2ee/devices            {device_id, public_key}: publish this install's key
- GET  /api/v2/e2ee/devices?user_ids=  the keys of up to 20 people, to seal a message for all their devices

Public keys only: the secret keys never leave the phones, so the server can't
read v3 messages. The phones compare a safety number made from these keys.
"""
import base64
import binascii
import datetime
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.keys import get_current_user, get_db
from src.models import E2EEDevice

router = APIRouter()

DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
MAX_DEVICES_PER_USER = 10
MAX_USERS_PER_LOOKUP = 20


class RegisterDeviceRequest(BaseModel):
    device_id: str
    public_key: str


def _valid_public_key(value: str) -> bool:
    if not isinstance(value, str) or len(value) != 44:
        return False
    try:
        return len(base64.b64decode(value, validate=True)) == 32
    except (binascii.Error, ValueError):
        return False


@router.post("/e2ee/devices")
async def register_device(
    req: RegisterDeviceRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not DEVICE_ID_RE.match(req.device_id or ""):
        raise HTTPException(status_code=400, detail="device_id must be 8-64 letters, digits, - or _")
    if not _valid_public_key(req.public_key):
        raise HTTPException(status_code=400, detail="public_key must be a base64 32-byte key")

    now = datetime.datetime.utcnow()
    device = db.query(E2EEDevice).filter(
        E2EEDevice.user_id == user_id, E2EEDevice.device_id == req.device_id
    ).first()
    if device:
        # A device id stays bound to its key; a new key comes with a new device id
        if device.public_key != req.public_key:
            raise HTTPException(status_code=409, detail="This device id already has another key")
        device.last_seen_at = now
    else:
        db.add(E2EEDevice(user_id=user_id, device_id=req.device_id, public_key=req.public_key,
                          created_at=now, last_seen_at=now))
        db.flush()
        # Keep the most recently seen devices; messages stop being sealed for the rest
        stale = (db.query(E2EEDevice).filter(E2EEDevice.user_id == user_id)
                 .order_by(E2EEDevice.last_seen_at.desc(), E2EEDevice.id.desc())
                 .offset(MAX_DEVICES_PER_USER).all())
        for old in stale:
            db.delete(old)
    db.commit()
    return {"device_id": req.device_id}


@router.get("/e2ee/devices")
async def list_devices(
    user_ids: str = Query(..., description="comma-separated user ids"),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        ids = list(dict.fromkeys(int(part) for part in user_ids.split(",") if part.strip()))
    except ValueError:
        raise HTTPException(status_code=400, detail="user_ids must be numbers")
    if not ids or len(ids) > MAX_USERS_PER_LOOKUP:
        raise HTTPException(status_code=400, detail=f"Ask for 1 to {MAX_USERS_PER_LOOKUP} users")

    devices = {str(uid): [] for uid in ids}
    rows = db.query(E2EEDevice).filter(E2EEDevice.user_id.in_(ids)).order_by(E2EEDevice.id).all()
    for row in rows:
        devices[str(row.user_id)].append({"device_id": row.device_id, "public_key": row.public_key})
    return {"devices": devices}
