from typing import Optional

from ..interfaces.mqtt_interface import MqttInterface
from ..tasks.sniffer_tasks import run_serial_interface


class SnifferService:
    """Service to manage sniffer interfaces (MQTT, serial, TCP, etc)."""

    def __init__(
        self,
        mqtt_interface: Optional[MqttInterface] = None,
        serial_config: Optional[dict] = None,
    ):
        self.mqtt_interface = mqtt_interface
        self.serial_config = serial_config

    def start(self):
        if self.mqtt_interface:
            if not self.mqtt_interface.is_connected():
                self.mqtt_interface.connect()
            loop_thread = getattr(self.mqtt_interface.client, "loop_thread", None)
            if loop_thread is None or not loop_thread.is_alive():
                self.mqtt_interface.start()
        if self.serial_config:
            run_serial_interface.delay(**self.serial_config)
