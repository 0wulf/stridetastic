import meshtastic.serial_interface
import pubsub.pub as pub

from ..ingest.dispatcher import ingest_packet
from .base import BaseInterface


class SerialInterface(BaseInterface):
    def __init__(self, port, baudrate=None, interface_id=None, **kwargs):
        self.port = port
        self.baudrate = baudrate
        self.interface_id = interface_id
        self.interface = None

    def connect(self):
        try:
            self.interface = meshtastic.serial_interface.SerialInterface(
                devPath=self.port, noProto=False
            )
        except Exception as e:
            print(f"Failed to connect to serial interface on port {self.port}: {e}")

    def start(self):
        if self.interface:
            pub.subscribe(self._on_receive, "meshtastic.receive")

    def disconnect(self):
        if self.interface:
            try:
                self.interface.close()
            except Exception:
                pass
            self.interface = None

    def _on_receive(self, packet, interface):
        ingest_packet(
            "serial",
            packet,
            meta={"port": self.port, "interface_id": self.interface_id},
        )

    def publish(self, data: bytes):
        if self.interface:
            try:
                if hasattr(self.interface, "sendData"):
                    self.interface.sendData(data)
                elif hasattr(self.interface, "sendText"):
                    self.interface.sendText(data.decode(errors="ignore"))
            except Exception:
                pass
