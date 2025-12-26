from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

from django.test import TestCase  # type: ignore[import]
from django.utils import timezone  # type: ignore[import]

from ..controllers.metrics_controller import MetricsController
from ..models import (
    Node,
    Edge,
    Interface,
    Channel,
    NetworkOverviewSnapshot,
    NodeLink,
)


class MetricsControllerTests(TestCase):
    def setUp(self) -> None:
        self.controller = MetricsController()

        self.interface = Interface.objects.create(
            name=Interface.Names.MQTT,
            display_name="iface",
        )

        self.node_a = Node.objects.create(
            node_num=1,
            node_id="!00000001",
            mac_address="00:00:00:00:00:01",
            battery_level=40,
        )
        self.node_b = Node.objects.create(
            node_num=2,
            node_id="!00000002",
            mac_address="00:00:00:00:00:02",
            battery_level=60,
        )
        self.node_a.latency_reachable = True
        self.node_a.save(update_fields=["latency_reachable"])
        self.node_b.latency_reachable = False
        self.node_b.save(update_fields=["latency_reachable"])

        self.edge = Edge.objects.create(
            source_node=self.node_a,
            target_node=self.node_b,
        )
        self.edge.interfaces.add(self.interface)
        self.edge.last_seen = timezone.now()
        self.edge.last_rx_rssi = -45
        self.edge.last_rx_snr = Decimal("9.5")
        self.edge.save(update_fields=["last_seen", "last_rx_rssi", "last_rx_snr"])

        self.channel = Channel.objects.create(channel_id="LongFast", channel_num=0)
        self.channel.interfaces.add(self.interface)
        self.channel.members.add(self.node_a, self.node_b)

        NodeLink.objects.create(
            node_a=self.node_a,
            node_b=self.node_b,
            node_a_to_node_b_packets=3,
            node_b_to_node_a_packets=1,
            last_activity=timezone.now(),
        )

    def test_overview_metrics_records_snapshot_and_history(self) -> None:
        status, payload = self.controller.get_overview_metrics(SimpleNamespace())

        self.assertEqual(status, 200)
        self.assertEqual(payload.current.total_nodes, 2)
        self.assertEqual(payload.current.active_nodes, 2)
        self.assertEqual(payload.current.reachable_nodes, 1)
        self.assertEqual(payload.current.active_connections, 1)
        self.assertEqual(payload.current.channels, 1)
        self.assertAlmostEqual(payload.current.avg_battery or 0.0, 50.0)
        self.assertAlmostEqual(payload.current.avg_rssi or 0.0, -45.0)
        self.assertAlmostEqual(payload.current.avg_snr or 0.0, 9.5)

        self.assertEqual(NetworkOverviewSnapshot.objects.count(), 1)
        self.assertEqual(len(payload.history), 1)
        self.assertEqual(payload.history[0].reachable_nodes, 1)

    def test_history_filters_and_optional_snapshot(self) -> None:
        self.controller.get_overview_metrics(SimpleNamespace())
        self.assertEqual(NetworkOverviewSnapshot.objects.count(), 1)

        ten_minutes_ago = timezone.now() - timedelta(minutes=10)
        NetworkOverviewSnapshot.objects.update(time=ten_minutes_ago)

        status, payload = self.controller.get_overview_metrics(
            SimpleNamespace(),
            history_last="5min",
            record_snapshot=False,
        )

        self.assertEqual(status, 200)
        self.assertEqual(NetworkOverviewSnapshot.objects.count(), 1)
        self.assertEqual(len(payload.history), 0)

        status, payload = self.controller.get_overview_metrics(
            SimpleNamespace(),
            include_history=True,
            history_last="1hour",
            record_snapshot=False,
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(payload.history), 1)
        self.assertEqual(payload.history[0].reachable_nodes, 1)

    def test_reachable_nodes_excludes_inactive_nodes(self) -> None:
        inactive_time = timezone.now() - timedelta(hours=2)
        Node.objects.filter(pk=self.node_a.pk).update(last_seen=inactive_time)

        status, payload = self.controller.get_overview_metrics(SimpleNamespace())

        self.assertEqual(status, 200)
        self.assertEqual(payload.current.total_nodes, 2)
        self.assertEqual(payload.current.active_nodes, 1)
        self.assertEqual(payload.current.reachable_nodes, 0)

        snapshot = NetworkOverviewSnapshot.objects.order_by("-time").first()
        self.assertIsNotNone(snapshot)
        if snapshot:
            self.assertEqual(snapshot.reachable_nodes, 0)