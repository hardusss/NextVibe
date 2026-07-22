from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional
import datetime
from db import SessionLocal
from src.models import User, Chat, Message, UserDevice, SignedPreKey, OneTimePreKey
from auth import auth_jwt

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization.split(" ")[1]
    auth_user = auth_jwt(token)
    if not auth_user["auth"] or auth_user["token_type"] != "access":
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return auth_user["user_id"]


class SignedPreKeySchema(BaseModel):
    key_id: int
    public_key: str
    signature: str

class OneTimePreKeySchema(BaseModel):
    key_id: int
    public_key: str

class RegisterDeviceRequest(BaseModel):
    device_id: str
    identity_key: str
    registration_id: int = 1
    signed_prekey: SignedPreKeySchema
    one_time_prekeys: List[OneTimePreKeySchema] = []

class MessageReportRequest(BaseModel):
    chat_id: int
    message_id: int
    decrypted_content: str
    reason: str = "abuse"
    signature: Optional[str] = None


@router.post("/keys/register-device")
async def register_device(
    req: RegisterDeviceRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    device = db.query(UserDevice).filter(
        UserDevice.user_id == user_id,
        UserDevice.device_id == req.device_id
    ).first()

    if not device:
        device = UserDevice(
            user_id=user_id,
            device_id=req.device_id,
            identity_key=req.identity_key,
            registration_id=req.registration_id,
            created_at=datetime.datetime.utcnow()
        )
        db.add(device)
        db.commit()
        db.refresh(device)
    else:
        device.identity_key = req.identity_key
        device.registration_id = req.registration_id
        db.commit()

    # Upsert SignedPreKey
    spk = db.query(SignedPreKey).filter(
        SignedPreKey.device_id == device.id,
        SignedPreKey.key_id == req.signed_prekey.key_id
    ).first()
    if not spk:
        spk = SignedPreKey(
            device_id=device.id,
            key_id=req.signed_prekey.key_id,
            public_key=req.signed_prekey.public_key,
            signature=req.signed_prekey.signature
        )
        db.add(spk)
    else:
        spk.public_key = req.signed_prekey.public_key
        spk.signature = req.signed_prekey.signature
    db.commit()

    # Add OneTimePreKeys
    for otk in req.one_time_prekeys:
        existing_otk = db.query(OneTimePreKey).filter(
            OneTimePreKey.device_id == device.id,
            OneTimePreKey.key_id == otk.key_id
        ).first()
        if not existing_otk:
            db.add(OneTimePreKey(
                device_id=device.id,
                key_id=otk.key_id,
                public_key=otk.public_key,
                is_used=False
            ))
    db.commit()

    return {"status": "success", "device_id": req.device_id}


@router.get("/keys/prekey/{target_user_id}")
async def get_prekey_bundle(
    target_user_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    devices = db.query(UserDevice).filter(UserDevice.user_id == target_user_id).all()
    if not devices:
        raise HTTPException(status_code=404, detail="No registered devices found for user")

    device_bundles = []
    for dev in devices:
        spk = db.query(SignedPreKey).filter(SignedPreKey.device_id == dev.id).order_by(SignedPreKey.id.desc()).first()
        if not spk:
            continue

        # Claim one unused one-time prekey
        otk = db.query(OneTimePreKey).filter(
            OneTimePreKey.device_id == dev.id,
            OneTimePreKey.is_used == False
        ).first()

        otk_dict = None
        if otk:
            otk.is_used = True
            db.commit()
            otk_dict = {
                "key_id": otk.key_id,
                "public_key": otk.public_key
            }

        device_bundles.append({
            "device_id": dev.device_id,
            "identity_key": dev.identity_key,
            "registration_id": dev.registration_id,
            "signed_prekey": {
                "key_id": spk.key_id,
                "public_key": spk.public_key,
                "signature": spk.signature
            },
            "one_time_prekey": otk_dict
        })

    return {
        "user_id": target_user_id,
        "devices": device_bundles
    }


@router.post("/chat/report-message")
async def report_message(
    req: MessageReportRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    chat = db.query(Chat).filter(Chat.id == req.chat_id).first()
    if not chat or user_id not in [u.user_id for u in chat.participants]:
        raise HTTPException(status_code=403, detail="Not authorized")

    message = db.query(Message).filter(Message.id == req.message_id, Message.chat_id == req.chat_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    return {
        "status": "reported",
        "message_id": req.message_id,
        "reason": req.reason,
        "submitted_by": user_id,
        "timestamp": datetime.datetime.utcnow().isoformat()
    }
