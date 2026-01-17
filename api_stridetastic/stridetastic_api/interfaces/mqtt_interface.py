import logging
import time

import paho.mqtt.client as mqtt

from ..ingest.dispatcher import ingest_packet
from .base import BaseInterface


class MqttInterface(BaseInterface):
    def __init__(
        self,
        broker_address,
        port=1883,
        topic="msh/US/2/e/#",
        username="",
        password="",
        tls=False,
        ca_certs=None,
        interface_id=None,
    ):
        self.client = mqtt.Client()
        self.broker_address = broker_address
        self.port = port
        self.topic = topic
        self.username = username
        self.password = password
        self.tls = tls
        self.ca_certs = ca_certs
        self.interface_id = interface_id
        self._is_connected = False
        self._last_publish_result = None  # Track last publish result

        if self.tls:
            try:
                self.client.tls_set(ca_certs=self.ca_certs)
                self.client.tls_insecure_set(False)
            except Exception as e:
                logging.error(
                    f"[MQTT] TLS setup failed: {e} (iface={self.interface_id})"
                )

        if self.username or self.password:
            self.client.username_pw_set(self.username, self.password)
        self.client.on_message = self._on_message
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect

    def _on_connect(self, client, userdata, flags, rc):
        """Callback for when the client connects to the broker"""
        if rc == 0:
            self._is_connected = True
            logging.info(
                f"[MQTT] Connected to {self.broker_address}:{self.port} (iface={self.interface_id})"
            )
            try:
                result, mid = self.client.subscribe(self.topic)
                if result != mqtt.MQTT_ERR_SUCCESS:
                    logging.error(
                        f"[MQTT] Subscribe failed rc={result} (iface={self.interface_id})"
                    )
            except Exception as e:
                logging.error(
                    f"[MQTT] Subscribe failed: {e} (iface={self.interface_id})"
                )
        else:
            self._is_connected = False
            logging.error(
                f"[MQTT] Connection failed, return code {rc} (iface={self.interface_id})"
            )

    def _on_disconnect(self, client, userdata, rc):
        """Callback for when the client disconnects from the broker"""
        self._is_connected = False
        logging.info(
            f"Disconnected from MQTT broker (iface={self.interface_id}) rc={rc}"
        )

    def connect(self):
        logging.info(
            f"[MQTT] Connecting to {self.broker_address}:{self.port} (iface={self.interface_id})"
        )
        try:
            self.client.connect(self.broker_address, self.port, keepalive=60)
        except Exception as e:
            logging.error(f"[MQTT] Connection error: {e} (iface={self.interface_id})")
            raise

    def start(self):
        logging.info(f"[MQTT] Starting event loop (iface={self.interface_id})")
        try:
            self.client.loop_start()
        except Exception as e:
            logging.error(f"[MQTT] loop_start error: {e} (iface={self.interface_id})")
            raise

    def disconnect(self):
        try:
            self.client.loop_stop()
            self.client.disconnect()
        except Exception:
            pass
        self._is_connected = False

    def publish(self, topic: str, payload: bytes) -> bool:
        """Publish a message to the specified topic. Returns True if successful, False otherwise.

        Note: Paho MQTT is asynchronous. We queue the publish and then verify it was actually sent.
        """
        if not self._is_connected:
            logging.warning(
                f"[MQTT.publish] Cannot publish: not connected (iface={self.interface_id})"
            )
            return False

        try:
            # Use QoS=1 to require PUBACK from broker, so is_published() will be set when broker acknowledges
            result = self.client.publish(topic, payload, qos=1)

            # Check immediate return code (means message was queued successfully)
            if result.rc != mqtt.MQTT_ERR_SUCCESS:
                logging.error(
                    f"[MQTT.publish] Failed to queue: rc={result.rc} (iface={self.interface_id})"
                )
                return False

            # Paho queues the message asynchronously. Wait for it to be sent via is_published() flag.
            timeout = 5.0
            start_time = time.time()

            while time.time() - start_time < timeout:
                if result.is_published():
                    elapsed = time.time() - start_time
                    logging.debug(
                        f"[MQTT.publish] Published after {elapsed:.3f}s (iface={self.interface_id})"
                    )
                    return True
                time.sleep(0.01)

            # Timeout waiting for publish
            elapsed = time.time() - start_time
            logging.error(
                f"[MQTT.publish] Timeout after {elapsed:.2f}s waiting for publish (iface={self.interface_id})"
            )
            return False

        except Exception as e:
            logging.error(
                f"[MQTT.publish] Exception: {type(e).__name__}: {e} (iface={self.interface_id})",
                exc_info=True,
            )
            return False

    def is_connected(self) -> bool:
        """Check if the client is connected to the broker"""
        return self._is_connected

    def _on_message(self, client, userdata, msg):
        ingest_packet(
            "mqtt",
            msg.payload,
            meta={
                "client": client,
                "userdata": userdata,
                "msg": msg,
                "interface_id": self.interface_id,
            },
        )
