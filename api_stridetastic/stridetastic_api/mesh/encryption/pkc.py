"""Meshtastic PKI encryption/decryption helpers."""

from __future__ import annotations

import base64
import binascii
import os
import logging
from dataclasses import dataclass
from typing import Optional, Union

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.ciphers.aead import AESCCM
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    load_pem_private_key,
)

logger = logging.getLogger(__name__)

PublicKeyLike = Union[bytes, bytearray, memoryview, str]


class PKIDecryptionError(Exception):
    """Raised when PKI decrypt steps cannot be completed."""


class PKIEncryptionError(Exception):
    """Raised when PKI encrypt steps cannot be completed."""


@dataclass(slots=True)
class PKIDecryptionInputs:
    """Container for Meshtastic PKI decryption parameters."""

    encrypted_payload: bytes
    from_node_num: int
    to_node_num: int
    packet_id: int
    public_key: Optional[PublicKeyLike] = None


@dataclass(slots=True)
class PKIEncryptionInputs:
    """Container for Meshtastic PKI encryption parameters."""

    plaintext: bytes
    from_node_num: int
    to_node_num: int
    packet_id: int
    public_key: bytes


def load_public_key_bytes(value: PublicKeyLike) -> bytes:
    """Decode a 32-byte Curve25519 public key from bytes, base64, or hex."""

    if isinstance(value, (bytes, bytearray, memoryview)):
        data = bytes(value)
    elif isinstance(value, str):
        sanitized = "".join(value.split())
        if not sanitized:
            raise PKIDecryptionError("Public key is empty")
        try:
            data = base64.b64decode(sanitized, validate=True)
        except (binascii.Error, ValueError):
            try:
                data = bytes.fromhex(sanitized)
            except ValueError as exc:  # pragma: no cover - defensive
                raise PKIDecryptionError("Unsupported public key encoding") from exc
    else:  # pragma: no cover - defensive
        raise PKIDecryptionError(f"Unsupported public key type: {type(value).__name__}")

    if len(data) != 32:
        raise PKIDecryptionError("Public key must be 32 bytes")
    return data


def load_private_key_bytes(key_material: str) -> bytes:
    """Decode a Curve25519 private key from PEM, base64, or hex."""

    if key_material is None:
        raise PKIDecryptionError("Private key not provided")

    text = key_material.strip()
    if not text:
        raise PKIDecryptionError("Private key is empty")

    if "BEGIN" in text:
        try:
            key = load_pem_private_key(text.encode("utf-8"), password=None)
        except ValueError as exc:
            raise PKIDecryptionError("Invalid PEM private key") from exc
        if not isinstance(key, x25519.X25519PrivateKey):
            raise PKIDecryptionError("Private key is not an X25519 key")
        return key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())

    sanitized = "".join(text.split())
    try:
        decoded = base64.b64decode(sanitized, validate=True)
        if len(decoded) == 32:
            return decoded
    except (binascii.Error, ValueError):
        pass

    try:
        decoded = bytes.fromhex(sanitized)
        if len(decoded) == 32:
            return decoded
    except ValueError:
        pass

    raise PKIDecryptionError("Unsupported private key format")


def decrypt_with_private_key(inputs: PKIDecryptionInputs, private_key_material: str) -> bytes:
    """Decrypt a PKI-encrypted payload using the Meshtastic reference process."""

    if inputs.public_key is None:
        raise PKIDecryptionError("Sender public key is unavailable")

    payload = bytes(inputs.encrypted_payload)
    if len(payload) <= 12:
        raise PKIDecryptionError("Encrypted payload is too short for PKI data")

    ciphertext = payload[:-12]
    auth_tag = payload[-12:-4]
    extra_nonce_bytes = payload[-4:]

    try:
        private_key_bytes = load_private_key_bytes(private_key_material)
    except PKIDecryptionError as exc:
        raise PKIDecryptionError(str(exc)) from exc
    peer_public_bytes = load_public_key_bytes(inputs.public_key)

    private_key = x25519.X25519PrivateKey.from_private_bytes(private_key_bytes)
    peer_public_key = x25519.X25519PublicKey.from_public_bytes(peer_public_bytes)

    shared_secret = private_key.exchange(peer_public_key)
    digest = hashes.Hash(hashes.SHA256())
    digest.update(shared_secret)
    derived_key = digest.finalize()

    nonce = _build_nonce(inputs.packet_id, inputs.from_node_num, extra_nonce_bytes)
    aead = AESCCM(derived_key, tag_length=8)

    try:
        plaintext = aead.decrypt(nonce, ciphertext + auth_tag, None)
    except InvalidTag as exc:
        raise PKIDecryptionError("PKI authentication failed") from exc

    logger.debug(
        "PKI decrypt succeeded from=%s packet_id=%s", inputs.from_node_num, inputs.packet_id
    )
    return plaintext


def encrypt_with_private_key(
    inputs: PKIEncryptionInputs,
    private_key_material: str,
    *,
    extra_nonce_bytes: Optional[bytes] = None,
) -> bytes:
    """Encrypt a payload following Meshtastic PKC semantics."""

    if len(inputs.public_key) != 32:
        raise PKIEncryptionError("Recipient public key must be 32 bytes")

    private_key_bytes = load_private_key_bytes(private_key_material)
    private_key = x25519.X25519PrivateKey.from_private_bytes(private_key_bytes)
    peer_public_key = x25519.X25519PublicKey.from_public_bytes(inputs.public_key)

    shared_secret = private_key.exchange(peer_public_key)
    digest = hashes.Hash(hashes.SHA256())
    digest.update(shared_secret)
    derived_key = digest.finalize()

    if extra_nonce_bytes is None:
        extra_nonce_bytes = os.urandom(4)
    if len(extra_nonce_bytes) != 4:
        raise PKIEncryptionError("Extra nonce must be 4 bytes")

    nonce = _build_nonce(inputs.packet_id, inputs.from_node_num, extra_nonce_bytes, error_cls=PKIEncryptionError)
    aead = AESCCM(derived_key, tag_length=8)

    ciphertext = aead.encrypt(nonce, bytes(inputs.plaintext), None)
    logger.debug(
        "PKI encrypt succeeded to=%s packet_id=%s", inputs.to_node_num, inputs.packet_id
    )
    return ciphertext + extra_nonce_bytes


def _build_nonce(
    packet_id: int,
    from_node: int,
    extra_nonce_bytes: bytes,
    *,
    error_cls: type[Exception] = PKIDecryptionError,
) -> bytes:
    """Recreate the 13-byte nonce used by the firmware for AES-CCM."""

    if extra_nonce_bytes is None or len(extra_nonce_bytes) != 4:
        raise error_cls("Invalid extra nonce data")

    packet_bytes = int(packet_id).to_bytes(8, "little", signed=False)
    from_bytes = int(from_node).to_bytes(4, "little", signed=False)
    extra_nonce_int = int.from_bytes(extra_nonce_bytes, "little", signed=False)

    nonce = bytearray(16)
    nonce[0:8] = packet_bytes
    nonce[8:12] = from_bytes
    if extra_nonce_int:
        nonce[4:8] = extra_nonce_bytes
    return bytes(nonce[:13])
