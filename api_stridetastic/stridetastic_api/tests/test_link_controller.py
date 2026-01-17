from datetime import timedelta
from urllib.parse import quote

from django.contrib.auth import get_user_model  # type: ignore[import]
from django.test import TestCase  # type: ignore[import]
from django.utils import timezone  # type: ignore[import]
from meshtastic.protobuf import portnums_pb2  # type: ignore[attr-defined]
from ninja.testing import TestClient  # type: ignore[import]
from ninja_jwt.tokens import AccessToken  # type: ignore[import]

from ..api import api
from ..models import Channel, Node, NodeLink
from ..models.packet_models import Packet, PacketData

API_CLIENT = TestClient(api)


class LinkControllerAPITests(TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.client = API_CLIENT
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="linktester",
            password="testpass123",
        )
        self.token = str(AccessToken.for_user(self.user))

        self.node_a = Node.objects.create(
            node_num=0x21,
            node_id="!cccc0001",
            mac_address="00:00:00:00:cc:01",
        )
        self.node_b = Node.objects.create(
            node_num=0x22,
            node_id="!dddd0002",
            mac_address="00:00:00:00:dd:02",
        )
        self.node_c = Node.objects.create(
            node_num=0x23,
            node_id="!eeee0003",
            mac_address="00:00:00:00:ee:03",
        )

        self.channel = Channel.objects.create(
            channel_id="Alpha",
            channel_num=1,
        )
        self.channel.members.add(self.node_a, self.node_b, self.node_c)

        first_packet_time = timezone.now() - timedelta(minutes=3)
        second_packet_time = timezone.now() - timedelta(minutes=1)

        self.packet_ab = Packet.objects.create(
            from_node=self.node_a,
            to_node=self.node_b,
            packet_id=1001,
        )
        Packet.objects.filter(pk=self.packet_ab.pk).update(time=first_packet_time)
        PacketData.objects.create(
            packet=self.packet_ab,
            port="TEXT_MESSAGE_APP",
            portnum=portnums_pb2.PortNum.Value("TEXT_MESSAGE_APP"),
        )
        self.packet_ab.refresh_from_db()
        self.packet_ab.channels.add(self.channel)

        self.packet_ba = Packet.objects.create(
            from_node=self.node_b,
            to_node=self.node_a,
            packet_id=1002,
        )
        Packet.objects.filter(pk=self.packet_ba.pk).update(time=second_packet_time)
        PacketData.objects.create(
            packet=self.packet_ba,
            port="POSITION_APP",
            portnum=portnums_pb2.PortNum.Value("POSITION_APP"),
        )
        self.packet_ba.refresh_from_db()
        self.packet_ba.channels.add(self.channel)

        self.link_bidirectional = NodeLink.objects.create(
            node_a=self.node_a,
            node_b=self.node_b,
            node_a_to_node_b_packets=2,
            node_b_to_node_a_packets=1,
            is_bidirectional=True,
            last_activity=second_packet_time,
            last_packet=self.packet_ba,
        )
        self.link_bidirectional.channels.add(self.channel)

        self.link_unidirectional = NodeLink.objects.create(
            node_a=self.node_a,
            node_b=self.node_c,
            node_a_to_node_b_packets=5,
            node_b_to_node_a_packets=0,
            is_bidirectional=False,
            last_activity=first_packet_time,
        )

    def _auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def test_list_links_returns_serialized_payload(self) -> None:
        response = self.client.get("/links/", headers=self._auth_headers())

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)

        entries_by_id = {entry["id"]: entry for entry in data}
        self.assertEqual(
            set(entries_by_id.keys()),
            {self.link_bidirectional.pk, self.link_unidirectional.pk},
        )

        bidirectional_entry = entries_by_id[self.link_bidirectional.pk]
        self.assertEqual(bidirectional_entry["total_packets"], 3)
        self.assertEqual(bidirectional_entry["last_packet_port"], "POSITION_APP")
        self.assertTrue(bidirectional_entry["channels"])
        self.assertEqual(bidirectional_entry["channels"][0]["channel_id"], "Alpha")

    def test_list_links_filters_by_bidirectional_flag(self) -> None:
        response = self.client.get(
            "/links/?bidirectional=false",
            headers=self._auth_headers(),
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], self.link_unidirectional.pk)

    def test_list_links_filters_by_node_identifier(self) -> None:
        node_param = quote(self.node_b.node_id, safe="")
        response = self.client.get(
            f"/links/?node={node_param}",
            headers=self._auth_headers(),
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        link_ids = {link["id"] for link in data}
        self.assertIn(self.link_bidirectional.pk, link_ids)
        self.assertNotIn(self.link_unidirectional.pk, link_ids)

    def test_list_links_filters_by_port(self) -> None:
        response = self.client.get(
            "/links/?port=POSITION_APP",
            headers=self._auth_headers(),
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], self.link_bidirectional.pk)

    def test_list_links_filters_by_port_without_matches(self) -> None:
        response = self.client.get(
            "/links/?port=ROUTING_APP",
            headers=self._auth_headers(),
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data, [])

    def test_list_links_port_filter_respects_time_window(self) -> None:
        Packet.objects.filter(pk=self.packet_ab.pk).update(
            time=timezone.now() - timedelta(minutes=10)
        )

        response = self.client.get(
            "/links/?port=TEXT_MESSAGE_APP&last=5min",
            headers=self._auth_headers(),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_list_links_rejects_invalid_limit(self) -> None:
        response = self.client.get(
            "/links/?limit=abc",
            headers=self._auth_headers(),
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Invalid limit", response.json()["message"])

    def test_get_link_returns_detail_payload(self) -> None:
        response = self.client.get(
            f"/links/{self.link_bidirectional.pk}",
            headers=self._auth_headers(),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["id"], self.link_bidirectional.pk)
        self.assertEqual(payload["node_a"]["node_id"], self.node_a.node_id)
        self.assertEqual(payload["last_packet_port"], "POSITION_APP")

    def test_get_link_returns_404_for_unknown_link(self) -> None:
        response = self.client.get(
            "/links/9999",
            headers=self._auth_headers(),
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["message"], "Link not found")

    def test_get_link_packets_returns_directional_history(self) -> None:
        response = self.client.get(
            f"/links/{self.link_bidirectional.pk}/packets?order=asc",
            headers=self._auth_headers(),
        )

        self.assertEqual(response.status_code, 200)
        packets = response.json()
        self.assertEqual(len(packets), 2)
        self.assertEqual(packets[0]["direction"], "node_a_to_node_b")
        self.assertEqual(packets[0]["port"], "TEXT_MESSAGE_APP")
        self.assertEqual(packets[1]["direction"], "node_b_to_node_a")
        self.assertEqual(packets[1]["port"], "POSITION_APP")

    def test_get_link_packets_respects_time_filters(self) -> None:
        cutoff = (self.packet_ba.time - timedelta(seconds=30)).isoformat()

        since_param = quote(cutoff, safe="")
        response = self.client.get(
            f"/links/{self.link_bidirectional.pk}/packets?since={since_param}",
            headers=self._auth_headers(),
        )

        self.assertEqual(response.status_code, 200)
        packets = response.json()
        self.assertEqual(len(packets), 1)
        self.assertEqual(packets[0]["direction"], "node_b_to_node_a")

    def test_get_link_packets_filters_by_port(self) -> None:
        response = self.client.get(
            f"/links/{self.link_bidirectional.pk}/packets?port=TEXT_MESSAGE_APP",
            headers=self._auth_headers(),
        )

        self.assertEqual(response.status_code, 200)
        packets = response.json()
        self.assertEqual(len(packets), 1)
        self.assertEqual(packets[0]["port"], "TEXT_MESSAGE_APP")

    def test_get_link_packets_rejects_invalid_limit(self) -> None:
        response = self.client.get(
            f"/links/{self.link_bidirectional.pk}/packets?limit=NaN",
            headers=self._auth_headers(),
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Invalid limit", response.json()["message"])

    def test_get_link_packets_returns_404_for_missing_link(self) -> None:
        response = self.client.get(
            "/links/4242/packets",
            headers=self._auth_headers(),
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["message"], "Link not found")
