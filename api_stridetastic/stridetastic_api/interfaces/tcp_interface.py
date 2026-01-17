import logging

import meshtastic.tcp_interface
import pubsub.pub as pub

from ..ingest.dispatcher import ingest_packet
from .base import BaseInterface


class TcpInterface(BaseInterface):
    """
    Interface for connecting to a Meshtastic node over TCP/IP.
    This is used for network-connected nodes (e.g., via WiFi or Ethernet).
    """

    def __init__(self, hostname, port=4403, interface_id=None, **kwargs):
        """
        Initialize the TCP interface.

        Args:
            hostname: The IP address or hostname of the Meshtastic node
            port: The TCP port (default 4403 for Meshtastic)
            interface_id: The database interface ID for tracking
        """
        self.hostname = hostname
        self.port = port
        self.interface_id = interface_id
        self.interface = None
        self._is_connected = False

    def connect(self):
        """Connect to the Meshtastic node over TCP."""
        try:
            logging.info(
                f"[TCP] Connecting to {self.hostname}:{self.port} (iface={self.interface_id})"
            )
            self.interface = meshtastic.tcp_interface.TCPInterface(
                hostname=self.hostname, portNumber=self.port, noProto=False
            )
            self._is_connected = True
            logging.info(
                f"[TCP] Connected to {self.hostname}:{self.port} (iface={self.interface_id})"
            )
        except Exception as e:
            self._is_connected = False
            logging.error(
                f"[TCP] Failed to connect to {self.hostname}:{self.port}: {e} (iface={self.interface_id})"
            )
            raise

    def start(self):
        """Start listening for messages from the TCP interface."""
        if self.interface:
            pub.subscribe(self._on_receive, "meshtastic.receive")
            logging.info(f"[TCP] Started listening (iface={self.interface_id})")

    def disconnect(self):
        """Disconnect from the Meshtastic node."""
        try:
            if self.interface:
                self.interface.close()
        except Exception as e:
            logging.warning(
                f"[TCP] Error during disconnect: {e} (iface={self.interface_id})"
            )
        finally:
            self.interface = None
            self._is_connected = False
            logging.info(f"[TCP] Disconnected (iface={self.interface_id})")

    def is_connected(self) -> bool:
        """Check if the interface is currently connected."""
        return self._is_connected and self.interface is not None

    def _on_receive(self, packet, interface):
        """Handle incoming packets from the Meshtastic node."""
        # Only process packets from our interface instance
        if interface == self.interface:
            ingest_packet(
                "tcp",
                packet,
                meta={
                    "hostname": self.hostname,
                    "port": self.port,
                    "interface_id": self.interface_id,
                },
            )

    def publish(self, data: bytes):
        """Send data through the TCP interface."""
        if self.interface:
            try:
                if hasattr(self.interface, "sendData"):
                    self.interface.sendData(data)
                elif hasattr(self.interface, "sendText"):
                    self.interface.sendText(data.decode(errors="ignore"))
            except Exception as e:
                logging.error(
                    f"[TCP] Failed to publish data: {e} (iface={self.interface_id})"
                )
