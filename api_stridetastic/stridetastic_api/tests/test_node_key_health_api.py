from django.contrib.auth import get_user_model
from django.test import TestCase
from ninja.testing import TestClient
from ninja_jwt.tokens import AccessToken

from ..api import api
from ..models import Node


class NodeKeyHealthAPITests(TestCase):
    def setUp(self) -> None:
        self.client = TestClient(api)
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="key_health_tester",
            password="testpass123",
            email="tester@example.com",
        )
        self.token = str(AccessToken.for_user(self.user))
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def _create_node(self, **overrides) -> Node:
        base_index = Node.objects.count() + 1
        defaults = {
            "node_num": 100 + base_index,
            "node_id": f"!deadbe{base_index:02x}",
            "mac_address": f"AA:BB:CC:DD:EE:{base_index:02X}",
            "public_key": overrides.get("public_key", f"PUBKEY{base_index:02d}"),
        }
        defaults.update(overrides)
        return Node.objects.create(**defaults)

    def test_low_entropy_nodes_are_returned_even_without_duplicates(self) -> None:
        node = self._create_node(public_key="UNIQUEKEY1")
        Node.objects.filter(pk=node.pk).update(is_low_entropy_public_key=True)

        response = self.client.get("/nodes/keys/health", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        entry = data[0]
        self.assertEqual(entry["node_id"], node.node_id)
        self.assertTrue(entry["is_low_entropy_public_key"])
        self.assertEqual(entry["duplicate_count"], 0)
        self.assertEqual(entry["duplicate_node_ids"], [])

    def test_duplicate_public_keys_include_each_peer(self) -> None:
        low_entropy = self._create_node(public_key="LOWONLY")
        Node.objects.filter(pk=low_entropy.pk).update(is_low_entropy_public_key=True)

        dup_a = self._create_node(public_key="DUPLICATEKEY")
        dup_b = self._create_node(public_key="DUPLICATEKEY")

        response = self.client.get("/nodes/keys/health", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 3)

        duplicate_entries = [
            entry
            for entry in data
            if entry["node_id"] in {dup_a.node_id, dup_b.node_id}
        ]
        self.assertEqual(len(duplicate_entries), 2)
        for entry in duplicate_entries:
            self.assertEqual(entry["duplicate_count"], 2)
            self.assertEqual(len(entry["duplicate_node_ids"]), 1)
            self.assertNotEqual(entry["duplicate_node_ids"][0], entry["node_id"])
            self.assertFalse(entry["is_low_entropy_public_key"])

    def test_returns_empty_list_when_no_flags_present(self) -> None:
        self._create_node(public_key="KEY1")
        self._create_node(public_key="KEY2")

        response = self.client.get("/nodes/keys/health", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])
