from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import TestCase
from meshtastic.protobuf import portnums_pb2

from ..mesh.packet import handler
from ..models import (
    Channel,
    Interface,
    Node,
    NodeLatencyHistory,
    Packet,
    PublisherReactiveConfig,
)
from ..services.publisher_service import PublisherService


class DummyInterfaceRelation:
    def __init__(self, interfaces):
        self._interfaces = list(interfaces)

    def all(self):
        return list(self._interfaces)


class DummyChannelRelation:
    def __init__(self, channels):
        self._channels = list(channels)

    def all(self):
        return self

    def filter(self, interfaces=None):
        if interfaces is None:
            return DummyChannelRelation(self._channels)
        filtered = [
            channel
            for channel in self._channels
            if interfaces in getattr(channel, "interfaces", [])
        ]
        return DummyChannelRelation(filtered)

    def first(self):
        return self._channels[0] if self._channels else None


class DummyNodeRelation:
    def __init__(self, nodes):
        self._nodes = list(nodes)

    def first(self):
        return self._nodes[0] if self._nodes else None


class PublisherServiceReactiveTests(TestCase):
    def setUp(self) -> None:
        self.publisher = MagicMock(name="publisher")
        self.service = PublisherService(publisher=self.publisher)
        # Ensure the singleton exists and is reset between tests
        config = PublisherReactiveConfig.get_solo()
        config.enabled = False
        config.from_node = ""
        config.gateway_node = ""
        config.channel_key = ""
        config.hop_limit = 3
        config.hop_start = 3
        config.want_ack = False
        config.max_tries = 0
        config.trigger_ports = []
        config.save()
        config.listen_interfaces.clear()
        self.service.configure_reactive_runtime(
            publisher=self.publisher,
            base_topic="msh/base",
        )

    def test_max_tries_enforced_within_window(self):
        self.service.update_reactive_config(
            enabled=True,
            from_node="!aaaa0001",
            max_tries=2,
        )
        self.service.configure_reactive_runtime(publisher=None, base_topic=None)
        self.service.start_reactive_service()

        self.assertTrue(self.service._should_inject_for_node("!bbbb0002"))
        self.assertTrue(self.service._should_inject_for_node("!bbbb0002"))
        self.assertFalse(self.service._should_inject_for_node("!bbbb0002"))

    def test_status_returns_full_channel_key(self):
        test_key = "AQ=="
        self.service.update_reactive_config(channel_key=test_key, max_tries=1)
        status = self.service.get_reactive_status()
        self.assertEqual(status["config"]["channel_key"], test_key)

    def test_listen_interfaces_configured(self):
        interface = Interface.objects.create(
            name=Interface.Names.MQTT, display_name="iface-db"
        )
        config = self.service.update_reactive_config(
            listen_interface_ids=[interface.id]
        )
        self.assertListEqual(
            list(config.listen_interfaces.values_list("id", flat=True)), [interface.id]
        )

        status = self.service.get_reactive_status()
        self.assertListEqual(status["config"]["listen_interface_ids"], [interface.id])
        self.assertEqual(status["config"]["listen_interfaces"][0]["id"], interface.id)

    def test_negative_max_tries_clamped_to_zero(self):
        self.service.update_reactive_config(max_tries=-5)
        status = self.service.get_reactive_status()
        self.assertEqual(status["config"]["max_tries"], 0)

    def test_status_includes_trigger_ports(self):
        ports = ["NODEINFO_APP", "POSITION_APP"]
        self.service.update_reactive_config(trigger_ports=ports)
        status = self.service.get_reactive_status()
        self.assertEqual(status["config"]["trigger_ports"], ports)

    def test_on_packet_received_refreshes_enabled_state(self):
        self.service._reactive_refresh_interval = timedelta(seconds=0)

        config = PublisherReactiveConfig.get_solo()
        config.enabled = False
        config.from_node = "!aaaa0001"
        config.channel_key = "AQ=="
        config.max_tries = 5
        config.trigger_ports = []
        config.save()

        config.enabled = True
        config.save()

        interface_stub = SimpleNamespace(
            pk=1, name="MQTT", status="RUNNING", display_name="iface"
        )
        channel_stub = SimpleNamespace(
            channel_id="LongFast", psk="AQ==", interfaces=[interface_stub]
        )
        gateway_stub = SimpleNamespace(node_id="!gateway0001")
        packet_obj = SimpleNamespace(
            interfaces=DummyInterfaceRelation([interface_stub]),
            channels=DummyChannelRelation([channel_stub]),
            gateway_nodes=DummyNodeRelation([gateway_stub]),
        )

        with patch.object(
            self.service, "_should_inject_for_node", return_value=True
        ), patch.object(
            self.service,
            "_resolve_publish_context",
            return_value=(MagicMock(), "msh/base"),
        ), patch.object(
            self.service, "publish_traceroute"
        ) as mock_publish:
            mock_publish.return_value = (True, 4242)
            from_node = SimpleNamespace(node_id="!bbbb0002")
            to_node = SimpleNamespace(node_id="!cccc0003")

            self.service.on_packet_received(
                packet=MagicMock(),
                decoded_data=MagicMock(),
                portnum=portnums_pb2.TEXT_MESSAGE_APP,
                from_node=from_node,
                to_node=to_node,
                packet_obj=packet_obj,
            )

            mock_publish.assert_called_once()

    def test_on_packet_received_respects_trigger_ports(self):
        self.service.update_reactive_config(
            enabled=True,
            from_node="!aaaa0001",
            channel_key="AQ==",
            max_tries=5,
            trigger_ports=["NODEINFO_APP"],
        )
        self.service.configure_reactive_runtime(publisher=None, base_topic=None)
        self.service.start_reactive_service()

        probed_node = Node.objects.create(
            node_num=int("bbbb0002", 16),
            node_id="!bbbb0002",
            mac_address="bb:bb:bb:bb:bb:02",
        )

        interface_stub = SimpleNamespace(
            pk=1, name="MQTT", status="RUNNING", display_name="iface"
        )
        channel_stub = SimpleNamespace(
            channel_id="LongFast", psk="", interfaces=[interface_stub]
        )
        gateway_stub = SimpleNamespace(node_id="!gateway0001")
        packet_obj = SimpleNamespace(
            interfaces=DummyInterfaceRelation([interface_stub]),
            channels=DummyChannelRelation([channel_stub]),
            gateway_nodes=DummyNodeRelation([gateway_stub]),
        )

        with patch.object(
            self.service, "_should_inject_for_node", return_value=True
        ), patch.object(
            self.service,
            "_resolve_publish_context",
            return_value=(MagicMock(), "msh/base"),
        ), patch.object(
            self.service, "publish_traceroute"
        ) as mock_publish:
            mock_publish.return_value = (True, 4242)
            from_node = SimpleNamespace(node_id="!bbbb0002")
            to_node = SimpleNamespace(node_id="!cccc0003")

            # Non-matching port should skip injection
            self.service.on_packet_received(
                packet=MagicMock(),
                decoded_data=MagicMock(),
                portnum=portnums_pb2.POSITION_APP,
                from_node=from_node,
                to_node=to_node,
                packet_obj=packet_obj,
            )
            mock_publish.assert_not_called()
            probed_node.refresh_from_db()
            self.assertIsNone(probed_node.latency_reachable)
            self.assertIsNone(probed_node.latency_ms)

            # Matching port triggers injection
            self.service.on_packet_received(
                packet=MagicMock(),
                decoded_data=MagicMock(),
                portnum=portnums_pb2.NODEINFO_APP,
                from_node=from_node,
                to_node=to_node,
                packet_obj=packet_obj,
            )
            mock_publish.assert_called_once()
            probed_node.refresh_from_db()
            self.assertFalse(probed_node.latency_reachable)
            self.assertIsNone(probed_node.latency_ms)
            history_entries = NodeLatencyHistory.objects.filter(node=probed_node)
            self.assertEqual(history_entries.count(), 1)
            entry = history_entries.first()
            self.assertIsNotNone(entry)
            if entry:
                self.assertFalse(entry.reachable)
                self.assertIsNone(entry.latency_ms)
                self.assertEqual(entry.probe_message_id, 4242)
                self.assertIsNone(entry.responded_at)

    def test_on_packet_received_injects_traceroute_with_expected_args(self):
        self.service.update_reactive_config(
            enabled=True,
            from_node="!aaaa0001",
            channel_key="",
            max_tries=5,
            trigger_ports=[],
        )
        self.service.configure_reactive_runtime(publisher=None, base_topic=None)
        self.service.start_reactive_service()

        interface_stub = SimpleNamespace(
            pk=1, name="MQTT", status="RUNNING", display_name="iface"
        )
        channel_stub = SimpleNamespace(
            channel_id="LongFast", psk="AQ==", interfaces=[interface_stub]
        )
        gateway_stub = SimpleNamespace(node_id="!gateway0001")
        packet_obj = SimpleNamespace(
            interfaces=DummyInterfaceRelation([interface_stub]),
            channels=DummyChannelRelation([channel_stub]),
            gateway_nodes=DummyNodeRelation([gateway_stub]),
        )

        with patch.object(
            self.service, "_should_inject_for_node", return_value=True
        ), patch.object(
            self.service,
            "_resolve_publish_context",
            return_value=(MagicMock(), "msh/base"),
        ), patch.object(
            self.service, "publish_traceroute"
        ) as mock_publish:
            mock_publish.return_value = (True, 4242)
            from_node = SimpleNamespace(node_id="!bbbb0002")
            to_node = SimpleNamespace(node_id="!cccc0003")

            self.service.on_packet_received(
                packet=MagicMock(),
                decoded_data=MagicMock(),
                portnum=portnums_pb2.TEXT_MESSAGE_APP,
                from_node=from_node,
                to_node=to_node,
                packet_obj=packet_obj,
            )

            mock_publish.assert_called_once()
            _, kwargs = mock_publish.call_args
            self.assertEqual(kwargs["from_node"], "!aaaa0001")
            self.assertEqual(kwargs["to_node"], "!bbbb0002")
            self.assertEqual(kwargs["channel_name"], "LongFast")
            self.assertEqual(kwargs["channel_aes_key"], "AQ==")
            self.assertEqual(kwargs["hop_limit"], 3)
            self.assertEqual(kwargs["hop_start"], 3)
            self.assertFalse(kwargs["want_ack"])

    def test_on_packet_received_defaults_channel_key_when_missing(self):
        self.service.update_reactive_config(
            enabled=True,
            from_node="!aaaa0001",
            channel_key="",
            max_tries=5,
        )
        self.service.configure_reactive_runtime(publisher=None, base_topic=None)
        self.service.start_reactive_service()

        Node.objects.create(
            node_num=int("bbbb0002", 16),
            node_id="!bbbb0002",
            mac_address="bb:bb:bb:bb:bb:02",
        )

        interface_stub = SimpleNamespace(
            pk=1, name="MQTT", status="RUNNING", display_name="iface"
        )
        channel_stub = SimpleNamespace(
            channel_id="LongFast", psk="", interfaces=[interface_stub]
        )
        packet_obj = SimpleNamespace(
            interfaces=DummyInterfaceRelation([interface_stub]),
            channels=DummyChannelRelation([channel_stub]),
            gateway_nodes=DummyNodeRelation([]),
        )

        with patch.object(
            self.service, "_should_inject_for_node", return_value=True
        ), patch.object(
            self.service,
            "_resolve_publish_context",
            return_value=(MagicMock(), "msh/base"),
        ), patch.object(
            self.service, "publish_traceroute"
        ) as mock_publish:
            mock_publish.return_value = (True, 4242)
            from_node = SimpleNamespace(node_id="!bbbb0002")
            to_node = SimpleNamespace(node_id="!cccc0003")

            self.service.on_packet_received(
                packet=MagicMock(),
                decoded_data=MagicMock(),
                portnum=portnums_pb2.NODEINFO_APP,
                from_node=from_node,
                to_node=to_node,
                packet_obj=packet_obj,
            )

            mock_publish.assert_called_once()
            _, kwargs = mock_publish.call_args
            self.assertEqual(kwargs["channel_aes_key"], "AQ==")

    def test_publish_reachability_probe_marks_node_pending(self):
        target_node = Node.objects.create(
            node_num=int("cccc0003", 16),
            node_id="!cccc0003",
            mac_address="cc:cc:cc:cc:cc:03",
        )

        with patch.object(
            self.service, "publish", return_value=True
        ) as mock_publish, patch.object(
            self.service, "_get_global_message_id", return_value=1337
        ):
            result = self.service.publish_reachability_probe(
                from_node="!aaaa0001",
                to_node=target_node.node_id,
                channel_name="LongFast",
                channel_aes_key="",
                hop_limit=3,
                hop_start=3,
            )

        self.assertTrue(result)
        mock_publish.assert_called_once()
        target_node.refresh_from_db()
        self.assertFalse(target_node.latency_reachable)
        self.assertIsNone(target_node.latency_ms)

        history_entries = NodeLatencyHistory.objects.filter(node=target_node)
        self.assertEqual(history_entries.count(), 1)
        entry = history_entries.first()
        self.assertIsNotNone(entry)
        if entry:
            self.assertFalse(entry.reachable)
            self.assertIsNone(entry.latency_ms)
            self.assertEqual(entry.probe_message_id, 1337)
            self.assertIsNone(entry.responded_at)

    def test_publish_traceroute_records_pending_by_default(self):
        target_node = Node.objects.create(
            node_num=int("dddd0004", 16),
            node_id="!dddd0004",
            mac_address="dd:dd:dd:dd:dd:04",
        )

        with patch.object(
            self.service, "publish", return_value=True
        ) as mock_publish, patch.object(
            self.service, "_get_global_message_id", return_value=5555
        ):
            success, message_id = self.service.publish_traceroute(
                from_node="!aaaa0001",
                to_node=target_node.node_id,
                channel_name="LongFast",
                channel_aes_key="",
                hop_limit=3,
                hop_start=3,
            )

        self.assertTrue(success)
        self.assertEqual(message_id, 5555)
        mock_publish.assert_called_once()

        target_node.refresh_from_db()
        self.assertFalse(target_node.latency_reachable)
        self.assertIsNone(target_node.latency_ms)

        history_entries = NodeLatencyHistory.objects.filter(node=target_node)
        self.assertEqual(history_entries.count(), 1)
        entry = history_entries.first()
        self.assertIsNotNone(entry)
        if entry:
            self.assertFalse(entry.reachable)
            self.assertIsNone(entry.latency_ms)
            self.assertEqual(entry.probe_message_id, 5555)
            self.assertIsNone(entry.responded_at)

    def test_on_packet_received_injects_traceroute_with_real_models(self):
        # This test is intentionally "less mocked" than others: it uses the real
        # Packet/Channel/Interface relations so it fails if reactive injection
        # is accidentally short-circuited.

        self.service.update_reactive_config(
            enabled=True,
            from_node="!aaaa0001",
            channel_key="",
            max_tries=5,
            trigger_ports=[],
        )
        self.service.configure_reactive_runtime(
            publisher=self.publisher,
            base_topic="msh/base",
        )
        self.service.start_reactive_service()

        interface = Interface.objects.create(
            name=Interface.Names.MQTT,
            display_name="mqtt-test",
        )
        channel = Channel.objects.create(
            channel_id="LongFast",
            channel_num=0,
            psk="AQ==",
        )
        channel.interfaces.add(interface)

        sender = Node.objects.create(
            node_num=int("bbbb0002", 16),
            node_id="!bbbb0002",
            mac_address="bb:bb:bb:bb:bb:02",
        )
        recipient = Node.objects.create(
            node_num=int("cccc0003", 16),
            node_id="!cccc0003",
            mac_address="cc:cc:cc:cc:cc:03",
        )

        packet_obj = Packet.objects.create(
            packet_id=1234,
            from_node=sender,
            to_node=recipient,
        )
        packet_obj.interfaces.add(interface)
        packet_obj.channels.add(channel)

        with patch.object(
            self.service, "publish_traceroute", return_value=(True, 4242)
        ) as mock_publish:
            self.service.on_packet_received(
                packet=MagicMock(),
                decoded_data=MagicMock(),
                portnum=portnums_pb2.TEXT_MESSAGE_APP,
                from_node=sender,
                to_node=recipient,
                packet_obj=packet_obj,
            )

        mock_publish.assert_called_once()
        sender.refresh_from_db()
        self.assertFalse(sender.latency_reachable)
        self.assertIsNone(sender.latency_ms)
        self.assertTrue(
            NodeLatencyHistory.objects.filter(
                node=sender, probe_message_id=4242
            ).exists()
        )

    def test_publish_traceroute_can_skip_pending_record(self):
        target_node = Node.objects.create(
            node_num=int("eeee0005", 16),
            node_id="!eeee0005",
            mac_address="ee:ee:ee:ee:ee:05",
        )

        with patch.object(
            self.service, "publish", return_value=True
        ) as mock_publish, patch.object(
            self.service, "_get_global_message_id", return_value=6666
        ):
            success, message_id = self.service.publish_traceroute(
                from_node="!aaaa0001",
                to_node=target_node.node_id,
                channel_name="LongFast",
                channel_aes_key="",
                hop_limit=3,
                hop_start=3,
                record_pending=False,
            )

        self.assertTrue(success)
        self.assertEqual(message_id, 6666)
        mock_publish.assert_called_once()

        target_node.refresh_from_db()
        self.assertIsNone(target_node.latency_reachable)
        self.assertIsNone(target_node.latency_ms)
        self.assertFalse(NodeLatencyHistory.objects.filter(node=target_node).exists())


