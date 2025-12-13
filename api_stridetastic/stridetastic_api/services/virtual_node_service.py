from __future__ import annotations

import base64
import hashlib
import secrets
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, Optional, Tuple

from google.protobuf.descriptor import EnumValueDescriptor

from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)
from django.db import IntegrityError, transaction
from django.db.models import Max
from meshtastic.protobuf import config_pb2, mesh_pb2

from ..models import Node
from ..mesh.utils import id_to_num, num_to_mac


class VirtualNodeError(Exception):
    """Raised when virtual node lifecycle operations cannot be completed."""


@dataclass(frozen=True)
class VirtualNodeSecrets:
    public_key: str
    private_key: str


@dataclass(frozen=True)
class VirtualNodeIdentity:
    node_num: int
    node_id: str
    mac_address: str


class VirtualNodeService:
    VIRTUAL_NODE_NUM_START = 1_000_000_000

    DEFAULT_ROLE = config_pb2.Config.DeviceConfig.Role.Name(  # type: ignore[attr-defined]
        config_pb2.Config.DeviceConfig.Role.CLIENT  # type: ignore[attr-defined]
    )
    DEFAULT_HARDWARE_MODEL = mesh_pb2.HardwareModel.Name(  # type: ignore[attr-defined]
        mesh_pb2.HardwareModel.UNSET  # type: ignore[attr-defined]
    )

    _ALLOWED_FIELDS: Tuple[str, ...] = (
        "short_name",
        "long_name",
        "hw_model",
        "role",
        "is_licensed",
        "is_unmessagable",
    )

    _DECIMAL_FIELDS: Tuple[str, ...] = ()

    _STRING_FIELDS: Tuple[str, ...] = (
        "short_name",
        "long_name",
        "hw_model",
        "role",
    )

    _MAX_KEY_GENERATION_ATTEMPTS = 32

    @classmethod
    def create_virtual_node(cls, data: Dict[str, object]) -> Tuple[Node, VirtualNodeSecrets]:
        payload = dict(data)
        identity = cls._resolve_identity(
            node_num=payload.pop("node_num", None),
            node_id=payload.pop("node_id", None),
            mac_address=payload.pop("mac_address", None),
        )
        fields = cls._sanitize_fields(payload)
        secrets = cls._generate_key_pair()

        try:
            with transaction.atomic():
                node = Node.objects.create(
                    node_num=identity.node_num,
                    node_id=identity.node_id,
                    mac_address=identity.mac_address,
                    public_key=secrets.public_key,
                    is_virtual=True,
                    **fields,
                )
                cls._store_private_key(node, secrets.private_key)
        except IntegrityError as exc:  # pragma: no cover - defensive
            raise VirtualNodeError("Failed to persist virtual node") from exc

        node.refresh_from_db()
        return node, secrets

    @classmethod
    def update_virtual_node(
        cls,
        node: Node,
        data: Dict[str, object],
        *,
        regenerate_keys: bool = False,
    ) -> Tuple[Node, Optional[VirtualNodeSecrets]]:
        if not node.is_virtual:
            raise VirtualNodeError("Node is not managed as a virtual node")

        payload = dict(data)
        identity_fields: Dict[str, object] = {
            key: payload.pop(key)
            for key in ("node_id", "node_num", "mac_address")
            if key in payload
        }

        node_id_change = False
        if "node_id" in identity_fields:
            normalized_node_id = cls._normalize_node_id(identity_fields["node_id"])
            if normalized_node_id == node.node_id:
                identity_fields.pop("node_id", None)
            else:
                node_id_change = True
                identity_fields["node_id"] = normalized_node_id
                identity_fields.pop("node_num", None)
                identity_fields.pop("mac_address", None)

        identity_update_requested = node_id_change or "node_num" in identity_fields or "mac_address" in identity_fields
        fields = cls._sanitize_fields(payload)

        secrets: Optional[VirtualNodeSecrets] = None

        try:
            with transaction.atomic():
                if identity_update_requested:
                    identity = cls._resolve_identity(
                        node_num=identity_fields.get("node_num", node.node_num if not node_id_change else None),
                        node_id=identity_fields.get("node_id", node.node_id if not node_id_change else None),
                        mac_address=identity_fields.get("mac_address", node.mac_address if not node_id_change else None),
                        exclude_pk=node.pk,
                    )
                    node.node_num = identity.node_num
                    node.node_id = identity.node_id
                    node.mac_address = identity.mac_address

                for field, value in fields.items():
                    setattr(node, field, value)

                if regenerate_keys:
                    secrets = cls._generate_key_pair(exclude_pk=node.pk)
                    node.public_key = secrets.public_key

                update_fields = set(fields.keys())
                if identity_update_requested:
                    update_fields.update({"node_num", "node_id", "mac_address"})
                if secrets:
                    update_fields.add("public_key")

                if update_fields:
                    node.save(update_fields=sorted(update_fields))
                else:
                    node.save()

                if secrets:
                    cls._store_private_key(node, secrets.private_key)
        except IntegrityError as exc:  # pragma: no cover - defensive
            raise VirtualNodeError("Failed to update virtual node") from exc

        node.refresh_from_db()
        return node, secrets

    @classmethod
    def delete_virtual_node(cls, node: Node) -> None:
        if not node.is_virtual:
            raise VirtualNodeError("Node is not managed as a virtual node")
        node.delete()

    @classmethod
    def _sanitize_fields(cls, data: Dict[str, object]) -> Dict[str, object]:
        cleaned: Dict[str, object] = {}
        for field in cls._ALLOWED_FIELDS:
            if field not in data:
                continue
            value = data[field]
            if field in cls._STRING_FIELDS and isinstance(value, str):
                value = value.strip() or None
            if field in cls._DECIMAL_FIELDS and value is not None:
                value = Decimal(str(value))
            cleaned[field] = value
        return cleaned

    _MAX_KEY_GENERATION_ATTEMPTS = 32

    @classmethod
    def _generate_key_pair(
        cls,
        *,
        exclude_pk: Optional[int] = None,
    ) -> VirtualNodeSecrets:
        for _ in range(cls._MAX_KEY_GENERATION_ATTEMPTS):
            private_key = x25519.X25519PrivateKey.generate()
            private_bytes = private_key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
            public_bytes = private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
            private_b64 = base64.b64encode(private_bytes).decode("ascii")
            public_b64 = base64.b64encode(public_bytes).decode("ascii")

            if not cls._key_material_in_use(public_b64, private_b64, exclude_pk=exclude_pk):
                return VirtualNodeSecrets(public_key=public_b64, private_key=private_b64)

        raise VirtualNodeError("Failed to generate a unique virtual node key pair")

    @classmethod
    def generate_key_pair(cls) -> VirtualNodeSecrets:
        return cls._generate_key_pair()

    @classmethod
    def ensure_key_pair_available(
        cls,
        public_key: str,
        private_key: str,
        *,
        exclude_pk: Optional[int] = None,
    ) -> None:
        if cls._key_material_in_use(public_key, private_key, exclude_pk=exclude_pk):
            raise VirtualNodeError("Key pair already assigned to another node")

    @classmethod
    def assign_key_pair(
        cls,
        node: Node,
        public_key: str,
        private_key: str,
    ) -> None:
        cls.ensure_key_pair_available(public_key, private_key, exclude_pk=node.pk)
        node.public_key = public_key
        node.save(update_fields=["public_key"])
        fingerprint = hashlib.sha256(private_key.encode("utf-8")).hexdigest()
        node.store_private_key(private_key, fingerprint=fingerprint)

    @classmethod
    def get_virtual_node_options(cls) -> Dict[str, object]:
        role_values = config_pb2.Config.DeviceConfig.Role.DESCRIPTOR.values  # type: ignore[attr-defined]
        hardware_values = mesh_pb2.HardwareModel.DESCRIPTOR.values  # type: ignore[attr-defined]

        def serialize_options(values: Tuple[EnumValueDescriptor, ...]) -> list[dict[str, str]]:
            return [
                {
                    "value": descriptor.name,
                    "label": cls._format_enum_label(descriptor.name),
                }
                for descriptor in values
            ]

        return {
            "roles": serialize_options(role_values),
            "hardware_models": serialize_options(hardware_values),
            "default_role": cls.DEFAULT_ROLE,
            "default_hardware_model": cls.DEFAULT_HARDWARE_MODEL,
        }

    @classmethod
    def _store_private_key(cls, node: Node, key_material: str) -> None:
        if not node.public_key:
            raise VirtualNodeError("Virtual node must have a public key before storing private material")

        public_key = node.public_key
        cls.ensure_key_pair_available(public_key, key_material, exclude_pk=node.pk)
        fingerprint = hashlib.sha256(key_material.encode("utf-8")).hexdigest()
        node.store_private_key(key_material, fingerprint=fingerprint)

    @classmethod
    def _key_material_in_use(
        cls,
        public_key: str,
        private_key: str,
        *,
        exclude_pk: Optional[int] = None,
    ) -> bool:
        public_qs = Node.objects.filter(public_key=public_key)
        if exclude_pk is not None:
            public_qs = public_qs.exclude(pk=exclude_pk)
        if public_qs.exists():
            return True

        if private_key:
            private_qs = Node.objects.filter(private_key=private_key)
            if exclude_pk is not None:
                private_qs = private_qs.exclude(pk=exclude_pk)
            if private_qs.exists():
                return True

        return False

    @classmethod
    def _resolve_identity(
        cls,
        *,
        node_num: Optional[object],
        node_id: Optional[object],
        mac_address: Optional[object],
        exclude_pk: Optional[int] = None,
    ) -> VirtualNodeIdentity:
        provided_node_id = cls._normalize_node_id(node_id) if node_id is not None else None
        provided_mac = cls._normalize_mac(mac_address) if mac_address is not None else None
        provided_node_num = cls._normalize_node_num(node_num) if node_num is not None else None


        seed_node_num: Optional[int] = None
        if provided_node_id is not None:
            seed_node_num = cls._node_num_seed_from_node_id(provided_node_id)

        if provided_mac is not None and cls._mac_exists(provided_mac, exclude_pk=exclude_pk):
            raise VirtualNodeError("MAC address is already in use")
        if provided_node_num is not None and cls._node_num_exists(provided_node_num, exclude_pk=exclude_pk):
            raise VirtualNodeError("Node number is already in use")

        candidate = (
            provided_node_num
            if provided_node_num is not None
            else seed_node_num
            if seed_node_num is not None
            else cls._next_available_node_num()
        )

        if candidate < cls.VIRTUAL_NODE_NUM_START:
            if provided_node_num is not None:
                raise VirtualNodeError("Node number is reserved for physical nodes")
            candidate = cls.VIRTUAL_NODE_NUM_START

        while True:
            if cls._node_num_exists(candidate, exclude_pk=exclude_pk):
                if provided_node_num is not None:
                    raise VirtualNodeError("Node number is already in use")
                candidate += 1
                continue

            target_node_id = provided_node_id or cls._default_node_id(candidate)
            if cls._node_id_exists(target_node_id, exclude_pk=exclude_pk):
                if provided_node_id is not None:
                    raise VirtualNodeError("Node ID is already in use")
                candidate += 1
                continue

            target_mac = provided_mac or cls._default_mac(candidate)
            if cls._mac_exists(target_mac, exclude_pk=exclude_pk):
                if provided_mac is not None:
                    raise VirtualNodeError("MAC address is already in use")
                candidate += 1
                continue

            return VirtualNodeIdentity(
                node_num=candidate,
                node_id=target_node_id,
                mac_address=target_mac,
            )

    @classmethod
    def _suggest_identity(cls) -> VirtualNodeIdentity:
        for _ in range(10):
            candidate_num = cls.VIRTUAL_NODE_NUM_START + secrets.randbits(32)
            if cls._node_num_exists(candidate_num):
                continue
            candidate_id = cls._default_node_id(candidate_num)
            if cls._node_id_exists(candidate_id):
                continue
            candidate_mac = cls._default_mac(candidate_num)
            if cls._mac_exists(candidate_mac):
                continue
            return VirtualNodeIdentity(
                node_num=candidate_num,
                node_id=candidate_id,
                mac_address=candidate_mac,
            )
        return cls._resolve_identity(node_num=None, node_id=None, mac_address=None)

    @classmethod
    def _next_available_node_num(cls, start: Optional[int] = None) -> int:
        if start is None:
            max_value = Node.objects.aggregate(Max("node_num")).get("node_num__max") or 0
            start = max(cls.VIRTUAL_NODE_NUM_START, int(max_value) + 1)
        candidate = int(start)
        while cls._node_num_exists(candidate):
            candidate += 1
        return candidate

    @classmethod
    def _default_node_id(cls, node_num: int) -> str:
        suffix = f"{node_num & 0xFFFFFFFF:08x}"
        return f"!{suffix}"

    @classmethod
    def _node_num_seed_from_node_id(cls, node_id: str) -> int:
        base = id_to_num(node_id)
        if base >= cls.VIRTUAL_NODE_NUM_START:
            return base

        span = 1 << 32
        increments = (cls.VIRTUAL_NODE_NUM_START - base + span - 1) // span
        return base + increments * span

    @classmethod
    def _default_mac(cls, node_num: int) -> str:
        return num_to_mac(node_num).upper()

    @classmethod
    def _normalize_node_num(cls, value: object) -> int:
        if isinstance(value, bool):
            raise VirtualNodeError("Node number must be numeric")
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            try:
                return int(value, 0)
            except ValueError as exc:
                raise VirtualNodeError("Node number must be numeric") from exc
        raise VirtualNodeError("Node number must be numeric")

    @classmethod
    def _normalize_node_id(cls, value: object) -> str:
        if not isinstance(value, str):
            raise VirtualNodeError("Node ID must be a string")
        candidate = value.strip().lower()
        if not candidate:
            raise VirtualNodeError("Node ID cannot be empty")
        if not candidate.startswith("!"):
            candidate = f"!{candidate}"
        if len(candidate) > 10:
            raise VirtualNodeError("Node ID must be at most 10 characters")
        body = candidate[1:]
        if not body:
            raise VirtualNodeError("Node ID cannot be empty")
        if any(ch not in "0123456789abcdef" for ch in body):
            raise VirtualNodeError("Node ID must contain only lowercase hexadecimal characters")
        return f"!{body}"

    @classmethod
    def _normalize_mac(cls, value: object) -> str:
        if not isinstance(value, str):
            raise VirtualNodeError("MAC address must be a string")
        cleaned = value.replace("-", "").replace(":", "").upper()
        if len(cleaned) != 12:
            raise VirtualNodeError("MAC address must contain 12 hexadecimal characters")
        if any(ch not in "0123456789ABCDEF" for ch in cleaned):
            raise VirtualNodeError("MAC address must contain only hexadecimal characters")
        return ":".join(cleaned[i:i + 2] for i in range(0, 12, 2))

    @classmethod
    def _node_num_exists(cls, value: int, exclude_pk: Optional[int] = None) -> bool:
        queryset = Node.objects.filter(node_num=value)
        if exclude_pk is not None:
            queryset = queryset.exclude(pk=exclude_pk)
        return queryset.exists()

    @classmethod
    def _node_id_exists(cls, value: str, exclude_pk: Optional[int] = None) -> bool:
        queryset = Node.objects.filter(node_id=value)
        if exclude_pk is not None:
            queryset = queryset.exclude(pk=exclude_pk)
        return queryset.exists()

    @classmethod
    def _mac_exists(cls, value: str, exclude_pk: Optional[int] = None) -> bool:
        queryset = Node.objects.filter(mac_address=value)
        if exclude_pk is not None:
            queryset = queryset.exclude(pk=exclude_pk)
        return queryset.exists()

    @staticmethod
    def _format_enum_label(name: str) -> str:
        return name.replace("_", " ").title()

    @classmethod
    def generate_virtual_node_prefill(cls) -> Dict[str, object]:
        identity = cls._suggest_identity()
        suffix = identity.node_id.lstrip("!")[-4:]
        short_name = suffix
        long_name = f"Meshtastic {suffix}"
        return {
            "short_name": short_name,
            "long_name": long_name,
            "node_id": identity.node_id,
        }
