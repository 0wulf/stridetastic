import base64
from typing import List, Tuple

import pytest
from cryptography.hazmat.primitives.asymmetric import x25519
from stridetastic_api.models import Node
from stridetastic_api.services.virtual_node_service import (
    VirtualNodeError,
    VirtualNodeService,
)


class _DummyPublicKey:
    def __init__(self, raw: bytes) -> None:
        self._raw = raw

    def public_bytes(
        self, encoding, format
    ):  # noqa: ANN001 - signature dictated by cryptography API
        return self._raw


class _DummyPrivateKey:
    def __init__(self, private_raw: bytes, public_raw: bytes) -> None:
        self._private_raw = private_raw
        self._public_key = _DummyPublicKey(public_raw)

    def private_bytes(
        self, encoding, format, encryption_algorithm
    ):  # noqa: ANN001 - signature dictated by API
        return self._private_raw

    def public_key(self):
        return self._public_key


def _pair_bytes(private_fill: int, public_fill: int) -> Tuple[bytes, bytes]:
    return bytes([private_fill] * 32), bytes([public_fill] * 32)


@pytest.mark.django_db
def test_generate_key_pair_skips_colliding_material(monkeypatch):
    duplicate_private, duplicate_public = _pair_bytes(1, 2)
    duplicate_private_b64 = base64.b64encode(duplicate_private).decode("ascii")
    duplicate_public_b64 = base64.b64encode(duplicate_public).decode("ascii")

    existing = Node.objects.create(
        node_num=VirtualNodeService.VIRTUAL_NODE_NUM_START,
        node_id="!dupe0001",
        mac_address="AA:BB:CC:DD:EE:01",
        public_key=duplicate_public_b64,
        is_virtual=True,
    )
    existing.store_private_key(duplicate_private_b64)

    unique_private, unique_public = _pair_bytes(3, 4)
    unique_private_b64 = base64.b64encode(unique_private).decode("ascii")
    unique_public_b64 = base64.b64encode(unique_public).decode("ascii")

    key_material: List[Tuple[bytes, bytes]] = [
        (duplicate_private, duplicate_public),
        (unique_private, unique_public),
    ]

    def _fake_generate(
        cls,
    ) -> _DummyPrivateKey:  # noqa: ANN001 - signature dictated by cryptography API
        if not key_material:
            raise AssertionError("No more key material to supply")
        private_raw, public_raw = key_material.pop(0)
        return _DummyPrivateKey(private_raw, public_raw)

    monkeypatch.setattr(
        x25519.X25519PrivateKey, "generate", classmethod(_fake_generate)
    )

    secrets = VirtualNodeService.generate_key_pair()
    assert secrets.public_key == unique_public_b64
    assert secrets.private_key == unique_private_b64


@pytest.mark.django_db
def test_generate_key_pair_raises_when_unique_material_unavailable(monkeypatch):
    duplicate_private, duplicate_public = _pair_bytes(9, 10)
    duplicate_private_b64 = base64.b64encode(duplicate_private).decode("ascii")
    duplicate_public_b64 = base64.b64encode(duplicate_public).decode("ascii")

    existing = Node.objects.create(
        node_num=VirtualNodeService.VIRTUAL_NODE_NUM_START + 1,
        node_id="!dupe0002",
        mac_address="AA:BB:CC:DD:EE:02",
        public_key=duplicate_public_b64,
        is_virtual=True,
    )
    existing.store_private_key(duplicate_private_b64)

    def _always_duplicate(
        cls,
    ) -> _DummyPrivateKey:  # noqa: ANN001 - signature dictated by cryptography API
        return _DummyPrivateKey(duplicate_private, duplicate_public)

    monkeypatch.setattr(
        x25519.X25519PrivateKey, "generate", classmethod(_always_duplicate)
    )

    with pytest.raises(VirtualNodeError):
        VirtualNodeService.generate_key_pair()