class PublisherServiceDispatchTests(TestCase):
    def setUp(self) -> None:
        # Ensure singleton config exists for tests touching handler helpers
        PublisherReactiveConfig.get_solo()

    def test_dispatch_initializes_service_when_missing(self):
        packet = MagicMock(name="packet")
        decoded = MagicMock(name="decoded")
        portnum = 99
        from_node = MagicMock(name="from_node")
        to_node = MagicMock(name="to_node")
        packet_obj = MagicMock(name="packet_obj")

        with patch(
            "stridetastic_api.mesh.packet.handler.ServiceManager"
        ) as manager_cls:
            manager = manager_cls.get_instance.return_value
            manager.get_publisher_service.return_value = None
            publisher_service = MagicMock(name="publisher_service")
            manager.initialize_publisher_service.return_value = publisher_service

            handler._dispatch_to_publisher_service(
                packet, decoded, portnum, from_node, to_node, packet_obj
            )

            manager.get_publisher_service.assert_called_once_with()
            manager.initialize_publisher_service.assert_called_once_with()
            publisher_service.on_packet_received.assert_called_once_with(
                packet=packet,
                decoded_data=decoded,
                portnum=portnum,
                from_node=from_node,
                to_node=to_node,
                packet_obj=packet_obj,
            )

    def test_dispatch_uses_existing_service_without_reinit(self):
        packet = MagicMock(name="packet")
        decoded = MagicMock(name="decoded")
        portnum = 101
        from_node = MagicMock(name="from_node")
        to_node = MagicMock(name="to_node")
        packet_obj = MagicMock(name="packet_obj")

        with patch(
            "stridetastic_api.mesh.packet.handler.ServiceManager"
        ) as manager_cls:
            manager = manager_cls.get_instance.return_value
            publisher_service = MagicMock(name="publisher_service")
            manager.get_publisher_service.return_value = publisher_service

            handler._dispatch_to_publisher_service(
                packet, decoded, portnum, from_node, to_node, packet_obj
            )

            manager.get_publisher_service.assert_called_once_with()
            manager.initialize_publisher_service.assert_not_called()
            publisher_service.on_packet_received.assert_called_once_with(
                packet=packet,
                decoded_data=decoded,
                portnum=portnum,
                from_node=from_node,
                to_node=to_node,
                packet_obj=packet_obj,
            )

    def test_dispatch_imports_service_manager_when_module_var_is_none(self):
        packet = MagicMock(name="packet")
        decoded = MagicMock(name="decoded")
        portnum = 42
        from_node = MagicMock(name="from_node")
        to_node = MagicMock(name="to_node")
        packet_obj = MagicMock(name="packet_obj")

        publisher_service = MagicMock(name="publisher_service")
        manager = MagicMock(name="manager")
        manager.get_publisher_service.return_value = publisher_service

        with patch.object(handler, "ServiceManager", None), patch(
            "stridetastic_api.services.service_manager.ServiceManager"
        ) as imported_manager_cls:
            imported_manager_cls.get_instance.return_value = manager

            handler._dispatch_to_publisher_service(
                packet, decoded, portnum, from_node, to_node, packet_obj
            )

            imported_manager_cls.get_instance.assert_called_once_with()
            publisher_service.on_packet_received.assert_called_once_with(
                packet=packet,
                decoded_data=decoded,
                portnum=portnum,
                from_node=from_node,
                to_node=to_node,
                packet_obj=packet_obj,
            )

    def test_on_message_dispatches_to_publisher_service(self):
        # Regression guard: ensure on_message() actually invokes the publisher-service dispatcher.
        packet_stub = SimpleNamespace(
            **{
                "from": int("bbbb0002", 16),
                "to": int("cccc0003", 16),
                "id": 123,
                "channel": 0,
                "rx_rssi": None,
                "rx_snr": None,
                "rx_time": None,
                "hop_limit": None,
                "hop_start": None,
                "first_hop": None,
                "next_hop": None,
                "want_ack": None,
                "relay_node": None,
                "delayed": False,
                "via_mqtt": True,
                "public_key": None,
                "priority": None,
                "pki_encrypted": False,
            }
        )
        normalized = {
            "gateway_node_id": "!aaaa0001",
            "channel_id": "LongFast",
            "packet": packet_stub,
            "interface_id": None,
        }

        # Avoid protobuf/decrypt complexity: stub handle_packet return tuple.
        fake_decoded = MagicMock(name="decoded")
        fake_portnum = portnums_pb2.TEXT_MESSAGE_APP

        with patch(
            "stridetastic_api.mesh.packet.handler.handle_packet"
        ) as handle_packet_mock, patch(
            "stridetastic_api.mesh.packet.handler._dispatch_to_publisher_service"
        ) as dispatch_mock:
            # handle_packet is called with the real Packet model instance; we just pass-through.
            def _fake_handle_packet(
                *, packet, from_node, to_node, packet_obj, **_kwargs
            ):
                return (
                    packet,
                    fake_decoded,
                    fake_portnum,
                    from_node,
                    to_node,
                    packet_obj,
                )

            handle_packet_mock.side_effect = _fake_handle_packet

            handler.on_message(None, None, normalized, iface="MQTT")

            dispatch_mock.assert_called_once()
