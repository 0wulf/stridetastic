from datetime import timedelta

from django.test import TestCase  # type: ignore[import]
from django.utils import timezone  # type: ignore[import]
from meshtastic.protobuf import mesh_pb2  # type: ignore[import]

from ..mesh.packet.handler import (
    BROADCAST_NODE_ID,
    BROADCAST_NODE_NUM,
    handle_route_discovery,
    handle_routing,
)
from ..models import Edge, Node, NodeLatencyHistory, Packet
from ..models.packet_models import (
    PacketData,
    RouteDiscoveryPayload,
    RouteDiscoveryRoute,
)


class RouteDiscoveryBroadcastTests(TestCase):
    def setUp(self) -> None:
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

    def test_request_traceroute_with_broadcast_skips_only_broadcast_node(self) -> None:
        packet = Packet.objects.create(
            from_node=self.origin_node,
            to_node=self.destination_node,
        )
        packet_data = PacketData.objects.create(packet=packet, request_id=0)
        initial_node_count = Node.objects.count()

        route_discovery = mesh_pb2.RouteDiscovery()
        route_discovery.route.extend([BROADCAST_NODE_NUM])
        payload = route_discovery.SerializeToString()

        handle_route_discovery(payload, packet_data)

        self.assertEqual(RouteDiscoveryPayload.objects.count(), 1)
        self.assertEqual(RouteDiscoveryRoute.objects.count(), 1)
        self.assertEqual(Edge.objects.count(), 0)
        self.assertEqual(Node.objects.count(), initial_node_count)
        self.assertFalse(Node.objects.filter(node_id=BROADCAST_NODE_ID).exists())

        route_route = RouteDiscoveryRoute.objects.first()
        self.assertIsNotNone(route_route)
        if route_route:
            self.assertNotIn(BROADCAST_NODE_ID, route_route.node_list or [])

    def test_response_traceroute_with_broadcast_updates_ack_and_skips_edges(
        self,
    ) -> None:
        responder_node = Node.objects.create(
            node_num=0x3,
            node_id="!00000003",
            mac_address="00:00:00:00:00:03",
        )
        ack_request_packet = Packet.objects.create(
            from_node=self.origin_node,
            to_node=responder_node,
            packet_id=1234,
            ackd=False,
        )
        request_packet_data = PacketData.objects.create(packet=ack_request_packet)
        ack_request_packet.time = timezone.now() - timedelta(milliseconds=250)
        ack_request_packet.save(update_fields=["time"])

        response_packet = Packet.objects.create(
            from_node=responder_node,
            to_node=self.origin_node,
        )
        response_packet_data = PacketData.objects.create(
            packet=response_packet,
            request_id=ack_request_packet.packet_id,
        )

        route_discovery = mesh_pb2.RouteDiscovery()
        route_discovery.route.extend([BROADCAST_NODE_NUM])
        route_discovery.route_back.extend([BROADCAST_NODE_NUM])
        payload = route_discovery.SerializeToString()

        handle_route_discovery(payload, response_packet_data)

        ack_request_packet.refresh_from_db()
        request_packet_data.refresh_from_db()
        self.assertTrue(ack_request_packet.ackd)
        self.assertTrue(request_packet_data.got_response)
        self.assertEqual(RouteDiscoveryPayload.objects.count(), 0)
        self.assertEqual(RouteDiscoveryRoute.objects.count(), 0)
        self.assertEqual(Edge.objects.count(), 0)
        self.assertFalse(Node.objects.filter(node_id=BROADCAST_NODE_ID).exists())
        responder_node.refresh_from_db()
        self.assertTrue(responder_node.latency_reachable)
        self.assertIsNotNone(responder_node.latency_ms)
        self.assertGreater(responder_node.latency_ms or 0, 0)
        history = NodeLatencyHistory.objects.filter(node=responder_node)
        self.assertEqual(history.count(), 1)
        entry = history.first()
        self.assertIsNotNone(entry)
        if entry:
            self.assertTrue(entry.reachable)
            self.assertEqual(entry.latency_ms, responder_node.latency_ms)

    def test_response_traceroute_with_broadcast_in_middle_skips_only_broadcast_edges(
        self,
    ) -> None:
        responder_node = Node.objects.create(
            node_num=0x3,
            node_id="!00000003",
            mac_address="00:00:00:00:00:03",
        )
        relay_node = Node.objects.create(
            node_num=0x4,
            node_id="!00000004",
            mac_address="00:00:00:00:00:04",
        )

        ack_request_packet = Packet.objects.create(
            from_node=responder_node,
            to_node=self.origin_node,
            packet_id=5678,
            ackd=False,
        )
        PacketData.objects.create(packet=ack_request_packet)

        response_packet = Packet.objects.create(
            from_node=self.origin_node,
            to_node=responder_node,
        )
        response_packet_data = PacketData.objects.create(
            packet=response_packet,
            request_id=ack_request_packet.packet_id,
        )

        route_discovery = mesh_pb2.RouteDiscovery()
        route_discovery.route.extend([relay_node.node_num, BROADCAST_NODE_NUM])
        route_discovery.route_back.extend([relay_node.node_num, BROADCAST_NODE_NUM])
        route_discovery.snr_towards.extend([8, 6])
        route_discovery.snr_back.extend([6, 8])
        payload = route_discovery.SerializeToString()

        handle_route_discovery(payload, response_packet_data)

        edges = list(Edge.objects.all())
        self.assertEqual(len(edges), 3)

        forward_edge = next(
            e
            for e in edges
            if e.source_node == responder_node and e.target_node == relay_node
        )
        reverse_edge = next(
            e
            for e in edges
            if e.source_node == self.origin_node and e.target_node == relay_node
        )
        unknown_hop_edge = next(
            e
            for e in edges
            if e.source_node == relay_node and e.target_node == self.origin_node
        )

        self.assertEqual(forward_edge.last_rx_snr, 8 / 4)
        self.assertEqual(forward_edge.last_hops, 0)
        self.assertEqual(reverse_edge.last_rx_snr, 6 / 4)
        self.assertEqual(reverse_edge.last_hops, 0)
        self.assertEqual(unknown_hop_edge.last_hops, 1)
        self.assertIsNone(unknown_hop_edge.last_rx_snr)
        self.assertFalse(Node.objects.filter(node_id=BROADCAST_NODE_ID).exists())

    def test_response_traceroute_with_consecutive_broadcast_records_unknown_hops(
        self,
    ) -> None:
        source_node = Node.objects.create(
            node_num=int("11223344", 16),
            node_id="!11223344",
            mac_address="11:22:33:44:55:66",
        )
        intermediate_node = Node.objects.create(
            node_num=int("aabbccdd", 16),
            node_id="!aabbccdd",
            mac_address="aa:bb:cc:dd:ee:ff",
        )
        destination_node = Node.objects.create(
            node_num=int("ddccbbaa", 16),
            node_id="!ddccbbaa",
            mac_address="dd:cc:bb:aa:00:11",
        )

        ack_request_packet = Packet.objects.create(
            from_node=source_node,
            to_node=destination_node,
            packet_id=9012,
            ackd=False,
        )
        PacketData.objects.create(packet=ack_request_packet)

        response_packet = Packet.objects.create(
            from_node=destination_node,
            to_node=source_node,
        )
        response_packet_data = PacketData.objects.create(
            packet=response_packet,
            request_id=ack_request_packet.packet_id,
        )

        route_discovery = mesh_pb2.RouteDiscovery()
        route_discovery.route.extend(
            [BROADCAST_NODE_NUM, BROADCAST_NODE_NUM, intermediate_node.node_num]
        )
        route_discovery.snr_towards.extend([7, 6, 5])
        payload = route_discovery.SerializeToString()

        handle_route_discovery(payload, response_packet_data)

        edge = Edge.objects.filter(
            source_node=source_node, target_node=intermediate_node
        ).first()
        self.assertIsNotNone(edge)
        if edge:
            self.assertEqual(edge.last_hops, 2)

    def test_routing_ack_updates_reachability_metrics(self) -> None:
        responder_node = Node.objects.create(
            node_num=0x5,
            node_id="!00000005",
            mac_address="00:00:00:00:00:05",
        )

        ack_request_packet = Packet.objects.create(
            from_node=self.origin_node,
            to_node=responder_node,
            packet_id=2468,
            ackd=False,
        )
        request_data = PacketData.objects.create(packet=ack_request_packet)
        ack_request_packet.time = timezone.now() - timedelta(milliseconds=180)
        ack_request_packet.save(update_fields=["time"])

        response_packet = Packet.objects.create(
            from_node=responder_node,
            to_node=self.origin_node,
        )
        response_packet_data = PacketData.objects.create(
            packet=response_packet,
            request_id=ack_request_packet.packet_id,
        )

        routing = mesh_pb2.Routing()
        payload = routing.SerializeToString()

        handle_routing(payload, response_packet_data)

        ack_request_packet.refresh_from_db()
        request_data.refresh_from_db()
        responder_node.refresh_from_db()

        self.assertTrue(ack_request_packet.ackd)
        self.assertTrue(request_data.got_response)
        self.assertTrue(responder_node.latency_reachable)
        self.assertIsNotNone(responder_node.latency_ms)
        self.assertGreaterEqual(responder_node.latency_ms or 0, 0)

    def test_routing_ack_updates_existing_pending_history(self) -> None:
        responder_node = Node.objects.create(
            node_num=0x6,
            node_id="!00000006",
            mac_address="00:00:00:00:00:06",
        )

        request_packet = Packet.objects.create(
            from_node=self.origin_node,
            to_node=responder_node,
            packet_id=7777,
            ackd=False,
        )
        PacketData.objects.create(packet=request_packet)
        request_time = timezone.now() - timedelta(milliseconds=180)
        request_packet.time = request_time
        request_packet.save(update_fields=["time"])

        NodeLatencyHistory.objects.create(
            node=responder_node,
            reachable=False,
            latency_ms=None,
            probe_message_id=request_packet.packet_id,
        )

        response_packet = Packet.objects.create(
            from_node=responder_node,
            to_node=self.origin_node,
        )
        response_time = request_time + timedelta(milliseconds=180)
        response_packet.time = response_time
        response_packet.save(update_fields=["time"])
        response_data = PacketData.objects.create(
            packet=response_packet,
            request_id=request_packet.packet_id,
        )

        routing = mesh_pb2.Routing()
        payload = routing.SerializeToString()

        handle_routing(payload, response_data)

        responder_node.refresh_from_db()
        self.assertTrue(responder_node.latency_reachable)
        self.assertEqual(responder_node.latency_ms, 180)

        history_entries = NodeLatencyHistory.objects.filter(node=responder_node)
        self.assertEqual(history_entries.count(), 1)
        entry = history_entries.first()
        self.assertIsNotNone(entry)
        if entry:
            self.assertTrue(entry.reachable)
            self.assertEqual(entry.latency_ms, 180)
            self.assertEqual(entry.probe_message_id, request_packet.packet_id)
            self.assertIsNotNone(entry.responded_at)
            if entry.responded_at:
                self.assertEqual(entry.responded_at, response_time)
