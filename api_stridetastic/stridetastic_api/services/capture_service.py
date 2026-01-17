from __future__ import annotations

import logging
import zlib
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import TYPE_CHECKING, Dict, Iterable, List, Optional, Tuple
from uuid import UUID

from celery.exceptions import TimeoutError as CeleryTimeoutError
from django.conf import settings
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from django.utils.text import slugify
from meshtastic.protobuf import admin_pb2  # type: ignore[attr-defined]
from meshtastic.protobuf import (
    atak_pb2,
    device_ui_pb2,
    interdevice_pb2,
    mesh_pb2,
    module_config_pb2,
    mqtt_pb2,
    paxcount_pb2,
    portnums_pb2,
    powermon_pb2,
    remote_hardware_pb2,
    storeforward_pb2,
    telemetry_pb2,
)

from ..mesh.encryption.aes import decrypt_packet
from ..models.capture_models import CaptureSession
from ..models.channel_models import Channel
from ..models.interface_models import Interface
from ..utils.pcap_writer import PcapNgWriter

if TYPE_CHECKING:  # pragma: no cover - typing only
    from .pki_service import PKIService


logger = logging.getLogger(__name__)
DEFAULT_CAPTURE_MAX_BYTES = 1_073_741_824  # 1 GiB

_PORT_PROTO_HINTS: Dict[int, Tuple[type, ...]] = {
    portnums_pb2.NODEINFO_APP: (mesh_pb2.NodeInfo, mesh_pb2.User),
    portnums_pb2.POSITION_APP: (mesh_pb2.Position,),
    portnums_pb2.ROUTING_APP: (mesh_pb2.Routing,),
    portnums_pb2.ADMIN_APP: (admin_pb2.AdminMessage,),
    portnums_pb2.WAYPOINT_APP: (mesh_pb2.Waypoint,),
    portnums_pb2.TRACEROUTE_APP: (mesh_pb2.RouteDiscovery,),
    portnums_pb2.NEIGHBORINFO_APP: (mesh_pb2.NeighborInfo,),
    portnums_pb2.TELEMETRY_APP: (telemetry_pb2.Telemetry,),
    portnums_pb2.PAXCOUNTER_APP: (paxcount_pb2.Paxcount,),
    portnums_pb2.STORE_FORWARD_APP: (storeforward_pb2.StoreAndForward,),
    portnums_pb2.REMOTE_HARDWARE_APP: (remote_hardware_pb2.HardwareMessage,),
    portnums_pb2.RANGE_TEST_APP: (powermon_pb2.PowerStressMessage,),
    portnums_pb2.KEY_VERIFICATION_APP: (
        mesh_pb2.KeyVerification,
        mesh_pb2.KeyVerificationNumberRequest,
        mesh_pb2.KeyVerificationNumberInform,
        mesh_pb2.KeyVerificationFinal,
    ),
    portnums_pb2.DETECTION_SENSOR_APP: (interdevice_pb2.SensorData,),
    portnums_pb2.ALERT_APP: (mesh_pb2.ClientNotification,),
    portnums_pb2.POWERSTRESS_APP: (
        powermon_pb2.PowerStressMessage,
        powermon_pb2.PowerMon,
    ),
    portnums_pb2.ATAK_PLUGIN: (atak_pb2.TAKPacket,),
    portnums_pb2.ATAK_FORWARDER: (atak_pb2.TAKPacket,),
    portnums_pb2.MAP_REPORT_APP: (device_ui_pb2.Map,),
    portnums_pb2.CAYENNE_APP: (module_config_pb2.ModuleConfig,),
}


@dataclass
class _ActiveCapture:
    session_id: UUID
    writer: PcapNgWriter
    interface_id: Optional[int]
    source_type: str


