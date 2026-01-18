from types import SimpleNamespace
from unittest.mock import MagicMock

from django.test import TestCase, override_settings

from ..controllers.publisher_controller import PublisherController
from ..models import Interface, Node, PublisherReactiveConfig
from ..schemas import PublisherReactiveConfigUpdateSchema
from ..services.publisher_service import PublisherService


class PublisherControllerReactiveConfigTests(TestCase):
    def setUp(self) -> None:
        self.controller = PublisherController()
        self.service_manager = MagicMock()
        self.publisher_service = PublisherService(publisher=MagicMock())
        self.service_manager.initialize_publisher_service.return_value = (
            self.publisher_service
        )
        self.controller.service_manager = self.service_manager

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

    def test_update_reactive_config_saves_and_refreshes(self) -> None:
        interface = Interface.objects.create(
            name=Interface.Names.MQTT, display_name="iface"
        )
        source_node = Node.objects.create(
            node_num=1,
            node_id="!00000001",
            mac_address="00:00:00:00:00:01",
            is_virtual=True,
        )
        gateway_node = Node.objects.create(
            node_num=2,
            node_id="!00000002",
            mac_address="00:00:00:00:00:02",
            is_virtual=True,
        )

        payload = PublisherReactiveConfigUpdateSchema(
            enabled=True,
            from_node=source_node.node_id,
            gateway_node=gateway_node.node_id,
            channel_key="AQ==",
            hop_limit=4,
            hop_start=2,
            want_ack=True,
            listen_interface_ids=[interface.id],
            max_tries=5,
            trigger_ports=["NODEINFO_APP"],
        )

        status, response = self.controller.update_reactive_config(
            SimpleNamespace(), payload
        )

        self.assertEqual(status, 200)
        self.assertTrue(response["config"]["enabled"])
        self.assertEqual(response["config"]["from_node"], source_node.node_id)
        self.assertEqual(response["config"]["gateway_node"], gateway_node.node_id)
        self.assertEqual(response["config"]["channel_key"], "AQ==")
        self.assertEqual(response["config"]["hop_limit"], 4)
        self.assertEqual(response["config"]["hop_start"], 2)
        self.assertTrue(response["config"]["want_ack"])
        self.assertEqual(response["config"]["max_tries"], 5)
        self.assertEqual(response["config"]["trigger_ports"], ["NODEINFO_APP"])
        self.assertEqual(response["config"]["listen_interface_ids"], [interface.id])

        self.service_manager.refresh_publisher_reactive_runtime.assert_called_once()

    @override_settings(SET_VIRTUAL_NODES=True)
    def test_update_reactive_config_rejects_non_virtual_nodes(self) -> None:
        non_virtual = Node.objects.create(
            node_num=3,
            node_id="!00000003",
            mac_address="00:00:00:00:00:03",
            is_virtual=False,
        )

        payload = PublisherReactiveConfigUpdateSchema(from_node=non_virtual.node_id)

        status, response = self.controller.update_reactive_config(
            SimpleNamespace(), payload
        )

        self.assertEqual(status, 400)
        self.assertIn("must be virtual", response.message)
        self.service_manager.refresh_publisher_reactive_runtime.assert_not_called()
