import os
from typing import Any, Dict

from django.contrib.auth import get_user_model
from django.test import TestCase
from ninja.testing import TestClient
from ninja_jwt.tokens import AccessToken

from ..api import api
from ..mesh.utils import id_to_num, num_to_mac
from ..models import Node
from ..services.virtual_node_service import VirtualNodeService


class VirtualNodeAPITests(TestCase):
    def setUp(self) -> None:
        os.environ.setdefault("NINJA_SKIP_REGISTRY", "1")
        self.client = TestClient(api)
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="api_tester",
            password="testpass123",
            email="tester@example.com",
        )
        self.token = str(AccessToken.for_user(self.user))
        self.auth_headers = {"Authorization": f"Bearer {self.token}"}

    def _create_virtual_node(self, payload: Dict[str, Any] | None = None) -> dict:
        payload_data: Dict[str, Any] = payload or {}
        response = self.client.post(
            "/nodes/virtual",
            headers=self.auth_headers,
            json=payload_data,  # type: ignore[arg-type]
        )
        self.assertEqual(response.status_code, 201)
        return response.json()

    def test_create_virtual_node_generates_identity_and_keys(self) -> None:
        result = self._create_virtual_node({"short_name": "VN01", "long_name": "Virtual Node"})
        node_data = result["node"]

        self.assertTrue(node_data["is_virtual"])
        self.assertTrue(node_data["node_id"].startswith("!"))
        self.assertTrue(result["public_key"])
        self.assertTrue(result["private_key"])
        self.assertRegex(node_data["node_id"], r"^![0-9a-f]+$")
        self.assertEqual(node_data["node_id"], node_data["node_id"].lower())

        node = Node.objects.get(node_id=node_data["node_id"])
        self.assertTrue(node.is_virtual)
        self.assertTrue(node.has_private_key)

    def test_list_virtual_nodes_returns_created_entries(self) -> None:
        created = self._create_virtual_node({"long_name": "Listable"})
        response = self.client.get("/nodes/virtual", headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        nodes = response.json()
        self.assertTrue(any(node["node_id"] == created["node"]["node_id"] for node in nodes))

    def test_update_virtual_node_and_rotate_keys(self) -> None:
        created = self._create_virtual_node({"long_name": "Initial"})
        node_id = created["node"]["node_id"]
        original_public_key = created["node"]["public_key"]

        update_payload: Dict[str, Any] = {"long_name": "Updated", "regenerate_keys": True}
        response = self.client.put(
            f"/nodes/virtual/{node_id}",
            headers=self.auth_headers,
            json=update_payload,  # type: ignore[arg-type]
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["node"]["long_name"], "Updated")
        self.assertNotEqual(data["node"]["public_key"], original_public_key)
        self.assertTrue(data["private_key"])
        self.assertTrue(data["public_key"])

        node = Node.objects.get(node_id=node_id)
        self.assertEqual(node.long_name, "Updated")

    def test_update_node_id_recalculates_identity(self) -> None:
        created = self._create_virtual_node({"long_name": "Identity Test"})
        original_node_id = created["node"]["node_id"]
        original_node_num = created["node"]["node_num"]
        original_mac = created["node"]["mac_address"]

        new_node_id = "!deadbeef"
        response = self.client.put(
            f"/nodes/virtual/{original_node_id}",
            headers=self.auth_headers,
            json={"node_id": new_node_id},  # type: ignore[arg-type]
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["node"]["node_id"], new_node_id)
        self.assertNotEqual(data["node"]["node_num"], original_node_num)
        self.assertNotEqual(data["node"]["mac_address"], original_mac)

        node = Node.objects.get(node_id=new_node_id)
        self.assertEqual(node.node_id, new_node_id)
        self.assertNotEqual(node.node_num, original_node_num)
        self.assertNotEqual(node.mac_address, original_mac)

    def test_identity_generation_uses_standard_utilities(self) -> None:
        supplied_node_id = "!1234abcd"
        result = self._create_virtual_node({"node_id": supplied_node_id})
        node_data = result["node"]

        expected_node_num = id_to_num(supplied_node_id)
        if expected_node_num < VirtualNodeService.VIRTUAL_NODE_NUM_START:
            span = 1 << 32
            expected_node_num += ((VirtualNodeService.VIRTUAL_NODE_NUM_START - expected_node_num + span - 1) // span) * span
        self.assertEqual(node_data["node_num"], expected_node_num)

        expected_mac = num_to_mac(expected_node_num).upper()
        self.assertEqual(node_data["mac_address"], expected_mac)

    def test_delete_virtual_node(self) -> None:
        created = self._create_virtual_node()
        node_id = created["node"]["node_id"]

        response = self.client.delete(f"/nodes/virtual/{node_id}", headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Node.objects.filter(node_id=node_id).exists())

    def test_generate_virtual_node_keypair_endpoint(self) -> None:
        response = self.client.post("/nodes/virtual/keypair", headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("public_key", data)
        self.assertIn("private_key", data)
        self.assertNotEqual(data["public_key"], "")
        self.assertNotEqual(data["private_key"], "")

    def test_virtual_node_options_endpoint(self) -> None:
        response = self.client.get("/nodes/virtual/options", headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("roles", data)
        self.assertIn("hardware_models", data)
        self.assertTrue(any(option["value"] == data["default_role"] for option in data["roles"]))

    def test_virtual_node_prefill_endpoint(self) -> None:
        response = self.client.get("/nodes/virtual/prefill", headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertRegex(data["node_id"], r"^![0-9a-f]{8}$")
        self.assertTrue(all(ch in "0123456789abcdef" for ch in data["short_name"]))

        # Ensure the suggested values can be used to create a node without collision
        result = self._create_virtual_node(
            {
                "short_name": data["short_name"],
                "long_name": data["long_name"],
                "node_id": data["node_id"],
            }
        )
        self.assertEqual(result["node"]["node_id"], data["node_id"])
        self.assertNotEqual(result["node"]["mac_address"], "")
