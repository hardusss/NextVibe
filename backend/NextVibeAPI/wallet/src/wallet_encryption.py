import base64
import os
import json
from typing import Dict, Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class AEADCipherBase:
    """
    Base class for AES-GCM (AEAD) encryption and decryption.

    This class provides shared logic for working with keys, generating nonces,
    and handling Additional Authenticated Data (AAD).
    """

    def __init__(
        self,
        key: Optional[str] = None,
        nonce_size: int = 12,
        key_size: int = 32
    ) -> None:
        """
        Initialize the cipher with a given key or generate a new one.

        Args:
            key (str, optional): AES key in Base64 format. If None, a new key is generated.
            nonce_size (int): Nonce size in bytes (recommended 12 for AES-GCM).
            key_size (int): AES key size in bytes (16=128-bit, 24=192-bit, 32=256-bit).
        """
        self._nonce_size = nonce_size
        self._key: str = key or self.generate_key(key_size)
        self._aesgcm = AESGCM(base64.b64decode(self._key))

    @staticmethod
    def _generate_aad(
        **aad_params: Dict[str, str | int]
    ) -> bytes:
        """
        Generate Additional Authenticated Data (AAD) for encryption.

        Args:
            **aad_params (dict): Key-value parameters (e.g., user_id, token).

        Returns:
            bytes: AAD serialized as JSON in bytes.
        """
        aad_json = json.dumps(aad_params, separators=(",", ":"))
        return aad_json.encode("utf-8")

    @staticmethod
    def generate_key(
        key_size: int = 32
    ) -> str:
        """
        Generate a new AES key in Base64 format.

        Args:
            key_size (int): Key size in bytes (default=32 → AES-256).

        Returns:
            str: Base64-encoded key.
        """
        key = os.urandom(key_size)
        return base64.b64encode(key).decode("utf-8")


class EncryptAEAD(AEADCipherBase):
    """
    AES-GCM encryption class for private keys.
    """

    def encrypt(
        self,
        private_key: str,
        user_id: int,
        token: str
    ) -> str:
        """
        Encrypt a private key using AES-GCM.

        Args:
            private_key (str): Private key in hex format.
            user_id (int): User identifier.
            token (str): Token name (e.g., "SOL").

        Returns:
            str: Encrypted private key in Base64 format.
        """
        nonce: bytes = os.urandom(self._nonce_size)
        aad: bytes = self._generate_aad(user_id=user_id, token=token)
        if private_key[:2] == "0x":
            private_key = private_key.replace("0x", "")

        try:
            bytes.fromhex(private_key)
        except ValueError:
            raise ValueError("Private key must be valid hex string")
    
        if not user_id or not token:
            raise ValueError("user_id or token are required")
        
        ciphertext: bytes = self._aesgcm.encrypt(
            nonce,
            bytes.fromhex(private_key),
            aad
        )

        encrypted: bytes = nonce + ciphertext
        return base64.b64encode(encrypted).decode("utf-8")


class DecryptAEAD(AEADCipherBase):
    """
    AES-GCM decryption class for private keys.
    """

    def decrypt(
        self,
        encrypted_data: str,
        user_id: int,
        token: str
    ) -> str:
        """
        Decrypt a private key using AES-GCM.

        Args:
            encrypted_data (str): Encrypted private key in Base64 format.
            user_id (int): User identifier.
            token (str): Token name.

        Returns:
            str: Decrypted private key in hex format.
        """
        try:
            if not encrypted_data:
                raise ValueError("Encrypted data cannot be empty")
            
            encrypted_bytes = base64.b64decode(encrypted_data)

            if len(encrypted_bytes) <= self._nonce_size:
                raise ValueError("Invalid encrypted data: too short")
            
            nonce = encrypted_bytes[:self._nonce_size]
            ciphertext = encrypted_bytes[self._nonce_size:]
            
            aad = self._generate_aad(user_id=user_id, token=token)

            plaintext = self._aesgcm.decrypt(nonce, ciphertext, aad)
            return plaintext.hex()
            
        except Exception as e:
            raise ValueError(f"Decryption failed: invalid data or parameters")

