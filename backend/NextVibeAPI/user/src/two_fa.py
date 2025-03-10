import os
import base64
import qrcode
import pyotp
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
        
    def create_2fa(self, email: str) -> Tuple[str]:
        """
        Generates a QR code for two-factor authentication (2FA)
        and saves it to the Media directory.

        Args:
            email (str): The email address associated with the 2FA account.

        Raises:
            ValueError: If the SECRET_KEY is not found in the .env file.

        Returns:
            Tuple[str, str]: A tuple containing the secret key and the path to the saved QR code.
        """

        issuer_name: str = "NextVibe"
        otp_auth_url: str = self.totp.provisioning_uri(email, issuer_name=issuer_name)

        qr = qrcode.make(otp_auth_url)

        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  
        media_folder = os.path.join(base_dir, "Media", "qrcodes")
        
        # Create foleder if not created
        os.makedirs(media_folder, exist_ok=True)

        qr_filename: str = f"{email}_qrcode.png"
        qr_path = os.path.join(media_folder, qr_filename)

        qr.save(qr_path)

        return self.secretConnectKey, f"/media/qrcodes/{qr_filename}"
    
    def auth(self, code: int) -> bool:
        return self.totp.verify(code)


