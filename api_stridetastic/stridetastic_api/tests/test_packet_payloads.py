from datetime import timedelta

from django.test import TestCase  # type: ignore[import]
from django.utils import timezone  # type: ignore[import]
from meshtastic.protobuf import portnums_pb2  # type: ignore[attr-defined]

from ..models import Node
from ..models.packet_models import (
    NeighborInfoNeighbor,
    NeighborInfoPayload,
    Packet,
    PacketData,
    RouteDiscoveryPayload,
    RouteDiscoveryRoute,
    RoutingPayload,
)
from ..utils.packet_payloads import build_packet_payload_schema


class PacketPayloadSchemaTests(TestCase):
    def setUp(self) -> None:
        self.node_a = Node.objects.create(
            node_num=0x10,
            node_id="!aaaa0001",
            mac_address="00:00:00:00:aa:01",
            short_name="A",
        )
        self.node_b = Node.objects.create(
            node_num=0x11,
            node_id="!bbbb0002",
            mac_address="00:00:00:00:bb:02",
            short_name="B",
        )

    def _make_packet_data(self, *, port: str, **kwargs) -> PacketData:
        packet = Packet.objects.create(
            from_node=self.node_a,
            to_node=self.node_b,
            packet_id=int(timezone.now().timestamp() * 1000),
        )
        packet_data = PacketData.objects.create(
            packet=packet,
            port=port,
            portnum=portnums_pb2.PortNum.Value(port),
            **kwargs,
        )
        return packet_data

    def test_text_message_payload_includes_text(self) -> None:
        packet_data = self._make_packet_data(
            port="TEXT_MESSAGE_APP",
            raw_payload="Hello mesh!",
        )

        schema = build_packet_payload_schema(packet_data)

        assert schema is not None
        self.assertEqual(schema.payload_type, "text_message")
        self.assertEqual(schema.fields.get("text"), "Hello mesh!")

    def test_neighbor_info_payload_serializes_neighbors(self) -> None:
        packet_data = self._make_packet_data(port="NEIGHBORINFO_APP")
        neighbor_payload = NeighborInfoPayload.objects.create(
            packet_data=packet_data,
            reporting_node=self.node_a,
            reporting_node_id_text=self.node_a.node_id,
            node_broadcast_interval_secs=300,
        )
        NeighborInfoNeighbor.objects.create(
            payload=neighbor_payload,
            node=self.node_b,
            advertised_node_id=self.node_b.node_id,
            advertised_node_num=self.node_b.node_num,
            snr=1.5,
            last_rx_time=timezone.now() - timedelta(minutes=5),
            last_rx_time_raw=int((timezone.now() - timedelta(minutes=5)).timestamp()),
        )

        schema = build_packet_payload_schema(packet_data)

        assert schema is not None
        self.assertEqual(schema.payload_type, "neighbor_info")
        self.assertEqual(schema.fields.get("neighbors_count"), 1)
        neighbors = schema.fields.get("neighbors")
        self.assertIsInstance(neighbors, list)
        assert isinstance(neighbors, list)
        self.assertGreater(len(neighbors), 0)
        neighbor_entry = neighbors[0]
        self.assertIsInstance(neighbor_entry, dict)
        self.assertEqual(neighbor_entry.get("advertised_node_id"), self.node_b.node_id)
        reporting = schema.fields.get("reporting_node")
        self.assertIsInstance(reporting, dict)
        assert isinstance(reporting, dict)
        self.assertEqual(reporting.get("node_id"), self.node_a.node_id)

    def test_route_discovery_payload_serializes_route(self) -> None:
        packet_data = self._make_packet_data(port="TRACEROUTE_APP")
        route = RouteDiscoveryRoute.objects.create(
            node_list=[self.node_a.node_id, self.node_b.node_id],
            hops=2,
        )
        route.nodes.add(self.node_a, self.node_b)
        RouteDiscoveryPayload.objects.create(
            packet_data=packet_data,
            route_towards=route,
            snr_towards=[0.75, 0.5],
        )

        schema = build_packet_payload_schema(packet_data)

        assert schema is not None
        self.assertEqual(schema.payload_type, "route_discovery")
        towards = schema.fields.get("route_towards")
        self.assertIsInstance(towards, dict)
        assert isinstance(towards, dict)
        self.assertEqual(towards.get("hops"), 2)
        snr_list = schema.fields.get("snr_towards")
        self.assertEqual(snr_list, [0.75, 0.5])

    def test_routing_payload_includes_error_reason_and_metadata(self) -> None:
        packet_data = self._make_packet_data(
            port="ROUTING_APP",
            source=self.node_a.node_num,
            dest=self.node_b.node_num,
        )
        RoutingPayload.objects.create(
            packet_data=packet_data,
            error_reason=RoutingPayload.RoutingError.NO_ROUTE,
        )

        schema = build_packet_payload_schema(packet_data)

        assert schema is not None
        self.assertEqual(schema.payload_type, "routing")
        self.assertEqual(schema.fields.get("error_reason"), "NO_ROUTE")
        self.assertEqual(schema.fields.get("source"), self.node_a.node_num)
        self.assertEqual(schema.fields.get("dest"), self.node_b.node_num)
