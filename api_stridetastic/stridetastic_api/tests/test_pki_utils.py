import base64
from types import SimpleNamespace

import pytest
from stridetastic_api.mesh.encryption import pkc
from stridetastic_api.models import Node
from stridetastic_api.services.pki_service import PKIService

PRIVATE_KEY_HEX = "a00330633e63522f8a4d81ec6d9d1e6617f6c8ffd3a4c698229537d44e522277"
REMOTE_PUBLIC_HEX = "db18fc50eea47f00251cb784819a3cf5fc361882597f589f0d7ff820e8064457"
ENCRYPTED_HEX = "40df24abfcc30a17a3d9046726099e796a1c036a792b"
PLAINTEXT_HEX = "08011204746573744800"


def test_decrypt_with_private_key_meshtastic_vector():
    inputs = pkc.PKIDecryptionInputs(
        encrypted_payload=bytes.fromhex(ENCRYPTED_HEX),
        from_node_num=0x0929,
        to_node_num=0,
        packet_id=0x13B2D662,
        public_key=bytes.fromhex(REMOTE_PUBLIC_HEX),
    )

    plaintext = pkc.decrypt_with_private_key(inputs, PRIVATE_KEY_HEX)

    assert plaintext == bytes.fromhex(PLAINTEXT_HEX)


@pytest.mark.django_db
def test_pki_service_decrypts_packet():
    service = PKIService()

    target_node = Node.objects.create(
        node_num=0x0001,
        node_id="!00000001",
        mac_address="AA:00:00:00:00:01",
        private_key=base64.b64encode(bytes.fromhex(PRIVATE_KEY_HEX)).decode("ascii"),
    )

    remote_node = Node.objects.create(
        node_num=0x0929,
        node_id="!00000929",
        mac_address="AA:00:00:00:09:29",
        public_key=base64.b64encode(bytes.fromhex(REMOTE_PUBLIC_HEX)).decode("ascii"),
    )

    packet = SimpleNamespace(
        id=0x13B2D662,
        to=target_node.node_num,
        encrypted=bytes.fromhex(ENCRYPTED_HEX),
        public_key=b"",
        pki_encrypted=True,
    )
    setattr(packet, "from", remote_node.node_num)

    result = service.decrypt_packet(packet, target_node)

    assert result.success is True
    assert result.plaintext == bytes.fromhex(PLAINTEXT_HEX)
