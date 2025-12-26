import base64
import hashlib
from unittest import mock

from django.test import TestCase

from ..models import Node
from ..utils.node_serialization import serialize_node
from ..utils.public_key_entropy import is_low_entropy_public_key


class PublicKeyEntropyTests(TestCase):
    def setUp(self) -> None:
        self.material = b"suspicious-key"
        self.digest = hashlib.sha256(self.material).digest()
        self.patched_hashes = {self.digest}
        self.encoded_material = base64.b64encode(self.material).decode("ascii")

    def test_is_low_entropy_public_key_detects_known_hash(self) -> None:
        with mock.patch("stridetastic_api.utils.public_key_entropy.LOW_ENTROPY_HASH_SET", self.patched_hashes):
            self.assertTrue(is_low_entropy_public_key(self.encoded_material))

    def test_is_low_entropy_public_key_rejects_unknown_hash(self) -> None:
        unknown_material = base64.b64encode(b"legit-key").decode("ascii")
        with mock.patch("stridetastic_api.utils.public_key_entropy.LOW_ENTROPY_HASH_SET", self.patched_hashes):
            self.assertFalse(is_low_entropy_public_key(unknown_material))

    def test_node_save_updates_flag_and_serialization(self) -> None:
        with mock.patch("stridetastic_api.utils.public_key_entropy.LOW_ENTROPY_HASH_SET", self.patched_hashes):
            node = Node.objects.create(
                node_num=123,
                node_id="!abcdef01",
                mac_address="AA:BB:CC:DD:EE:FF",
                public_key=self.encoded_material,
            )

            self.assertTrue(node.is_low_entropy_public_key)
            serialized = serialize_node(node)
            self.assertTrue(serialized.is_low_entropy_public_key)

            # Updating via update_fields still refreshes the flag.
            node.public_key = base64.b64encode(b"normal-key").decode("ascii")
            node.save(update_fields=["public_key"])
            self.assertFalse(node.is_low_entropy_public_key)

    def test_detection_handles_empty_values(self) -> None:
        self.assertFalse(is_low_entropy_public_key(None))
        self.assertFalse(is_low_entropy_public_key(""))
