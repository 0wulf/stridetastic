from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase

from ..controllers.interface_controller import InterfaceController
from ..models import Interface


class InterfaceControllerActionTests(TestCase):
    def setUp(self) -> None:
        self.controller = InterfaceController()
        self.interface = Interface.objects.create(
            name=Interface.Names.MQTT,
            display_name="iface-1",
            is_enabled=True,
            status=Interface.Status.STOPPED,
        )

    def test_start_interface_queues_task(self) -> None:
        with patch(
            "stridetastic_api.controllers.interface_controller.start_interface_task"
        ) as task:
            task.delay.return_value.get.return_value = {
                "success": True,
                "status": 200,
                "message": "Interface started",
            }
            status, response = self.controller.start_interface(
                SimpleNamespace(), self.interface.id
            )

        task.delay.assert_called_once_with(interface_id=self.interface.id)
        self.assertEqual(status, 200)
        self.assertEqual(response.message, "Interface started")

    def test_stop_interface_queues_task(self) -> None:
        with patch(
            "stridetastic_api.controllers.interface_controller.stop_interface_task"
        ) as task:
            task.delay.return_value.get.return_value = {
                "success": True,
                "status": 200,
                "message": "Interface stopped",
            }
            status, response = self.controller.stop_interface(
                SimpleNamespace(), self.interface.id
            )

        task.delay.assert_called_once_with(interface_id=self.interface.id)
        self.assertEqual(status, 200)
        self.assertEqual(response.message, "Interface stopped")

    def test_restart_interface_queues_task(self) -> None:
        with patch(
            "stridetastic_api.controllers.interface_controller.restart_interface_task"
        ) as task:
            task.delay.return_value.get.return_value = {
                "success": True,
                "status": 200,
                "message": "Interface restarted",
            }
            status, response = self.controller.restart_interface(
                SimpleNamespace(), self.interface.id
            )

        task.delay.assert_called_once_with(interface_id=self.interface.id)
        self.assertEqual(status, 200)
        self.assertEqual(response.message, "Interface restarted")

    def test_start_interface_missing_returns_404(self) -> None:
        status, response = self.controller.start_interface(SimpleNamespace(), 999)

        self.assertEqual(status, 404)
        self.assertEqual(response.message, "Interface not found")

    def test_stop_interface_missing_returns_404(self) -> None:
        status, response = self.controller.stop_interface(SimpleNamespace(), 999)

        self.assertEqual(status, 404)
        self.assertEqual(response.message, "Interface not found")

    def test_restart_interface_missing_returns_404(self) -> None:
        status, response = self.controller.restart_interface(SimpleNamespace(), 999)

        self.assertEqual(status, 404)
        self.assertEqual(response.message, "Interface not found")
