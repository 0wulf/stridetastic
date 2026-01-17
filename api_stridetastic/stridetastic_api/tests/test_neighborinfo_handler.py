from datetime import timezone as dt_timezone

from django.test import TestCase  # type: ignore[import]
from meshtastic.protobuf import mesh_pb2  # type: ignore[attr-defined]

from ..mesh.packet.handler import handle_neighborinfo
from ..mesh.utils import id_to_num
from ..models import Edge, Node, Packet
from ..models.packet_models import NeighborInfoPayload, PacketData


class NeighborInfoHandlerTests(TestCase):
    def setUp(self) -> None:
        self.reporting_node = Node.objects.create(
            node_num=int("00000001", 16),
            node_id="!00000001",
            mac_address="00:00:00:00:00:01",
        )
        self.destination_node = Node.objects.create(
            node_num=int("00000002", 16),
            node_id="!00000002",
            mac_address="00:00:00:00:00:02",
        )

        self.packet = Packet.objects.create(
            from_node=self.reporting_node,
            to_node=self.destination_node,
        )
        self.packet_data = PacketData.objects.create(packet=self.packet)

    def test_neighborinfo_creates_payload_neighbors_and_edges(self) -> None:
        neighbor_info = mesh_pb2.NeighborInfo()
        neighbor_info.node_id = self.reporting_node.node_num
        neighbor_info.last_sent_by_id = int("00000002", 16)
        neighbor_info.node_broadcast_interval_secs = 90

        neighbor_entry = neighbor_info.neighbors.add()
        neighbor_entry.node_id = self.destination_node.node_num
        neighbor_entry.snr = 12.75
        neighbor_entry.last_rx_time = 1_730_000_000
        neighbor_entry.node_broadcast_interval_secs = 45

        payload_bytes = neighbor_info.SerializeToString()

        handle_neighborinfo(payload_bytes, self.packet_data)

        payload = NeighborInfoPayload.objects.get(packet_data=self.packet_data)
        self.assertEqual(payload.reporting_node, self.reporting_node)
        self.assertEqual(payload.reporting_node_id_text, self.reporting_node.node_id)
        self.assertEqual(payload.last_sent_by_node, self.destination_node)
        self.assertEqual(payload.last_sent_by_node_num, int("00000002", 16))
        self.assertEqual(payload.node_broadcast_interval_secs, 90)

        neighbors = list(payload.neighbors.all())
        self.assertEqual(len(neighbors), 1)
        neighbor = neighbors[0]
        self.assertEqual(neighbor.node, self.destination_node)
        self.assertEqual(neighbor.advertised_node_id, self.destination_node.node_id)
        self.assertEqual(neighbor.advertised_node_num, int("00000002", 16))
        self.assertAlmostEqual(float(neighbor.snr or 0), 12.75, places=2)
        self.assertEqual(neighbor.node_broadcast_interval_secs, 45)
        self.assertEqual(neighbor.last_rx_time_raw, 1_730_000_000)
        self.assertIsNotNone(neighbor.last_rx_time)
        self.assertEqual(neighbor.last_rx_time.tzinfo, dt_timezone.utc)

        edge = Edge.objects.filter(
            source_node=self.reporting_node, target_node=self.destination_node
        ).first()
        self.assertIsNotNone(edge)
        if edge:
            self.assertEqual(edge.last_packet, self.packet)
            self.assertEqual(edge.last_hops, 0)
            self.assertAlmostEqual(float(edge.last_rx_snr or 0), 12.75, places=2)

    def test_neighborinfo_replaces_existing_neighbors(self) -> None:
        # initial payload with one neighbor
        first_info = mesh_pb2.NeighborInfo()
        first_info.node_id = self.reporting_node.node_num
        first_neighbor = first_info.neighbors.add()
        first_neighbor.node_id = self.destination_node.node_num
        first_neighbor.snr = 5.0

        handle_neighborinfo(first_info.SerializeToString(), self.packet_data)

        # second payload should replace previous neighbor entries
        second_info = mesh_pb2.NeighborInfo()
        second_info.node_id = self.reporting_node.node_num
        new_neighbor = second_info.neighbors.add()
        new_neighbor.node_id = id_to_num("!00000003")
        new_neighbor.snr = 8.25

        handle_neighborinfo(second_info.SerializeToString(), self.packet_data)

        payload = NeighborInfoPayload.objects.get(packet_data=self.packet_data)
        neighbors = list(payload.neighbors.all())
        self.assertEqual(len(neighbors), 1)
        self.assertEqual(neighbors[0].advertised_node_id, "!00000003")
        self.assertAlmostEqual(float(neighbors[0].snr or 0), 8.25, places=2)

        # original neighbor edge remains but should reflect most recent update for reported neighbor
        new_neighbor_node = Node.objects.get(node_id="!00000003")
        edge = Edge.objects.filter(
            source_node=self.reporting_node, target_node=new_neighbor_node
        ).first()
        self.assertIsNotNone(edge)
        if edge:
            self.assertAlmostEqual(float(edge.last_rx_snr or 0), 8.25, places=2)
