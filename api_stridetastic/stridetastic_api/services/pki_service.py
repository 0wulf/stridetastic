"""Meshtastic PKI decryption service."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from django.utils import timezone

from ..models import Node
from ..mesh.encryption.pkc import (
    PKIDecryptionError,
    PKIDecryptionInputs,
    PKIEncryptionError,
    PKIEncryptionInputs,
    decrypt_with_private_key,
    encrypt_with_private_key,
    load_public_key_bytes,
)

logger = logging.getLogger(__name__)


@dataclass
class PKIDecryptionResult:
    """Result placeholder for PKI decryption attempts."""

    success: bool
    plaintext: Optional[bytes] = None
    reason: Optional[str] = None


@dataclass
class PKIEncryptionResult:
    """Result placeholder for PKI encryption attempts."""

    success: bool
    ciphertext: Optional[bytes] = None
    public_key: Optional[bytes] = None
    reason: Optional[str] = None


class PKIService:
    """Facade for Meshtastic public-key packet decryption."""

    def __init__(self) -> None:
        self._initialized_at = timezone.now()

    @property
    def initialized_at(self):
        return self._initialized_at

    def can_decrypt_for_node(self, node: Node) -> bool:
        """Return True if the node currently has private key material on record."""

        return node.has_private_key

    def decrypt_packet(self, packet, target_node: Node) -> PKIDecryptionResult:
        """Attempt to decrypt a PKI encrypted packet."""

        if not self.can_decrypt_for_node(target_node):
            return PKIDecryptionResult(
                success=False,
                reason="Private key not available for target node",
            )

        private_key_material = target_node.private_key
        if not private_key_material:
            return PKIDecryptionResult(success=False, reason="Private key not available for target node")

        encrypted_section = getattr(packet, "encrypted", None)
        if not encrypted_section:
            return PKIDecryptionResult(success=False, reason="Packet missing encrypted payload")

        encrypted_payload = bytes(encrypted_section)
        if len(encrypted_payload) <= 12:
            return PKIDecryptionResult(success=False, reason="Encrypted payload too short for PKI decryption")

        from_node_num = getattr(packet, "from", None)
        packet_id = getattr(packet, "id", None)
        if from_node_num is None or packet_id is None:
            return PKIDecryptionResult(success=False, reason="Packet metadata incomplete for PKI decryption")

        remote_public_key_bytes: Optional[bytes] = None
        try:
            raw_public_key = getattr(packet, "public_key", b"")
            if raw_public_key:
                remote_public_key_bytes = load_public_key_bytes(raw_public_key)
            else:
                remote_public_key_bytes = self._resolve_remote_public_key(int(from_node_num))
        except PKIDecryptionError as exc:
            logger.info("PKI public key decode failed for node %s: %s", from_node_num, exc)
            return PKIDecryptionResult(success=False, reason=str(exc))

        if remote_public_key_bytes is None:
            return PKIDecryptionResult(success=False, reason="Sender public key unavailable")

        inputs = PKIDecryptionInputs(
            encrypted_payload=encrypted_payload,
            from_node_num=int(from_node_num),
            to_node_num=int(getattr(packet, "to", 0) or 0),
            packet_id=int(packet_id),
            public_key=remote_public_key_bytes,
        )

        try:
            plaintext = decrypt_with_private_key(inputs, private_key_material)
        except PKIDecryptionError as exc:
            logger.info(
                "PKI decrypt failed for packet %s from node %s: %s", packet_id, from_node_num, exc
            )
            return PKIDecryptionResult(success=False, reason=str(exc))
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.exception(
                "PKI decrypt encountered an unexpected error for packet %s from node %s", packet_id, from_node_num
            )
            return PKIDecryptionResult(success=False, reason="PKI decryption encountered an internal error")

        logger.debug("PKI decrypt succeeded for packet %s using node %s", packet_id, target_node.node_num)
        return PKIDecryptionResult(success=True, plaintext=plaintext)

    def _resolve_remote_public_key(self, from_node_num: int) -> Optional[bytes]:
        remote_node = Node.objects.filter(node_num=from_node_num).only("public_key").first()
        if remote_node and remote_node.public_key:
            try:
                return load_public_key_bytes(remote_node.public_key)
            except PKIDecryptionError as exc:
                logger.info("Stored public key invalid for node %s: %s", from_node_num, exc)
        return None

    def encrypt_packet(
        self,
        inputs: PKIEncryptionInputs,
        private_key_material: str,
    ) -> PKIEncryptionResult:
        """Attempt to encrypt a payload for PKI delivery."""

        if not private_key_material:
            return PKIEncryptionResult(success=False, reason="Private key not available for source node")

        try:
            ciphertext = encrypt_with_private_key(inputs, private_key_material)
        except PKIEncryptionError as exc:
            logger.info(
                "PKI encrypt failed for packet %s to node %s: %s",
                inputs.packet_id,
                inputs.to_node_num,
                exc,
            )
            return PKIEncryptionResult(success=False, reason=str(exc))
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.exception(
                "PKI encrypt encountered an unexpected error for packet %s to node %s",
                inputs.packet_id,
                inputs.to_node_num,
            )
            return PKIEncryptionResult(success=False, reason="PKI encryption encountered an internal error")

        return PKIEncryptionResult(success=True, ciphertext=ciphertext, public_key=inputs.public_key)
