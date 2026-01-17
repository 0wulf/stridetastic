from datetime import timedelta

from django.contrib.auth import get_user_model  # type: ignore[import]
from django.test import TestCase  # type: ignore[import]
from django.utils import timezone  # type: ignore[import]
from meshtastic.protobuf import portnums_pb2  # type: ignore[attr-defined]
from ninja.testing import TestClient  # type: ignore[import]
from ninja_jwt.tokens import AccessToken  # type: ignore[import]

from ..api import api
from ..models import Node  # type: ignore[import]
from ..models.packet_models import Packet, PacketData, TelemetryPayload


class PortActivityAPITests(TestCase):
    def setUp(self) -> None:
        self.client = TestClient(api)
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="porttester",
            password="testpass123",
        )
        self.token = str(AccessToken.for_user(self.user))

        self.node_a = Node.objects.create(
            node_num=0x10,
            node_id="!aaaa0001",
            mac_address="00:00:00:00:aa:01",
        )
        self.node_b = Node.objects.create(
            node_num=0x11,
            node_id="!bbbb0002",
            mac_address="00:00:00:00:bb:02",
        )

    def _create_packet(
        self, *, sender: Node, receiver: Node, port: str, minutes_ago: int = 0
    ) -> PacketData:
        packet = Packet.objects.create(
            from_node=sender,
            to_node=receiver,
            packet_id=int(timezone.now().timestamp() * 1000),
        )
        packet_data = PacketData.objects.create(
            packet=packet,
            port=port,
            portnum=portnums_pb2.PortNum.Value(port),
        )
        if minutes_ago:
            past_time = timezone.now() - timedelta(minutes=minutes_ago)
            PacketData.objects.filter(pk=packet_data.pk).update(time=past_time)
            Packet.objects.filter(pk=packet.pk).update(time=past_time)
        packet_data.refresh_from_db()
        return packet_data

    def test_global_port_activity_counts_packets(self) -> None:
        self._create_packet(
            sender=self.node_a, receiver=self.node_b, port="TEXT_MESSAGE_APP"
        )
        self._create_packet(
            sender=self.node_a,
            receiver=self.node_b,
            port="TEXT_MESSAGE_APP",
            minutes_ago=5,
        )
        self._create_packet(
            sender=self.node_b, receiver=self.node_a, port="POSITION_APP"
        )

        response = self.client.get(
            "/ports/activity",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)

        text_entry = next(item for item in data if item["port"] == "TEXT_MESSAGE_APP")
        self.assertEqual(text_entry["total_packets"], 2)
        self.assertTrue(text_entry["display_name"].lower().startswith("text"))

    def test_node_port_activity_breakdown(self) -> None:
        self._create_packet(
            sender=self.node_a, receiver=self.node_b, port="TEXT_MESSAGE_APP"
        )
        self._create_packet(
            sender=self.node_a,
            receiver=self.node_b,
            port="TEXT_MESSAGE_APP",
            minutes_ago=3,
        )
        self._create_packet(
            sender=self.node_b, receiver=self.node_a, port="POSITION_APP"
        )

        response = self.client.get(
            f"/nodes/{self.node_a.node_id}/ports",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()

        text_entry = next(item for item in data if item["port"] == "TEXT_MESSAGE_APP")
        self.assertEqual(text_entry["sent_count"], 2)
        self.assertEqual(text_entry["received_count"], 0)

        position_entry = next(item for item in data if item["port"] == "POSITION_APP")
        self.assertEqual(position_entry["sent_count"], 0)
        self.assertEqual(position_entry["received_count"], 1)

    def test_unknown_node_returns_404(self) -> None:
        response = self.client.get(
            "/nodes/!unknown/ports",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["message"], "Node not found")

    def test_node_port_packets_returns_payload_information(self) -> None:
        telemetry_sent = self._create_packet(
            sender=self.node_a,
            receiver=self.node_b,
            port="TELEMETRY_APP",
        )
        TelemetryPayload.objects.create(
            packet_data=telemetry_sent,
            battery_level=87,
            voltage=4.15,
        )

        telemetry_received = self._create_packet(
            sender=self.node_b,
            receiver=self.node_a,
            port="TELEMETRY_APP",
            minutes_ago=5,
        )
        TelemetryPayload.objects.create(
            packet_data=telemetry_received,
            temperature=21.5,
            relative_humidity=48.2,
        )

        response = self.client.get(
            f"/nodes/{self.node_a.node_id}/ports/TELEMETRY_APP/packets",
            headers={"Authorization": f"Bearer {self.token}"},
        )

        self.assertEqual(response.status_code, 200)
        payloads = response.json()
        self.assertGreaterEqual(len(payloads), 2)
        self.assertEqual(payloads[0]["direction"], "sent")
        self.assertEqual(payloads[0]["payload"]["payload_type"], "telemetry")
        self.assertIn("battery_level", payloads[0]["payload"]["fields"])
        self.assertEqual(payloads[1]["direction"], "received")
        self.assertIn("temperature", payloads[1]["payload"]["fields"])

    def test_invalid_direction_filters_are_rejected(self) -> None:
        self._create_packet(
            sender=self.node_a, receiver=self.node_b, port="TEXT_MESSAGE_APP"
        )

        response = self.client.get(
            f"/nodes/{self.node_a.node_id}/ports/TEXT_MESSAGE_APP/packets?direction=sideways",
            headers={"Authorization": f"Bearer {self.token}"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("direction", response.json()["message"])

    def test_port_node_activity_returns_combined_counts(self) -> None:
        self._create_packet(
            sender=self.node_a, receiver=self.node_b, port="POSITION_APP"
        )
        self._create_packet(
            sender=self.node_a, receiver=self.node_b, port="POSITION_APP"
        )
        self._create_packet(
            sender=self.node_b, receiver=self.node_a, port="POSITION_APP"
        )

        response = self.client.get(
            "/ports/POSITION_APP/nodes",
            headers={"Authorization": f"Bearer {self.token}"},
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)

        node_a_entry = next(
            item for item in data if item["node_id"] == self.node_a.node_id
        )
        self.assertEqual(node_a_entry["sent_count"], 2)
        self.assertEqual(node_a_entry["received_count"], 0)
        self.assertEqual(node_a_entry["total_packets"], 2)

        node_b_entry = next(
            item for item in data if item["node_id"] == self.node_b.node_id
        )
        self.assertEqual(node_b_entry["sent_count"], 1)
        self.assertEqual(node_b_entry["received_count"], 0)
        self.assertEqual(node_b_entry["total_packets"], 1)

    def test_port_node_activity_rejects_blank_identifier(self) -> None:
        response = self.client.get(
            "/ports/%20/nodes",
            headers={"Authorization": f"Bearer {self.token}"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Port identifier", response.json()["message"])
