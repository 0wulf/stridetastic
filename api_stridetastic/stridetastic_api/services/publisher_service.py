from ..mesh.packet.crafter import (
    craft_text_message,
    craft_mesh_packet,
    craft_service_envelope,
    craft_nodeinfo,
    craft_position,
    craft_telemetry,
    craft_traceroute,
    craft_reachability_probe,
)
from ..mesh.encryption.pkc import (
    PKIEncryptionInputs,
    load_public_key_bytes,
    PKIDecryptionError,
)
from meshtastic.protobuf import portnums_pb2

import random
import logging
from datetime import timedelta
from threading import Lock
from typing import Any, Dict, Optional, Protocol, Sequence, Tuple, Union, TYPE_CHECKING

from django.conf import settings  # type: ignore[import]
from django.utils import timezone  # type: ignore[import]

from ..models import Interface, Node, NodeLatencyHistory, PublisherReactiveConfig
from ..mesh.utils import id_to_num
from .pki_service import PKIService, PKIEncryptionResult

if TYPE_CHECKING:  # pragma: no cover - type checking only
    from ..models.publisher_models import PublisherPeriodicJob

class PublishableInterface(Protocol):
    """Protocol defining the interface needed for publishing messages"""
    def publish(self, topic: str, payload: bytes) -> bool: ...
    def is_connected(self) -> bool: ...

