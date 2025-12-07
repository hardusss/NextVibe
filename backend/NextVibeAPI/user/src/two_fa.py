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

    def create_2fa(self, email: str) -> Tuple[str, str]:
        """
        Generates a QR code for two-factor authentication (2FA)
        and saves it to R2 storage.
        
        Args:
            email (str): The email address associated with the 2FA account.
        
        Returns:
            Tuple[str, str]: A tuple containing the secret key and the path to the saved QR code.
        """
        from .cloudflare_save_media import save_file_to_storage  # Import function
        
        issuer_name: str = "NextVibe"
        otp_auth_url: str = self.totp.provisioning_uri(email, issuer_name=issuer_name)
        
        # Generate QR code
        qr = qrcode.make(otp_auth_url)

        qr_buffer = BytesIO()
        qr.save(qr_buffer, format='PNG')
        qr_buffer.seek(0)  
        
        # Save to R2
        qr_filename = f"{email}_qrcode.png"
        file_path = save_file_to_storage(
            file=qr_buffer,
            filename=qr_filename,
            folder="qrcodes",
            is_qr=True,
            email=email
        )
        
        from django.conf import settings
        qr_url = f"https://{settings.AWS_S3_CUSTOM_DOMAIN}/{file_path}"
        
        return self.secretConnectKey, qr_url

    def auth(self, code: int) -> bool:
        return self.totp.verify(code)