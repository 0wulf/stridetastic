from types import SimpleNamespace

from django.test import TestCase

from ..controllers.keepalive_controller import KeepaliveController
from ..models import Interface, KeepaliveConfig, Node
from ..schemas.keepalive_schemas import KeepaliveConfigUpdateSchema


class KeepaliveControllerTests(TestCase):
    def setUp(self) -> None:
        self.controller = KeepaliveController()
        config = KeepaliveConfig.get_solo()
        config.enabled = False
        config.payload_type = KeepaliveConfig.PayloadTypes.REACHABILITY
        config.from_node = ""
        config.gateway_node = ""
        config.channel_name = ""
        config.channel_key = ""
        config.hop_limit = 3
        config.hop_start = 3
        config.scope = KeepaliveConfig.Scope.ALL
        config.save()
        config.selected_nodes.clear()

    def test_update_config_saves_publish_settings(self):
        iface = Interface.objects.create(
            name=Interface.Names.MQTT, display_name="mqtt-1"
        )
        node = Node.objects.create(
            node_num=1,
            node_id="!00000001",
            mac_address="00:00:00:00:00:01",
            is_virtual=True,
        )

        payload = KeepaliveConfigUpdateSchema(
            enabled=True,
            payload_type="traceroute",
            from_node=node.node_id,
            gateway_node="!00000002",
            channel_name="LongFast",
            channel_key="",
            hop_limit=4,
            hop_start=2,
            interface_id=iface.id,
            scope=KeepaliveConfig.Scope.SELECTED,
            selected_node_ids=[node.id],
        )

        status, response = self.controller.update_config(SimpleNamespace(), payload)
        self.assertEqual(status, 200)
        self.assertTrue(response.config.enabled)
        self.assertEqual(response.config.payload_type, "traceroute")
        self.assertEqual(response.config.from_node, node.node_id)
        self.assertEqual(response.config.channel_name, "LongFast")
        self.assertEqual(response.config.hop_limit, 4)
        self.assertEqual(response.config.hop_start, 2)
        self.assertEqual(response.config.interface_id, iface.id)
        self.assertEqual(response.config.selected_node_ids, [node.id])

    def test_update_config_clears_fields(self):
        config = KeepaliveConfig.get_solo()
        config.from_node = "!00000001"
        config.channel_name = "LongFast"
        config.channel_key = "AQ=="
        config.save()

        payload = KeepaliveConfigUpdateSchema(
            from_node=None,
            channel_name=None,
            channel_key=None,
        )

        status, response = self.controller.update_config(SimpleNamespace(), payload)
        self.assertEqual(status, 200)
        self.assertIsNone(response.config.from_node)
        self.assertIsNone(response.config.channel_name)
        self.assertIsNone(response.config.channel_key)

    def test_status_includes_interface_metadata(self):
        iface = Interface.objects.create(
            name=Interface.Names.MQTT, display_name="mqtt-1"
        )
        config = KeepaliveConfig.get_solo()
        config.interface = iface
        config.save()

        status, response = self.controller.get_status(SimpleNamespace())
        self.assertEqual(status, 200)
        self.assertEqual(response.config.interface.id, iface.id)
        self.assertEqual(response.config.interface.display_name, "mqtt-1")
