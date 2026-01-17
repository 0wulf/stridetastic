from django.test import TestCase  # type: ignore[import]

from ..models import Node, NodeLink
from ..models.packet_models import Packet


class NodeLinkManagerTests(TestCase):
    def setUp(self) -> None:
        self.broadcast = Node.objects.create(
            node_num=0xFFFFFFFF,
            node_id="!ffffffff",
            mac_address="FF:FF:FF:FF:FF:FF",
        )
        self.first_node = Node.objects.create(
            node_num=0x00000001,
            node_id="!00000001",
            mac_address="00:00:00:00:00:01",
        )

    def _create_packet(self, *, sender: Node, receiver: Node, packet_id: int) -> Packet:
        return Packet.objects.create(
            from_node=sender,
            to_node=receiver,
            packet_id=packet_id,
        )

    def test_record_activity_orders_by_node_num(self) -> None:
        # Broadcast node is created first so pk ordering would otherwise be incorrect.
        packet = self._create_packet(
            sender=self.first_node, receiver=self.broadcast, packet_id=101
        )

        link = NodeLink.objects.record_activity(
            from_node=self.first_node,
            to_node=self.broadcast,
            packet=packet,
            channel=None,
        )
        self.assertIsNotNone(link)
        assert link is not None

        self.assertEqual(link.node_a, self.first_node)
        self.assertEqual(link.node_b, self.broadcast)
        self.assertEqual(link.node_a_to_node_b_packets, 1)
        self.assertEqual(link.node_b_to_node_a_packets, 0)

    def test_reverse_direction_updates_same_link(self) -> None:
        packet_forward = self._create_packet(
            sender=self.first_node, receiver=self.broadcast, packet_id=201
        )
        forward_link = NodeLink.objects.record_activity(
            from_node=self.first_node,
            to_node=self.broadcast,
            packet=packet_forward,
            channel=None,
        )
        assert forward_link is not None

        packet_reverse = self._create_packet(
            sender=self.broadcast, receiver=self.first_node, packet_id=202
        )
        reverse_link = NodeLink.objects.record_activity(
            from_node=self.broadcast,
            to_node=self.first_node,
            packet=packet_reverse,
            channel=None,
        )
        assert reverse_link is not None

        self.assertEqual(forward_link.pk, reverse_link.pk)
        reverse_link.refresh_from_db()
        self.assertEqual(reverse_link.node_a, self.first_node)
        self.assertEqual(reverse_link.node_b, self.broadcast)
        self.assertEqual(reverse_link.node_a_to_node_b_packets, 1)
        self.assertEqual(reverse_link.node_b_to_node_a_packets, 1)
        self.assertTrue(reverse_link.is_bidirectional)
