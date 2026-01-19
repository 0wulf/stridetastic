from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.utils import timezone

from ..models import KeepaliveConfig, Node, NodePresenceHistory
from ..services.keepalive_service import KeepaliveService


class KeepaliveServiceTests(TestCase):
    def setUp(self) -> None:
        self.service = KeepaliveService()
        config = KeepaliveConfig.get_solo()
        config.enabled = False
        config.payload_type = KeepaliveConfig.PayloadTypes.REACHABILITY
        config.from_node = ""
        config.gateway_node = ""
        config.channel_name = ""
        config.channel_key = ""
        config.hop_limit = 3
        config.hop_start = 3
        config.offline_after_seconds = 3600
        config.check_interval_seconds = 60
        config.scope = KeepaliveConfig.Scope.ALL
        config.save()
        config.selected_nodes.clear()

    def _make_node(self, node_id: str, node_num: int) -> Node:
        return Node.objects.create(
            node_num=node_num,
            node_id=node_id,
            mac_address=f"00:00:00:00:00:{node_num:02x}",
        )

    def test_records_transition_and_publishes_reachability(self):
        fixed_now = timezone.now()
        target = self._make_node("!00000002", 2)
        last_seen = fixed_now - timedelta(seconds=3610)
        Node.objects.filter(pk=target.pk).update(last_seen=last_seen)

        config = KeepaliveConfig.get_solo()
        config.enabled = True
        config.payload_type = KeepaliveConfig.PayloadTypes.REACHABILITY
        config.from_node = "!00000001"
        config.channel_name = "LongFast"
        config.channel_key = ""
        config.last_run_at = fixed_now - timedelta(seconds=120)
        config.save()

        publisher_service = MagicMock()
        service_manager = SimpleNamespace(
            initialize_publisher_service=MagicMock(return_value=publisher_service),
            resolve_publish_context=MagicMock(return_value=(None, None, None)),
        )

        with patch(
            "stridetastic_api.services.keepalive_service.timezone.now",
            return_value=fixed_now,
        ), patch(
            "stridetastic_api.services.service_manager.ServiceManager.get_instance",
            return_value=service_manager,
        ):
            count = self.service.run_check()

        self.assertEqual(count, 1)
        self.assertEqual(NodePresenceHistory.objects.count(), 1)
        publisher_service.publish_reachability_probe.assert_called_once()
        _, kwargs = publisher_service.publish_reachability_probe.call_args
        self.assertEqual(kwargs["from_node"], config.from_node)
        self.assertEqual(kwargs["to_node"], target.node_id)
        self.assertEqual(kwargs["channel_name"], config.channel_name)
        self.assertEqual(kwargs["channel_aes_key"], config.channel_key)
        self.assertEqual(kwargs["priority"], "ACK")

    def test_publishes_traceroute_when_selected(self):
        fixed_now = timezone.now()
        target = self._make_node("!00000003", 3)
        Node.objects.filter(pk=target.pk).update(
            last_seen=fixed_now - timedelta(seconds=3615)
        )

        config = KeepaliveConfig.get_solo()
        config.enabled = True
        config.payload_type = KeepaliveConfig.PayloadTypes.TRACEROUTE
        config.from_node = "!00000001"
        config.channel_name = "LongFast"
        config.last_run_at = fixed_now - timedelta(seconds=120)
        config.save()

        publisher_service = MagicMock()
        service_manager = SimpleNamespace(
            initialize_publisher_service=MagicMock(return_value=publisher_service),
            resolve_publish_context=MagicMock(return_value=(None, None, None)),
        )

        with patch(
            "stridetastic_api.services.keepalive_service.timezone.now",
            return_value=fixed_now,
        ), patch(
            "stridetastic_api.services.service_manager.ServiceManager.get_instance",
            return_value=service_manager,
        ):
            count = self.service.run_check()

        self.assertEqual(count, 1)
        publisher_service.publish_traceroute.assert_called_once()
        _, kwargs = publisher_service.publish_traceroute.call_args
        self.assertEqual(kwargs["priority"], "ACK")
        self.assertTrue(kwargs["record_pending"])

    def test_selected_scope_filters_nodes(self):
        fixed_now = timezone.now()
        target_a = self._make_node("!00000004", 4)
        target_b = self._make_node("!00000005", 5)
        Node.objects.filter(pk=target_a.pk).update(
            last_seen=fixed_now - timedelta(seconds=3610)
        )
        Node.objects.filter(pk=target_b.pk).update(
            last_seen=fixed_now - timedelta(seconds=3610)
        )

        config = KeepaliveConfig.get_solo()
        config.enabled = True
        config.payload_type = KeepaliveConfig.PayloadTypes.REACHABILITY
        config.from_node = "!00000001"
        config.channel_name = "LongFast"
        config.scope = KeepaliveConfig.Scope.SELECTED
        config.last_run_at = fixed_now - timedelta(seconds=120)
        config.save()
        config.selected_nodes.set([target_a])

        publisher_service = MagicMock()
        service_manager = SimpleNamespace(
            initialize_publisher_service=MagicMock(return_value=publisher_service),
            resolve_publish_context=MagicMock(return_value=(None, None, None)),
        )

        with patch(
            "stridetastic_api.services.keepalive_service.timezone.now",
            return_value=fixed_now,
        ), patch(
            "stridetastic_api.services.service_manager.ServiceManager.get_instance",
            return_value=service_manager,
        ):
            count = self.service.run_check()

        self.assertEqual(count, 1)
        self.assertEqual(NodePresenceHistory.objects.count(), 1)
        _, kwargs = publisher_service.publish_reachability_probe.call_args
        self.assertEqual(kwargs["to_node"], target_a.node_id)

    def test_missing_publish_config_sets_error(self):
        fixed_now = timezone.now()
        target = self._make_node("!00000006", 6)
        Node.objects.filter(pk=target.pk).update(
            last_seen=fixed_now - timedelta(seconds=3610)
        )

        config = KeepaliveConfig.get_solo()
        config.enabled = True
        config.payload_type = KeepaliveConfig.PayloadTypes.REACHABILITY
        config.from_node = ""
        config.channel_name = ""
        config.last_run_at = fixed_now - timedelta(seconds=120)
        config.save()

        with patch(
            "stridetastic_api.services.keepalive_service.timezone.now",
            return_value=fixed_now,
        ):
            count = self.service.run_check()

        config.refresh_from_db()
        self.assertEqual(count, 0)
        self.assertIn("incomplete", config.last_error_message)