class PublisherService:
    _ATTEMPT_WINDOW_SECONDS = getattr(settings, "PUBLISHER_REACTIVE_ATTEMPT_WINDOW", 900)

    def __init__(self, publisher: Optional[PublishableInterface] = None, pki_service: Optional[PKIService] = None):
        self.__global_message_id = random.getrandbits(32)
        self._publisher = publisher
        self._reactive_lock = Lock()
        self._reactive_enabled = False
        self._reactive_config: Optional[PublisherReactiveConfig] = None
        self._reactive_publisher: Optional[PublishableInterface] = None
        self._reactive_base_topic: Optional[str] = None
        self._reactive_attempts: Dict[str, Dict[str, Any]] = {}
        self._attempt_window = timedelta(seconds=self._ATTEMPT_WINDOW_SECONDS)
        self._pki_service = pki_service

    def set_publisher(self, publisher: PublishableInterface):
        """Set or update the publisher interface"""
        self._publisher = publisher

    def set_pki_service(self, pki_service: Optional[PKIService]) -> None:
        """Set or update the PKI service dependency."""
        self._pki_service = pki_service

    def _get_global_message_id(self):
        self.__global_message_id += 1
        return self.__global_message_id

    def _get_publish_topic(self, base_topic: Optional[str], gateway_node_id: Optional[str] = None, channel_name: Optional[str] = None) -> str:
        """Generate the appropriate MQTT topic for publishing"""
        root = base_topic or getattr(settings, "MQTT_BASE_TOPIC", "") or "msh"
        root = root.rstrip('/')
        if gateway_node_id:
            channel_segment = (channel_name or "").strip('/')
            topic_parts = [root]
            if channel_segment:
                topic_parts.append(channel_segment)
            topic_parts.append(gateway_node_id)
            return "/".join(topic_parts)
        return root

    def publish(self, payload: bytes, gateway_node_id: Optional[str] = None, channel_name: Optional[str] = None, publisher: Optional[PublishableInterface] = None, base_topic: Optional[str] = None):
        """Publish a message using the configured publisher. Returns True only if publish actually succeeded."""
        logging.debug(f"[PublisherService.publish] Called with publisher={publisher is not None}, base_topic={base_topic}, gateway_node_id={gateway_node_id}, channel_name={channel_name}")
        
        active_publisher = publisher or self._publisher
        if not active_publisher:
            logging.error(f"[PublisherService.publish] No publisher configured (explicit={publisher is not None}, default={self._publisher is not None})")
            raise RuntimeError("No publisher configured for PublisherService")
        
        logging.debug(f"[PublisherService.publish] Active publisher selected, checking connection...")
        if not active_publisher.is_connected():
            logging.warning(f"[PublisherService.publish] Publisher not connected, cannot send published message")
            return False

        topic = self._get_publish_topic(base_topic, gateway_node_id, channel_name)
        logging.info(f"[PublisherService.publish] Publishing to topic: {topic}")
        
        # Actual publish and check return value
        publish_success = active_publisher.publish(topic, payload)
        logging.debug(f"[PublisherService.publish] publisher.publish() returned: {publish_success}")
        
        if publish_success:
            logging.info(f"[PublisherService.publish] Successfully published published message to topic: {topic}")
            return True
        else:
            logging.warning(f"[PublisherService.publish] Publish failed for topic: {topic}")
            return False

    def _encrypt_pki_payload(
        self,
        *,
        from_node_id: str,
        to_node_id: str,
        data_protobuf,
        packet_id: int,
    ) -> tuple[bytes, bytes]:
        if not self._pki_service:
            raise RuntimeError("PKI service not configured for publishing")

        source_node = (
            Node.objects
            .filter(node_id=from_node_id)
            .only("private_key", "node_num")
            .first()
        )
        if not source_node or not source_node.private_key:
            raise ValueError("Source node does not have PKI private key material on record")

        try:
            from_node_num = int(source_node.node_num)
        except (TypeError, ValueError):
            from_node_num = id_to_num(from_node_id)

        target_node = (
            Node.objects
            .filter(node_id=to_node_id)
            .only("public_key", "node_num")
            .first()
        )

        public_key_bytes: Optional[bytes] = None
        if target_node and target_node.public_key:
            try:
                public_key_bytes = load_public_key_bytes(target_node.public_key)
            except PKIDecryptionError as exc:
                raise ValueError(f"Stored recipient public key is invalid: {exc}") from exc

        if public_key_bytes is None:
            raise ValueError("Recipient public key unavailable for PKI encryption")

        try:
            to_node_num = int(target_node.node_num) if target_node and target_node.node_num is not None else id_to_num(to_node_id)
        except (TypeError, ValueError):
            to_node_num = id_to_num(to_node_id)

        inputs = PKIEncryptionInputs(
            plaintext=data_protobuf.SerializeToString(),
            from_node_num=from_node_num,
            to_node_num=to_node_num,
            packet_id=packet_id,
            public_key=public_key_bytes,
        )

        result: PKIEncryptionResult = self._pki_service.encrypt_packet(inputs, source_node.private_key)
        if not result.success or not result.ciphertext:
            reason = result.reason or "PKI encryption failed"
            raise ValueError(reason)

        resolved_public_key = result.public_key or public_key_bytes
        return result.ciphertext, resolved_public_key

    # ------------------------------------------------------------------
    # Reactive publishing helpers
    # ------------------------------------------------------------------

    def load_reactive_config(self) -> PublisherReactiveConfig:
        with self._reactive_lock:
            self._reactive_config = PublisherReactiveConfig.get_solo()
            return self._reactive_config

    def update_reactive_config(
        self,
        *,
        enabled: Optional[bool] = None,
        from_node: Optional[str] = None,
        gateway_node: Optional[str] = None,
        channel_key: Optional[str] = None,
        hop_limit: Optional[int] = None,
        hop_start: Optional[int] = None,
        want_ack: Optional[bool] = None,
        listen_interface_ids: Optional[Sequence[int]] = None,
        max_tries: Optional[int] = None,
        trigger_ports: Optional[list[str]] = None,
    ) -> PublisherReactiveConfig:
        with self._reactive_lock:
            config = self._reactive_config or self.load_reactive_config()

            if enabled is not None:
                config.enabled = enabled
            if from_node is not None:
                config.from_node = from_node
            if gateway_node is not None:
                config.gateway_node = gateway_node
            if channel_key is not None:
                config.channel_key = channel_key
            if hop_limit is not None:
                config.hop_limit = hop_limit
            if hop_start is not None:
                config.hop_start = hop_start
            if want_ack is not None:
                config.want_ack = want_ack
            if max_tries is not None:
                config.max_tries = max(0, max_tries)
            if trigger_ports is not None:
                sanitized_ports = []
                for name in trigger_ports:
                    if not name:
                        continue
                    try:
                        portnums_pb2.PortNum.Value(name)
                    except ValueError:
                        logging.warning(f"[Publisher] Ignoring unknown port name in reactive config: {name}")
                        continue
                    sanitized_ports.append(name)
                config.trigger_ports = sanitized_ports

            config.save()

            if listen_interface_ids is not None:
                interfaces_qs = Interface.objects.filter(id__in=listen_interface_ids)
                found_ids = set(interfaces_qs.values_list('id', flat=True))
                missing_ids = {iface_id for iface_id in listen_interface_ids if iface_id not in found_ids}
                if missing_ids:
                    logging.warning(
                        f"[Publisher] Some listen interface IDs were not found and will be ignored: {sorted(missing_ids)}"
                    )
                config.listen_interfaces.set(interfaces_qs)

            self._reactive_config = config
            return config

    def configure_reactive_runtime(
        self,
        *,
        publisher: Optional[PublishableInterface],
        base_topic: Optional[str],
        config: Optional[PublisherReactiveConfig] = None,
    ) -> None:
        with self._reactive_lock:
            if config is not None:
                self._reactive_config = config
            elif not self._reactive_config:
                self._reactive_config = PublisherReactiveConfig.get_solo()

            self._reactive_publisher = publisher
            self._reactive_base_topic = base_topic

    def start_reactive_service(self) -> None:
        with self._reactive_lock:
            if not self._reactive_config:
                self._reactive_config = PublisherReactiveConfig.get_solo()
            self._reactive_enabled = True
            self._reactive_config.enabled = True
            self._reactive_config.save(update_fields=["enabled"])
            self._reactive_attempts.clear()

    def stop_reactive_service(self) -> None:
        with self._reactive_lock:
            self._reactive_enabled = False
            if self._reactive_config:
                self._reactive_config.enabled = False
                self._reactive_config.save(update_fields=["enabled"])
            self._reactive_attempts.clear()

    def get_reactive_status(self) -> dict:
        with self._reactive_lock:
            config = self._reactive_config or PublisherReactiveConfig.get_solo()
            listen_interfaces = list(config.listen_interfaces.all())
            listen_interface_ids = [iface.id for iface in listen_interfaces]
            listen_interface_details = [
                {
                    "id": iface.id,
                    "name": iface.name,
                    "display_name": iface.display_name,
                    "status": iface.status,
                }
                for iface in listen_interfaces
            ]
            attempts_snapshot = {
                node_id: {
                    "count": data.get("count", 0),
                    "first_attempt": data.get("first"),
                    "last_attempt": data.get("last"),
                }
                for node_id, data in self._reactive_attempts.items()
            }
            return {
                "enabled": self._reactive_enabled,
                "config": {
                    "enabled": config.enabled,
                    "from_node": config.from_node,
                    "gateway_node": config.gateway_node,
                    "channel_key": config.channel_key,
                    "hop_limit": config.hop_limit,
                    "hop_start": config.hop_start,
                    "want_ack": config.want_ack,
                    "listen_interface_ids": listen_interface_ids,
                    "listen_interfaces": listen_interface_details,
                    "max_tries": config.max_tries,
                    "trigger_ports": list(config.trigger_ports or []),
                },
                "attempts": attempts_snapshot,
                "attempt_window_seconds": int(self._attempt_window.total_seconds()),
            }

    def _should_inject_for_node(self, node_id: str) -> bool:
        if not node_id:
            return False

        config = self._reactive_config or PublisherReactiveConfig.get_solo()
        max_tries = max(0, config.max_tries)
        if max_tries == 0:
            return False

        now = timezone.now()
        data = self._reactive_attempts.get(node_id)

        if not data:
            self._reactive_attempts[node_id] = {
                "count": 1,
                "first": now,
                "last": now,
            }
            return True

        first_attempt = data.get("first")
        if isinstance(first_attempt, str):  # defensive, shouldn't happen
            first_attempt = timezone.now()

        if first_attempt is None or now - first_attempt >= self._attempt_window:
            data["count"] = 1
            data["first"] = now
            data["last"] = now
            return True

        if data.get("count", 0) < max_tries:
            data["count"] = data.get("count", 0) + 1
            data["last"] = now
            return True

        return False

    def _resolve_publish_context(self, interface_obj: Optional[Interface]) -> Tuple[Optional[PublishableInterface], Optional[str]]:
        fallback_publisher = self._reactive_publisher or self._publisher
        fallback_topic = self._reactive_base_topic

        interface_pk = getattr(interface_obj, "pk", None)
        if interface_pk is None:
            return fallback_publisher, fallback_topic

        try:
            from .service_manager import ServiceManager  # local import to avoid circular dependency at module load

            service_manager = ServiceManager.get_instance()
        except Exception as exc:  # pragma: no cover - defensive logging
            logging.debug(f"[Publisher] Unable to resolve publish context via ServiceManager: {exc}")
            return fallback_publisher, fallback_topic

        wrapper = service_manager.get_runtime_interface(interface_pk)
        if not wrapper:
            logging.debug(f"[Publisher] Interface {interface_pk} not active; falling back to default publisher")
            return fallback_publisher, fallback_topic

        publisher = getattr(wrapper, "impl", None)
        if publisher is None:
            logging.debug(f"[Publisher] Runtime wrapper for interface {interface_pk} missing implementation; using fallback publisher")
            return fallback_publisher, fallback_topic

        if hasattr(publisher, "is_connected"):
            try:
                if not publisher.is_connected():
                    logging.debug(f"[Publisher] Interface {interface_pk} publisher not connected; using fallback publisher")
                    return fallback_publisher, fallback_topic
            except Exception as exc:  # pragma: no cover - defensive logging
                logging.debug(f"[Publisher] Failed to check publisher connection state: {exc}")
                return fallback_publisher, fallback_topic

        base_topic = None
        try:
            if wrapper.db.name == Interface.Names.MQTT:
                base_topic = wrapper.db.mqtt_base_topic
        except Exception:  # pragma: no cover - defensive
            base_topic = None

        return publisher, base_topic

    def publish_text_message(
        self,
        from_node: str,
        to_node: str,
        message_text: str,
        channel_name: str,
        channel_aes_key: str,
        hop_limit: int = 3,
        hop_start: int = 3,
        want_ack: bool = False,
        pki_encrypted: bool = False,
        gateway_node: Optional[str] = None,
        publisher: Optional[PublishableInterface] = None,
        base_topic: Optional[str] = None,
    ):
        """Publish a message from `from_node` to `to_node` with the given message text."""
        logging.info(f"[Publisher] Publishing message from {from_node} to {to_node}: {message_text}")
        
        data_protobuf = craft_text_message(message_text)
        global_message_id = self._get_global_message_id()

        encrypted_payload: Optional[bytes] = None
        resolved_public_key: Optional[Union[bytes, str]] = None

        if pki_encrypted:
            try:
                encrypted_payload, resolved_public_key = self._encrypt_pki_payload(
                    from_node_id=from_node,
                    to_node_id=to_node,
                    data_protobuf=data_protobuf,
                    packet_id=global_message_id,
                )
            except ValueError as exc:
                raise ValueError(f"PKI encryption failed: {exc}") from exc

        publish_channel = "PKI" if pki_encrypted else channel_name
        mesh_protobuf = craft_mesh_packet(
            from_id=from_node,
            to_id=to_node,
            channel_name=publish_channel,
            channel_aes_key=channel_aes_key,
            global_message_id=global_message_id,
            data_protobuf=data_protobuf,
            hop_limit=hop_limit,
            hop_start=hop_start,
            want_ack=want_ack,
            pki_encrypted=pki_encrypted,
            #public_key=resolved_public_key,
            encrypted_payload=encrypted_payload,
        )
        payload = craft_service_envelope(
            mesh_packet=mesh_protobuf,
            channel_name=publish_channel,
            gateway_id=gateway_node,
        )
        return self.publish(
            payload=payload,
            gateway_node_id=gateway_node,
            channel_name=publish_channel,
            publisher=publisher,
            base_topic=base_topic,
        )

    def publish_nodeinfo(self,
            from_node: str,
            to_node: str,
            short_name: str, 
            long_name: str,
            hw_model: int,
            public_key: str, 
            channel_name: str,
            channel_aes_key: str,
            hop_limit: int = 3,
            hop_start: int = 3,
            want_ack: bool = False,
            gateway_node: Optional[str] = None,
            publisher: Optional[PublishableInterface] = None,
            base_topic: Optional[str] = None,
    ):
        """Publish nodeinfo packet with the given parameters."""
        logging.info(f"[Publisher] Publishing nodeinfo from {from_node} to {to_node}: "
                    f"short_name={short_name}, long_name={long_name}, hw_model={hw_model}")
        data_pb = craft_nodeinfo(
            from_id=from_node,
            short_name=short_name,
            long_name=long_name,
            hw_model=hw_model,
            public_key=public_key,
        )
        mesh_protobuf = craft_mesh_packet(
            from_id=from_node,
            to_id=to_node,
            channel_name=channel_name,
            channel_aes_key=channel_aes_key,
            global_message_id=self._get_global_message_id(),
            data_protobuf=data_pb,
            hop_limit=hop_limit,
            hop_start=hop_start,
            want_ack=want_ack,
        )
        payload = craft_service_envelope(
            mesh_packet=mesh_protobuf,
            channel_name=channel_name,
            gateway_id=gateway_node,
        )
        return self.publish(payload=payload, gateway_node_id=gateway_node, channel_name=channel_name, publisher=publisher, base_topic=base_topic)

    def publish_position(self,
            from_node: str,
            to_node: str,
            lat: float,
            lon: float,
            alt: float,
            channel_name: str,
            channel_aes_key: str,
            hop_limit: int = 3,
            hop_start: int = 3,
            want_ack: bool = False,
            want_response: bool = False,
            pki_encrypted: bool = False,
            gateway_node: Optional[str] = None,
            publisher: Optional[PublishableInterface] = None,
            base_topic: Optional[str] = None,
    ):
        """Publish position packet with the given coordinates."""
        logging.info(f"[Publisher] Publishing position from {from_node} to {to_node}: "
                    f"lat={lat}, lon={lon}, alt={alt}")
        data_pb = craft_position(
            lat=lat,
            lon=lon,
            alt=alt,
            want_response=want_response,
        )

        # Handle PKI encryption for position payloads (same pattern as text messages)
        encrypted_payload: Optional[bytes] = None
        resolved_public_key: Optional[Union[bytes, str]] = None
        global_message_id = self._get_global_message_id()

        if pki_encrypted:
            try:
                encrypted_payload, resolved_public_key = self._encrypt_pki_payload(
                    from_node_id=from_node,
                    to_node_id=to_node,
                    data_protobuf=data_pb,
                    packet_id=global_message_id,
                )
            except ValueError as exc:
                raise ValueError(f"PKI encryption failed: {exc}") from exc

        publish_channel = "PKI" if pki_encrypted else channel_name

        mesh_protobuf = craft_mesh_packet(
            from_id=from_node,
            to_id=to_node,
            channel_name=publish_channel,
            channel_aes_key=channel_aes_key,
            global_message_id=global_message_id,
            data_protobuf=data_pb,
            hop_limit=hop_limit,
            hop_start=hop_start,
            want_ack=want_ack,
            pki_encrypted=pki_encrypted,
            encrypted_payload=encrypted_payload,
        )
        payload = craft_service_envelope(
            mesh_packet=mesh_protobuf,
            channel_name=publish_channel,
            gateway_id=gateway_node,
        )
        return self.publish(payload=payload, gateway_node_id=gateway_node, channel_name=channel_name, publisher=publisher, base_topic=base_topic)

    def publish_traceroute(
            self,
            from_node: str,
            to_node: str,
            channel_name: str,
            channel_aes_key: str,
            hop_limit: int = 3,
            hop_start: int = 3,
            want_ack: bool = False,
            gateway_node: Optional[str] = None,
            publisher: Optional[PublishableInterface] = None,
            base_topic: Optional[str] = None,
            record_pending: bool = True,
    ) -> Tuple[bool, Optional[int]]:
        """Publish a traceroute packet from `from_node` to `to_node` and optionally record a pending probe."""
        logging.info(f"[Publisher] Publishing traceroute from {from_node} to {to_node}")
        data_pb = craft_traceroute()
        message_id = self._get_global_message_id()
        mesh_protobuf = craft_mesh_packet(
            from_id=from_node,
            to_id=to_node,
            channel_name=channel_name,
            channel_aes_key=channel_aes_key,
            global_message_id=message_id,
            data_protobuf=data_pb,
            hop_limit=hop_limit,
            hop_start=hop_start,
            want_ack=want_ack,
        )
        payload = craft_service_envelope(
            mesh_packet=mesh_protobuf,
            channel_name=channel_name,
            gateway_id=gateway_node,
        )
        published = self.publish(
            payload=payload,
            gateway_node_id=gateway_node,
            channel_name=channel_name,
            publisher=publisher,
            base_topic=base_topic,
        )
        if published:
            if record_pending:
                target = Node.objects.filter(node_id=to_node).first()
                if target:
                    target.latency_reachable = False
                    target.latency_ms = None
                    target.save(update_fields=["latency_reachable", "latency_ms"])
                    NodeLatencyHistory.objects.create(
                        node=target,
                        reachable=False,
                        latency_ms=None,
                        probe_message_id=message_id,
                    )
            return True, message_id
        return False, None

    def publish_reachability_probe(
            self,
            from_node: str,
            to_node: str,
            channel_name: str,
            channel_aes_key: str,
            hop_limit: int = 3,
            hop_start: int = 3,
            gateway_node: Optional[str] = None,
            publisher: Optional[PublishableInterface] = None,
            base_topic: Optional[str] = None,
    ) -> bool:
        """Inject a routing packet that requests an ACK to measure reachability and latency."""
        logging.info(f"[Publisher] Reachability probe from {from_node} to {to_node}")
        data_pb = craft_reachability_probe()
        message_id = self._get_global_message_id()
        mesh_protobuf = craft_mesh_packet(
            from_id=from_node,
            to_id=to_node,
            channel_name=channel_name,
            channel_aes_key=channel_aes_key,
            global_message_id=message_id,
            data_protobuf=data_pb,
            hop_limit=hop_limit,
            hop_start=hop_start,
            want_ack=True,
        )
        payload = craft_service_envelope(
            mesh_packet=mesh_protobuf,
            channel_name=channel_name,
            gateway_id=gateway_node,
        )
        published = self.publish(
            payload=payload,
            gateway_node_id=gateway_node,
            channel_name=channel_name,
            publisher=publisher,
            base_topic=base_topic,
        )
        if published:
            target = Node.objects.filter(node_id=to_node).first()
            if target:
                target.latency_reachable = False
                target.latency_ms = None
                target.save(update_fields=["latency_reachable", "latency_ms"])
                NodeLatencyHistory.objects.create(
                    node=target,
                    reachable=False,
                    latency_ms=None,
                    probe_message_id=message_id,
                )
        return published

    def publish_telemetry(
        self,
        from_node: str,
        to_node: str,
        telemetry_type: str,
        telemetry_options: Dict[str, Any],
        channel_name: str,
        channel_aes_key: str,
        hop_limit: int = 3,
        hop_start: int = 3,
        want_ack: bool = False,
        want_response: bool = False,
        pki_encrypted: bool = False,
        gateway_node: Optional[str] = None,
        publisher: Optional[PublishableInterface] = None,
        base_topic: Optional[str] = None,
    ) -> bool:
        """Publish telemetry values (device or environment metrics)."""
        logging.info(f"[Publisher] Publishing telemetry from {from_node} to {to_node}: type={telemetry_type}, fields={list(telemetry_options.keys())}")
        data_pb = craft_telemetry(telemetry_type=telemetry_type, telemetry_options=telemetry_options, want_response=want_response)
        global_message_id = self._get_global_message_id()

        encrypted_payload: Optional[bytes] = None
        resolved_public_key: Optional[Union[bytes, str]] = None

        if pki_encrypted:
            try:
                encrypted_payload, resolved_public_key = self._encrypt_pki_payload(
                    from_node_id=from_node,
                    to_node_id=to_node,
                    data_protobuf=data_pb,
                    packet_id=global_message_id,
                )
            except ValueError as exc:
                raise ValueError(f"PKI encryption failed: {exc}") from exc

        publish_channel = "PKI" if pki_encrypted else channel_name
        mesh_protobuf = craft_mesh_packet(
            from_id=from_node,
            to_id=to_node,
            channel_name=publish_channel,
            channel_aes_key=channel_aes_key,
            global_message_id=global_message_id,
            data_protobuf=data_pb,
            hop_limit=hop_limit,
            hop_start=hop_start,
            want_ack=want_ack,
            pki_encrypted=pki_encrypted,
            encrypted_payload=encrypted_payload,
        )
        payload = craft_service_envelope(
            mesh_packet=mesh_protobuf,
            channel_name=publish_channel,
            gateway_id=gateway_node,
        )
        return self.publish(payload=payload, gateway_node_id=gateway_node, channel_name=publish_channel, publisher=publisher, base_topic=base_topic)

    def execute_periodic_job(
        self,
        job: "PublisherPeriodicJob",
        *,
        publisher: Optional[PublishableInterface] = None,
        base_topic: Optional[str] = None,
    ) -> bool:
        """Dispatch the appropriate publishing action for a periodic job definition."""

        options = job.payload_options or {}
        # Normalize payload_type to avoid mismatches between DB-stored strings and TextChoices
        payload_type = (job.payload_type or "").lower()
        channel_key = job.channel_key or ""

        base_kwargs = {
            "from_node": job.from_node,
            "to_node": job.to_node,
            "channel_name": job.channel_name,
            "channel_aes_key": channel_key,
            "hop_limit": job.hop_limit,
            "hop_start": job.hop_start,
            "want_ack": job.want_ack,
            "gateway_node": job.gateway_node or None,
            "publisher": publisher,
            "base_topic": base_topic,
        }

        if payload_type == 'text' or job.payload_type == job.PayloadTypes.TEXT:
            message_text = options.get("message_text")
            if not message_text:
                raise ValueError("Message text is required for periodic text payloads")
            return self.publish_text_message(
                message_text=message_text,
                pki_encrypted=job.pki_encrypted,
                **base_kwargs,
            )

        if payload_type == 'position' or job.payload_type == job.PayloadTypes.POSITION:
            lat = options.get("lat")
            lon = options.get("lon")
            if lat is None or lon is None:
                raise ValueError("Latitude and longitude are required for periodic position payloads")
            alt = options.get("alt", 0.0) or 0.0
            want_response = bool(options.get("want_response", False))
            return self.publish_position(
                lat=float(lat),
                lon=float(lon),
                alt=float(alt),
                want_response=want_response,
                pki_encrypted=job.pki_encrypted,
                **base_kwargs,
            )

        if payload_type == 'nodeinfo' or job.payload_type == job.PayloadTypes.NODEINFO:
            required_fields = {
                "short_name": options.get("short_name"),
                "long_name": options.get("long_name"),
                "hw_model": options.get("hw_model"),
                "public_key": options.get("public_key"),
            }
            missing = [key for key, value in required_fields.items() if value in (None, "")]
            if missing:
                raise ValueError(
                    "Node info payload requires short_name, long_name, hw_model, and public_key"
                )
            hw_model_value = required_fields["hw_model"]
            hw_model_int = int(str(hw_model_value))
            return self.publish_nodeinfo(
                short_name=str(required_fields["short_name"]),
                long_name=str(required_fields["long_name"]),
                hw_model=hw_model_int,
                public_key=str(required_fields["public_key"]),
                **base_kwargs,
            )

        if payload_type == 'traceroute' or job.payload_type == job.PayloadTypes.TRACEROUTE:
            success, _ = self.publish_traceroute(
                record_pending=True,
                **base_kwargs,
            )
            return success

        if payload_type == 'telemetry' or job.payload_type == job.PayloadTypes.TELEMETRY:
            telemetry_type = options.get("telemetry_type") or "device"
            telemetry_opts = options.get("telemetry_options") or {}
            want_response = bool(options.get("want_response", False))
            return self.publish_telemetry(
                telemetry_type=telemetry_type,
                telemetry_options=telemetry_opts,
                want_response=want_response,
                pki_encrypted=job.pki_encrypted,
                **base_kwargs,
            )

        raise ValueError(f"Unsupported periodic publish payload type: {job.payload_type}")

    def on_packet_received(self, packet, decoded_data, portnum, from_node, to_node, packet_obj):
        """Handle received packets and potentially trigger publishing responses"""
        logging.info(f"[Publisher] Packet received from {from_node} to {to_node} on port {portnum}")
        with self._reactive_lock:
            if not self._reactive_enabled:
                return

            config = self._reactive_config or PublisherReactiveConfig.get_solo()

            if not config.from_node:
                logging.debug("[Publisher] Reactive config missing source node, skipping traceroute injection")
                return

            channel_key_config = config.channel_key or ""
            interfaces = list(packet_obj.interfaces.all()) if packet_obj else []

            listen_filter_qs = config.listen_interfaces.all()
            listen_filter_ids = set(listen_filter_qs.values_list("id", flat=True)) if listen_filter_qs.exists() else set()

            selected_interface: Optional[Interface] = None
            if listen_filter_ids:
                selected_interface = next((iface for iface in interfaces if iface.pk in listen_filter_ids), None)
                if selected_interface is None:
                    logging.debug("[Publisher] Packet interface not in reactive listener set; skipping traceroute")
                    return
            else:
                selected_interface = interfaces[0] if interfaces else None

            channel_obj = None
            try:
                channel_qs = packet_obj.channels.all() if packet_obj else None
                if channel_qs is not None:
                    if selected_interface is not None:
                        channel_obj = channel_qs.filter(interfaces=selected_interface).first()
                    if channel_obj is None:
                        channel_obj = channel_qs.first()
            except Exception as exc:  # pragma: no cover - defensive logging
                logging.debug(f"[Publisher] Failed to resolve channel for reactive traceroute: {exc}")
                channel_obj = None

            if channel_obj is None or not getattr(channel_obj, "channel_id", None):
                logging.debug("[Publisher] Unable to determine channel from packet; skipping traceroute")
                return

            channel_name = channel_obj.channel_id
            channel_key = channel_key_config or getattr(channel_obj, "psk", "") or ""
            if not channel_key:
                logging.debug("[Publisher] No channel key available for reactive traceroute; skipping")
                return

            target_node_id = getattr(from_node, "node_id", None)
            if not target_node_id:
                return

            # Avoid echoing back to the publish origin node
            if config.from_node == target_node_id:
                return

            trigger_ports = list(getattr(config, "trigger_ports", []) or [])
            if trigger_ports:
                if decoded_data is None or portnum is None:
                    logging.debug("[Publisher] Packet had no decoded portnum; skipping reactive traceroute")
                    return
                try:
                    port_name = portnums_pb2.PortNum.Name(portnum)
                except ValueError:
                    logging.debug(f"[Publisher] Unknown port number {portnum}; skipping reactive traceroute")
                    return
                if port_name not in trigger_ports:
                    logging.debug(
                        f"[Publisher] Port {port_name} not in trigger list {trigger_ports}; skipping reactive traceroute"
                    )
                    return

            if not self._should_inject_for_node(target_node_id):
                logging.debug(
                    f"[Publisher] Max tries reached for node {target_node_id}, skipping traceroute"
                )
                return

            publisher, base_topic = self._resolve_publish_context(selected_interface)
            if not publisher:
                logging.debug("[Publisher] No publisher available for reactive traceroute")
                return

            gateway_node_id = config.gateway_node or None
            if not gateway_node_id and packet_obj:
                gateway_node = packet_obj.gateway_nodes.first()
                gateway_node_id = getattr(gateway_node, "node_id", None)

            try:
                publish_success, message_id = self.publish_traceroute(
                    from_node=config.from_node,
                    to_node=target_node_id,
                    channel_name=channel_name,
                    channel_aes_key=channel_key,
                    hop_limit=config.hop_limit,
                    hop_start=config.hop_start,
                    want_ack=config.want_ack,
                    gateway_node=gateway_node_id,
                    publisher=publisher,
                    base_topic=base_topic,
                    record_pending=False,
                )
                if publish_success:
                    target = Node.objects.filter(node_id=target_node_id).first()
                    if target:
                        target.latency_reachable = False
                        target.latency_ms = None
                        target.save(update_fields=["latency_reachable", "latency_ms"])
                        NodeLatencyHistory.objects.create(
                            node=target,
                            reachable=False,
                            latency_ms=None,
                            probe_message_id=message_id,
                        )

                logging.info(
                    f"[Publisher] Reactive traceroute injected towards {target_node_id} "
                    f"(attempt {self._reactive_attempts[target_node_id]['count']})"
                )
            except Exception as exc:
                logging.error(f"[Publisher] Failed to inject reactive traceroute: {exc}")

# Backwards-compatible alias retained for legacy PublishErservice imports
PublishErservice = PublisherService
