import os
import base64
import qrcode
import pyotp
from io import BytesIO
from dotenv import load_dotenv
from typing import Tuple

load_dotenv()


class TwoFA: 
    def __init__(self, secret_key=None) -> None:
        if secret_key:
            self.secretConnectKey = secret_key
        else:
            self.secretConnectKey = base64.b32encode(os.urandom(10)).decode('utf-8')
        self.totp = pyotp.TOTP(self.secretConnectKey)

    def qr_data_uri(self, email: str) -> str:
        """
        The authenticator QR code as a PNG data URI. It holds the secret, so it
        is generated on request and never stored.
        """
        otp_auth_url: str = self.totp.provisioning_uri(email, issuer_name="NextVibe")
        buffer = BytesIO()
        qrcode.make(otp_auth_url).save(buffer, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")

    def create_2fa(self, email: str) -> Tuple[str, str]:
        """A new secret and its QR code (data URI)."""
        return self.secretConnectKey, self.qr_data_uri(email)

    def auth(self, code: int) -> bool:
        return self.totp.verify(code)