class CaptureService:
    """Manages lifecycle of Meshtastic capture sessions and PCAP persistence."""

    def __init__(
        self,
        base_dir: Optional[Path | str] = None,
        *,
        enable_writer: bool = True,
        pki_service: Optional["PKIService"] = None,
        max_bytes: Optional[int] = None,
    ):
        configured_root = getattr(
            settings, "CAPTURE_ROOT", settings.BASE_DIR / "captures"
        )
        if base_dir is None:
            resolved_base_dir = Path(configured_root)
        else:
            resolved_base_dir = Path(base_dir)
        self.base_dir = resolved_base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._active: Dict[UUID, _ActiveCapture] = {}
        self._lock = Lock()
        self._enable_writer = enable_writer
        self._task_timeout_seconds = getattr(settings, "CAPTURE_TASK_TIMEOUT", 15)
        self._pki_service = pki_service

        configured_limit = (
            max_bytes
            if max_bytes is not None
            else getattr(
                settings,
                "CAPTURE_MAX_FILESIZE",
                DEFAULT_CAPTURE_MAX_BYTES,
            )
        )
        try:
            limit_value = (
                int(configured_limit)
                if configured_limit is not None
                else DEFAULT_CAPTURE_MAX_BYTES
            )
        except (TypeError, ValueError):
            limit_value = DEFAULT_CAPTURE_MAX_BYTES
        self._max_bytes: Optional[int] = (
            limit_value if limit_value and limit_value > 0 else None
        )

    # ------------------------------------------------------------------
    # Cross-process coordination helpers
    # ------------------------------------------------------------------
    def _dispatch_worker_task(
        self, task_name: str, *args, timeout: Optional[int] = None
    ):
        if self._enable_writer:
            raise RuntimeError(
                "CaptureService with writer enabled should not dispatch worker tasks"
            )

        timeout_seconds = timeout or self._task_timeout_seconds
        task_path = f"stridetastic_api.tasks.capture_tasks.{task_name}"
        from ..celery import app as celery_app

        async_result = celery_app.send_task(task_path, args=tuple(args))
        try:
            return async_result.get(timeout=timeout_seconds)
        except CeleryTimeoutError as exc:  # pragma: no cover - defensive
            raise TimeoutError(
                f"Timed out waiting for capture task {task_name}"
            ) from exc
        except Exception as exc:  # pragma: no cover - defensive
            raise RuntimeError(f"Capture task {task_name} failed: {exc}") from exc

    def set_pki_service(self, service: Optional["PKIService"]) -> None:
        """Inject or update the PKI service reference used for capture decryption."""

        self._pki_service = service

    def _ensure_writer_for_session(self, session: CaptureSession) -> None:
        target_path = self.get_full_path(session)
        interface_id = getattr(session, "interface_id", None)
        self._register_active_session(session, target_path, interface_id=interface_id)

    def _register_active_session(
        self,
        session: CaptureSession,
        target_path: Path,
        *,
        interface_id: Optional[int],
    ) -> None:
        try:
            writer = PcapNgWriter(target_path)
        except Exception as exc:  # pragma: no cover - defensive
            logging.exception("Failed to initialize PCAP writer: %s", exc)
            session.mark_error(str(exc))
            raise

        active = _ActiveCapture(
            session_id=session.id,
            writer=writer,
            interface_id=interface_id,
            source_type=session.source_type,
        )
        with self._lock:
            self._active[session.id] = active
        logging.info("Activated capture %s (%s)", session.id, session.filename)

    def activate_existing_session(self, session_id: UUID) -> bool:
        with self._lock:
            if session_id in self._active:
                return True

        session = (
            CaptureSession.objects.filter(
                id=session_id, status=CaptureSession.Status.RUNNING
            )
            .select_related("interface")
            .first()
        )
        if session is None:
            logging.warning(
                "Capture session %s not found or not running during activation",
                session_id,
            )
            return False

        target_path = self.get_full_path(session)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_writer_for_session(session)
        return True

    def _activate_sessions_for_ingest(
        self, source_type: str, interface_id: Optional[int]
    ) -> bool:
        if not self._enable_writer:
            return False

        filters = Q(status=CaptureSession.Status.RUNNING, source_type=source_type)
        if interface_id is None:
            filters &= Q(interface__isnull=True)
        else:
            filters &= Q(interface__isnull=True) | Q(interface_id=interface_id)

        sessions = CaptureSession.objects.filter(filters)
        activated_any = False
        for session in sessions:
            try:
                if self.activate_existing_session(session.id):
                    activated_any = True
            except Exception as exc:  # pragma: no cover - defensive
                logging.exception(
                    "Failed to activate session %s during ingest: %s", session.id, exc
                )
        return activated_any

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------
    def start_capture(
        self,
        *,
        name: str,
        interface_id: Optional[int] = None,
        started_by=None,
        source_type: str = "mqtt",
    ) -> CaptureSession:
        interface: Optional[Interface] = None
        if interface_id is not None:
            interface = Interface.objects.filter(id=interface_id).first()
            if interface is None:
                raise ValueError("Interface not found")

        slug = slugify(name) or "capture"
        timestamp = timezone.now().strftime("%Y%m%dT%H%M%S")
        filename = f"{timestamp}-{slug}.pcapng"
        target_path = self.base_dir / filename
        suffix = 1
        while target_path.exists():
            filename = f"{timestamp}-{slug}-{suffix}.pcapng"
            target_path = self.base_dir / filename
            suffix += 1

        try:
            relative_path = target_path.relative_to(settings.BASE_DIR)
            relative_path_str = str(relative_path)
        except ValueError:
            relative_path_str = str(target_path)

        with transaction.atomic():
            session = CaptureSession.objects.create(
                name=name,
                filename=filename,
                file_path=relative_path_str,
                interface=interface,
                started_by=(
                    started_by
                    if getattr(started_by, "is_authenticated", False)
                    else None
                ),
                source_type=source_type,
            )

        try:
            if self._enable_writer:
                self._register_active_session(
                    session,
                    target_path,
                    interface_id=interface.pk if interface else None,
                )
            else:
                activation = self._dispatch_worker_task(
                    "activate_capture_session",
                    str(session.id),
                )
                if not activation:
                    raise RuntimeError("Capture activation task reported failure")
        except Exception:
            session.refresh_from_db()
            if session.status == CaptureSession.Status.RUNNING:
                session.mark_error("Failed to activate capture writer")
            raise

        logging.info("Started capture %s (%s)", session.id, filename)
        session.refresh_from_db()
        return session

    def stop_capture(self, session_id: UUID) -> CaptureSession:
        if not self._enable_writer:
            self._dispatch_worker_task("stop_capture_session", str(session_id))
            session = CaptureSession.objects.filter(id=session_id).first()
            if session is None:
                raise ValueError("Capture session not found")
            session.refresh_from_db()
            logging.info("Stopped capture %s (delegated)", session.id)
            return session

        with self._lock:
            active = self._active.pop(session_id, None)

        session = CaptureSession.objects.filter(id=session_id).first()
        if session is None:
            if active:
                active.writer.close()
            raise ValueError("Capture session not found")

        if active:
            active.writer.close()
            file_size = active.writer.bytes_written
        else:
            file_size = session.file_size

        if session.status == CaptureSession.Status.RUNNING:
            session.status = CaptureSession.Status.COMPLETED
            session.ended_at = timezone.now()
        session.file_size = file_size
        session.save(update_fields=["status", "ended_at", "file_size"])
        session.refresh_from_db()
        logging.info("Stopped capture %s", session.id)
        return session

    def cancel_capture(
        self, session_id: UUID, reason: Optional[str] = None
    ) -> CaptureSession:
        if not self._enable_writer:
            self._dispatch_worker_task(
                "cancel_capture_session", str(session_id), reason
            )
            session = CaptureSession.objects.filter(id=session_id).first()
            if session is None:
                raise ValueError("Capture session not found")
            session.refresh_from_db()
            logging.info("Cancelled capture %s (delegated)", session.id)
            return session

        with self._lock:
            active = self._active.pop(session_id, None)
        session = CaptureSession.objects.filter(id=session_id).first()
        if session is None:
            if active:
                active.writer.close()
            raise ValueError("Capture session not found")
        if active:
            active.writer.close()
        session.status = CaptureSession.Status.CANCELLED
        session.ended_at = timezone.now()
        if reason:
            notes = session.notes or {}
            notes["cancel_reason"] = reason
            session.notes = notes  # type: ignore[assignment]
            session.save(update_fields=["status", "ended_at", "notes"])
        else:
            session.save(update_fields=["status", "ended_at"])
        session.refresh_from_db()
        logging.info("Cancelled capture %s", session.id)
        return session

    def stop_all(self) -> None:
        if not self._enable_writer:
            self._dispatch_worker_task("stop_all_capture_sessions")
            logging.info("Stopped all captures (delegated)")
            return

        with self._lock:
            active_sessions = list(self._active.values())
            self._active.clear()
        for active in active_sessions:
            try:
                active.writer.close()
                CaptureSession.objects.filter(
                    id=active.session_id, status=CaptureSession.Status.RUNNING
                ).update(
                    status=CaptureSession.Status.CANCELLED,
                    ended_at=timezone.now(),
                )
            except Exception as exc:  # pragma: no cover - defensive
                logging.exception(
                    "Failed to stop capture %s cleanly: %s", active.session_id, exc
                )

    def delete_capture(self, session_id: UUID) -> bool:
        """Delete a capture session and remove its file from disk."""
        if not self._enable_writer:
            deleted = self._dispatch_worker_task(
                "delete_capture_session", str(session_id)
            )
            if deleted:
                logging.info("Deleted capture %s (delegated)", session_id)
            return bool(deleted)

        with self._lock:
            active = self._active.pop(session_id, None)

        session = CaptureSession.objects.filter(id=session_id).first()
        if session is None:
            self._close_active_writer(active)
            return False

        self._delete_session(session, active)
        return True

    def delete_all_captures(self) -> int:
        """Delete all capture sessions and associated files."""
        if not self._enable_writer:
            deleted = self._dispatch_worker_task("delete_all_capture_sessions")
            logging.info("Deleted %s captures (delegated)", deleted)
            return int(deleted or 0)

        with self._lock:
            active_map = {active.session_id: active for active in self._active.values()}
            self._active.clear()

        sessions = list(CaptureSession.objects.all())
        deleted_count = 0
        for session in sessions:
            self._delete_session(session, active_map.get(session.id))
            deleted_count += 1
        return deleted_count

    # ------------------------------------------------------------------
    # Introspection helpers
    # ------------------------------------------------------------------
    def get_session(self, session_id: UUID) -> Optional[CaptureSession]:
        return CaptureSession.objects.filter(id=session_id).first()

    def list_sessions(self) -> Iterable[CaptureSession]:
        return CaptureSession.objects.all().order_by("-started_at")

    def is_active(self, session_id: UUID) -> bool:
        with self._lock:
            return session_id in self._active

    def to_dict(self, session: CaptureSession) -> dict:
        with self._lock:
            is_active = session.id in self._active
        interface = session.interface
        return {
            "id": session.id,
            "name": session.name,
            "status": session.status,
            "source_type": session.source_type,
            "interface_id": interface.id if interface else None,
            "interface_name": interface.display_name if interface else None,
            "started_at": session.started_at,
            "ended_at": session.ended_at,
            "last_packet_at": session.last_packet_at,
            "packet_count": session.packet_count,
            "byte_count": session.byte_count,
            "file_size": session.file_size,
            "filename": session.filename,
            "file_path": session.file_path,
            "is_active": is_active,
        }

    # ------------------------------------------------------------------
    # Ingest integration
    # ------------------------------------------------------------------
    def handle_ingest(
        self,
        *,
        source_type: str,
        raw_payload: bytes,
        interface_id: Optional[int] = None,
        timestamp=None,
    ) -> None:
        def _select_targets() -> list[_ActiveCapture]:
            return [
                active
                for active in self._active.values()
                if active.source_type == source_type
                and (active.interface_id is None or active.interface_id == interface_id)
            ]

        with self._lock:
            targets = _select_targets()

        if not targets and self._activate_sessions_for_ingest(
            source_type, interface_id
        ):
            with self._lock:
                targets = _select_targets()

        if not targets:
            return

        now = timezone.now()
        ts = timestamp or now

        try:
            envelope = mqtt_pb2.ServiceEnvelope()
            envelope.ParseFromString(raw_payload)
        except Exception as exc:
            logging.exception("Failed to parse ServiceEnvelope for capture: %s", exc)
            return

        mesh_packet = envelope.packet
        channel_id = getattr(envelope, "channel_id", None)
        mesh_size = (
            mesh_packet.ByteSize() if getattr(mesh_packet, "ByteSize", None) else 0
        )
        if mesh_size == 0:
            logging.debug(
                "ServiceEnvelope contained empty MeshPacket; skipping capture write"
            )
            return

        mesh_payload = mesh_packet.SerializeToString()
        data_payload: Optional[bytes] = None
        extra_payloads: list[Tuple[str, bytes]] = []

        try:
            has_decoded = mesh_packet.HasField("decoded")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            has_decoded = False

        data_message: Optional[mesh_pb2.Data] = None

        if has_decoded:
            data_message = mesh_packet.decoded
        else:
            data_message = self._decrypt_encrypted_payload(
                mesh_packet, channel_id=channel_id
            )

        if data_message is not None:
            serialized_data, nested_payloads = self._extract_payloads_from_data(
                data_message
            )
            if serialized_data:
                data_payload = serialized_data
            if nested_payloads:
                extra_payloads.extend(nested_payloads)

        total_bytes = (
            len(mesh_payload)
            + (len(data_payload) if data_payload else 0)
            + sum(len(p[1]) for p in extra_payloads)
        )

        limit_exceeded: list[_ActiveCapture] = []

        for active in targets:
            try:
                active.writer.write_mesh_packet(mesh_payload, ts)
                if data_payload:
                    active.writer.write_data_packet(data_payload, ts)
                for message_type, payload in extra_payloads:
                    active.writer.write_packet(
                        message_type=message_type, payload=payload, timestamp=ts
                    )
            except Exception as exc:  # pragma: no cover - defensive
                logging.exception("Capture %s write failed: %s", active.session_id, exc)
                self._handle_capture_error(active.session_id, str(exc))
                continue

            bytes_written = active.writer.bytes_written
            CaptureSession.objects.filter(id=active.session_id).update(
                packet_count=F("packet_count") + 1,
                byte_count=F("byte_count") + total_bytes,
                last_packet_at=ts,
                file_size=bytes_written,
            )

            if self._max_bytes is not None and bytes_written >= self._max_bytes:
                limit_exceeded.append(active)

        if limit_exceeded:
            seen: set[UUID] = set()
            for active in limit_exceeded:
                if active.session_id in seen:
                    continue
                seen.add(active.session_id)
                self._handle_size_limit(active)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _decrypt_encrypted_payload(
        self,
        mesh_packet: mesh_pb2.MeshPacket,
        *,
        channel_id: Optional[str],
    ) -> Optional[mesh_pb2.Data]:
        encrypted_bytes = getattr(mesh_packet, "encrypted", b"")
        if not encrypted_bytes:
            return None

        is_pki_encrypted = bool(getattr(mesh_packet, "pki_encrypted", False))

        if is_pki_encrypted and self._pki_service is not None:
            try:
                to_node_num = getattr(mesh_packet, "to", None)
                target_node = None
                if to_node_num is not None:
                    from ..models.node_models import (  # Local import to avoid circular at module load
                        Node,
                    )

                    target_node = Node.objects.filter(node_num=int(to_node_num)).first()

                if target_node is not None:
                    result = self._pki_service.decrypt_packet(mesh_packet, target_node)
                    if result.success and result.plaintext:
                        data_message = mesh_pb2.Data()
                        data_message.ParseFromString(result.plaintext)
                        if (
                            getattr(data_message, "ByteSize", None)
                            and data_message.ByteSize() == 0
                        ):
                            return None
                        return data_message
                    if result.reason:
                        logger.debug(
                            "PKI decrypt skipped for capture: %s", result.reason
                        )
                else:
                    logger.debug(
                        "PKI decrypt skipped: target node %s not found", to_node_num
                    )
            except Exception as exc:  # pragma: no cover - defensive
                logger.exception("PKI decrypt failed during capture ingest: %s", exc)

        key: Optional[str] = None
        if channel_id:
            channel = Channel.objects.filter(channel_id=channel_id).first()
            if channel and channel.psk:
                key = channel.psk

        if key is None:
            key = "AQ=="

        payload = decrypt_packet(mesh_packet, key)
        if (
            payload is not None
            and getattr(payload, "ByteSize", None)
            and payload.ByteSize() == 0
        ):
            return None
        return payload

    def _extract_payloads_from_data(
        self,
        data_message: mesh_pb2.Data,
    ) -> Tuple[Optional[bytes], list[Tuple[str, bytes]]]:
        serialized_data: Optional[bytes] = None
        nested_payloads: list[Tuple[str, bytes]] = []

        serialize_method = getattr(data_message, "SerializeToString", None)
        if callable(serialize_method):
            try:
                serialized_candidate = data_message.SerializeToString()
                if serialized_candidate:
                    serialized_data = serialized_candidate
            except Exception as exc:  # pragma: no cover - defensive
                logging.exception(
                    "Failed to serialize Data payload for capture: %s", exc
                )

        payload_bytes = getattr(data_message, "payload", None)
        portnum = getattr(data_message, "portnum", None)

        if payload_bytes and portnum is not None:
            nested_payloads.extend(
                self._decode_port_payloads(int(portnum), bytes(payload_bytes))
            )

        return serialized_data, nested_payloads

    def _decode_port_payloads(
        self, portnum: int, payload: bytes
    ) -> List[Tuple[str, bytes]]:
        outputs: List[Tuple[str, bytes]] = []
        if not payload:
            return outputs

        if portnum == portnums_pb2.TEXT_MESSAGE_APP:
            outputs.append(("meshtastic.TextMessage", payload))
            return outputs

        if portnum == portnums_pb2.TEXT_MESSAGE_COMPRESSED_APP:
            try:
                compressed = mesh_pb2.Compressed()
                compressed.ParseFromString(payload)
                outputs.append(
                    (
                        mesh_pb2.Compressed.DESCRIPTOR.full_name,
                        compressed.SerializeToString(),
                    )
                )
                inner_payload = bytes(compressed.data)
                try:
                    inner_payload = zlib.decompress(inner_payload)
                except zlib.error:
                    pass
                inner_port = int(getattr(compressed, "portnum", 0) or 0)
                if inner_port:
                    outputs.extend(
                        self._decode_port_payloads(inner_port, inner_payload)
                    )
            except Exception as exc:  # pragma: no cover - defensive
                logging.debug(
                    "Failed to parse compressed payload for portnum %s: %s",
                    portnum,
                    exc,
                )
                outputs.append((self._port_label(portnum), payload))
            return outputs

        proto_classes = _PORT_PROTO_HINTS.get(portnum, ())
        for proto_cls in proto_classes:
            try:
                nested_proto = proto_cls()
                nested_proto.ParseFromString(payload)
                byte_size = (
                    nested_proto.ByteSize()
                    if hasattr(nested_proto, "ByteSize")
                    else len(payload)
                )
                if byte_size == 0:
                    continue
                outputs.append(
                    (
                        nested_proto.DESCRIPTOR.full_name,
                        nested_proto.SerializeToString(),
                    )
                )
                break
            except Exception as exc:  # pragma: no cover - defensive
                logging.debug(
                    "Failed to decode payload for portnum %s using %s: %s",
                    portnum,
                    getattr(proto_cls, "__name__", str(proto_cls)),
                    exc,
                )
                continue

        if not outputs:
            outputs.append((self._port_label(portnum), payload))

        return outputs

    @staticmethod
    def _port_label(portnum: int) -> str:
        try:
            name = portnums_pb2.PortNum.Name(portnum)  # type: ignore[arg-type]
        except ValueError:
            name = f"UNKNOWN_{portnum}"
        return f"meshtastic.port.{name}"

    def _handle_size_limit(self, active: _ActiveCapture) -> None:
        if self._max_bytes is None:
            return

        logging.warning(
            "Capture %s reached configured size limit (%s bytes); stopping",
            active.session_id,
            self._max_bytes,
        )

        with self._lock:
            current = self._active.pop(active.session_id, None)

        if current is None:
            current = active

        try:
            current.writer.close()
        except Exception as exc:  # pragma: no cover - defensive
            logging.exception(
                "Failed to close writer when enforcing size limit for %s: %s",
                current.session_id,
                exc,
            )

        bytes_written = current.writer.bytes_written

        session = CaptureSession.objects.filter(id=current.session_id).first()
        if session is None:
            return

        existing_notes = session.notes or {}
        notes = dict(existing_notes) if isinstance(existing_notes, dict) else {}
        notes["max_size_reached"] = True

        session.status = CaptureSession.Status.COMPLETED
        session.ended_at = timezone.now()
        session.file_size = bytes_written
        session.notes = notes  # type: ignore[assignment]
        session.save(update_fields=["status", "ended_at", "file_size", "notes"])

        logging.info(
            "Capture %s closed at %.2f MiB due to size limit",
            session.id,
            bytes_written / (1024 * 1024),
        )

    def _handle_capture_error(self, session_id: UUID, message: str) -> None:
        with self._lock:
            active = self._active.pop(session_id, None)
        if active:
            try:
                active.writer.close()
            except Exception:  # pragma: no cover - defensive
                pass
        CaptureSession.objects.filter(id=session_id).update(
            status=CaptureSession.Status.ERROR,
            ended_at=timezone.now(),
        )
        session = CaptureSession.objects.filter(id=session_id).first()
        if session:
            notes = session.notes or {}
            notes["error"] = message
            session.notes = notes  # type: ignore[assignment]
            session.save(update_fields=["notes"])
        logging.error("Capture %s moved to ERROR: %s", session_id, message)

    def get_full_path(self, session: CaptureSession) -> Path:
        candidate = Path(session.file_path)
        if candidate.is_absolute():
            return candidate
        base_candidate = Path(settings.BASE_DIR) / candidate
        if base_candidate.exists():
            return base_candidate
        return self.base_dir / session.filename

    def _close_active_writer(self, active: Optional[_ActiveCapture]) -> None:
        if not active:
            return
        try:
            active.writer.close()
        except Exception as exc:  # pragma: no cover - defensive
            logging.exception(
                "Failed to close capture writer %s: %s", active.session_id, exc
            )

    def _delete_session(
        self, session: CaptureSession, active: Optional[_ActiveCapture]
    ) -> None:
        self._close_active_writer(active)

        path = self.get_full_path(session)
        if path.exists():
            try:
                path.unlink()
            except Exception as exc:  # pragma: no cover - defensive
                logging.exception("Failed to delete capture file %s: %s", path, exc)

        session_id = session.id
        session.delete()
        logging.info("Deleted capture %s", session_id)
