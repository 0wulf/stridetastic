from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from ninja.testing import TestClient
from ninja_jwt.tokens import AccessToken

from ..api import api
from ..models import Node
from ..models.packet_models import Packet, PacketData, PositionPayload


class NodePositionHistoryAPITests(TestCase):
    def setUp(self) -> None:
        self.client = TestClient(api)
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="tester",
            password="testpass123",
            email="tester@example.com",
        )
        self.token = str(AccessToken.for_user(self.user))

        self.origin_node = Node.objects.create(
            node_num=0x1,
            node_id="!00000001",
            mac_address="00:00:00:00:00:01",
        )
        self.destination_node = Node.objects.create(
            node_num=0x2,
            node_id="!00000002",
            mac_address="00:00:00:00:00:02",
        )

    def _create_position(self, *, idx: int, minutes_ago: int) -> None:
        location_sources = ["LOC_INTERNAL", "LOC_EXTERNAL", "LOC_MANUAL", "LOC_REMOTE"]
        location_source = location_sources[idx % len(location_sources)]
        packet = Packet.objects.create(
            from_node=self.origin_node,
            to_node=self.destination_node,
            packet_id=10_000 + idx,
        )
        packet_data = PacketData.objects.create(packet=packet)
        payload = PositionPayload.objects.create(
            packet_data=packet_data,
            latitude=Decimal("40.0000000") + Decimal(idx) * Decimal("0.0010000"),
            longitude=Decimal("-74.0000000") - Decimal(idx) * Decimal("0.0010000"),
            altitude=10 + idx,
            accuracy=idx * 2,
            seq_number=idx,
            location_source=location_source,
        )
        payload.time = timezone.now() - timedelta(minutes=minutes_ago)
        payload.save(update_fields=["time"])

    def test_returns_positions_in_chronological_order(self) -> None:
        self._create_position(idx=0, minutes_ago=30)
        self._create_position(idx=1, minutes_ago=20)
        self._create_position(idx=2, minutes_ago=10)

        response = self.client.get(
            f"/nodes/{self.origin_node.node_id}/positions",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(len(data), 3)
        timestamps = [entry["timestamp"] for entry in data]
        self.assertEqual(timestamps, sorted(timestamps))
        self.assertAlmostEqual(data[-1]["latitude"], 40.002, places=6)
        self.assertAlmostEqual(data[-1]["longitude"], -74.002, places=6)
        self.assertEqual(data[-1]["sequence_number"], 2)
        self.assertEqual(data[-1]["location_source"], "LOC_MANUAL")

    def test_respects_limit_parameter(self) -> None:
        for idx, minutes in enumerate([60, 40, 20, 5]):
            self._create_position(idx=idx, minutes_ago=minutes)

        response = self.client.get(
            f"/nodes/{self.origin_node.node_id}/positions?limit=2",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(len(data), 2)
        sequence_numbers = [entry["sequence_number"] for entry in data]
        self.assertEqual(sequence_numbers, [2, 3])
        location_sources = [entry["location_source"] for entry in data]
        self.assertEqual(location_sources, ["LOC_MANUAL", "LOC_REMOTE"])

    def test_returns_empty_list_when_no_positions(self) -> None:
        response = self.client.get(
            f"/nodes/{self.origin_node.node_id}/positions",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data, [])

    def test_returns_404_for_unknown_node(self) -> None:
        response = self.client.get(
            "/nodes/!deadbeef/positions",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["message"], "Node not found")
