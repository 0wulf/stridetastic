from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from ninja.testing import TestClient
from ninja_jwt.tokens import AccessToken

from ..api import api
from ..models import Node
from ..models.packet_models import Packet, PacketData, TelemetryPayload


class NodeTelemetryHistoryAPITests(TestCase):
    def setUp(self) -> None:
        self.client = TestClient(api)
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="telemetry",
            password="testpass123",
            email="telemetry@example.com",
        )
        self.token = str(AccessToken.for_user(self.user))

        self.origin_node = Node.objects.create(
            node_num=0x10,
            node_id="!0000abcd",
            mac_address="00:00:00:00:ab:cd",
        )
        self.destination_node = Node.objects.create(
            node_num=0x11,
            node_id="!0000dcba",
            mac_address="00:00:00:00:dc:ba",
        )

    def _create_telemetry(
        self,
        *,
        idx: int,
        minutes_ago: int,
        battery_level: int = 70,
        voltage: Decimal = Decimal("3.70"),
        temperature: Decimal = Decimal("22.5"),
    ) -> None:
        packet = Packet.objects.create(
            from_node=self.origin_node,
            to_node=self.destination_node,
        )
        packet_data = PacketData.objects.create(packet=packet)
        payload = TelemetryPayload.objects.create(
            packet_data=packet_data,
            battery_level=battery_level,
            voltage=voltage + Decimal(idx) * Decimal("0.01"),
            temperature=temperature + Decimal(idx) * Decimal("0.1"),
            relative_humidity=Decimal("40.0") + idx,
            uptime_seconds=1000 + idx * 60,
        )
        payload.time = timezone.now() - timedelta(minutes=minutes_ago)
        payload.save(update_fields=["time"])

    def test_returns_telemetry_in_chronological_order(self) -> None:
        self._create_telemetry(idx=0, minutes_ago=30)
        self._create_telemetry(idx=1, minutes_ago=20)
        self._create_telemetry(idx=2, minutes_ago=10)

        response = self.client.get(
            f"/nodes/{self.origin_node.node_id}/telemetry",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(len(data), 3)
        timestamps = [entry["timestamp"] for entry in data]
        self.assertEqual(timestamps, sorted(timestamps))
        self.assertAlmostEqual(data[-1]["voltage"], 3.72, places=2)
        self.assertEqual(data[-1]["battery_level"], 70)
        self.assertEqual(data[-1]["uptime_seconds"], 1000 + 2 * 60)

    def test_respects_limit_parameter(self) -> None:
        for idx, minutes in enumerate([60, 45, 30, 15, 5]):
            self._create_telemetry(idx=idx, minutes_ago=minutes)

        response = self.client.get(
            f"/nodes/{self.origin_node.node_id}/telemetry?limit=2",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(len(data), 2)
        voltages = [entry["voltage"] for entry in data]
        self.assertAlmostEqual(voltages[0], 3.73, places=2)
        self.assertAlmostEqual(voltages[1], 3.74, places=2)

    def test_returns_empty_list_when_no_telemetry(self) -> None:
        response = self.client.get(
            f"/nodes/{self.origin_node.node_id}/telemetry",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data, [])

    def test_returns_404_for_unknown_node(self) -> None:
        response = self.client.get(
            "/nodes/!unknown/telemetry",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["message"], "Node not found")
