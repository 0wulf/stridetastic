from typing import List, Optional, Sequence, Dict, Any

from django.conf import settings  # type: ignore[import]
from ninja_extra import api_controller, route, permissions  # type: ignore[import]
from ninja_jwt.authentication import JWTAuth  # type: ignore[import]
from django.core.exceptions import ValidationError
from django.utils import timezone

from ..schemas import (
    MessageSchema,
    NodeSchema,
    PublishMessageSchema,
    PublishNodeInfoSchema,
    PublishPositionSchema,
    PublishTracerouteSchema,
    PublishTelemetrySchema,
    PublishReachabilitySchema,
    PublisherReactiveConfigUpdateSchema,
    PublisherReactiveStatusSchema,
    PublisherPeriodicJobSchema,
    PublisherPeriodicJobCreateSchema,
    PublisherPeriodicJobUpdateSchema,
)
from ..services.service_manager import ServiceManager
from ..models import Node, PublisherPeriodicJob
from ..models.interface_models import Interface
from ..utils.node_serialization import serialize_node
from ..tasks.publisher_tasks import (
    publish_text_message_task,
    publish_nodeinfo_task,
    publish_position_task,
    publish_traceroute_task,
    publish_reachability_probe_task,
    publish_telemetry_task,
)

auth = JWTAuth()

@api_controller("/publisher", tags=["Publisher"], permissions=[permissions.IsAuthenticated])
class PublisherController:

    def __init__(self):
        self.service_manager = ServiceManager.get_instance()

    def _get_publisher_service(self):
        service = self.service_manager.initialize_publisher_service()
        return service

    def _resolve_publisher(self, interface_id: int):
        return self.service_manager.resolve_publish_context(interface_id)

    def _ensure_selectable_nodes(self, node_ids: Sequence[Optional[str]]):
        """Return (None) if OK or an error tuple (400, MessageSchema) when nodes are invalid under SET_VIRTUAL_NODES."""
        if not getattr(settings, "SET_VIRTUAL_NODES", True):
            return None

        candidates = [nid for nid in node_ids if nid]
        if not candidates:
            return None

        existing = set(Node.objects.filter(node_id__in=candidates).values_list("node_id", flat=True))
        missing = [nid for nid in candidates if nid not in existing]
        if missing:
            return 400, MessageSchema(message=f"Node(s) not found or not selectable: {', '.join(missing)}")

        non_virtual = list(
            Node.objects.filter(node_id__in=candidates, is_virtual=False).values_list("node_id", flat=True)
        )
        if non_virtual:
            return 400, MessageSchema(message=f"Node(s) must be virtual to be used for publishing: {', '.join(non_virtual)}")

        return None

    def _sanitize_payload_options(self, payload_type: PublisherPeriodicJob.PayloadTypes, payload_options: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        options = dict(payload_options or {})
        if payload_type == PublisherPeriodicJob.PayloadTypes.TEXT:
            if "message_text" in options and isinstance(options["message_text"], str):
                options["message_text"] = options["message_text"].strip()
        elif payload_type == PublisherPeriodicJob.PayloadTypes.POSITION:
            for field in ("lat", "lon", "alt"):
                if field in options and options[field] is not None:
                    options[field] = float(options[field])
            # Accept optional want_response flag for periodic position requests
            if "want_response" in options:
                options["want_response"] = bool(options.get("want_response", False))
        elif payload_type == PublisherPeriodicJob.PayloadTypes.NODEINFO:
            if "hw_model" in options and options["hw_model"] is not None:
                options["hw_model"] = int(options["hw_model"])
        elif payload_type == PublisherPeriodicJob.PayloadTypes.TELEMETRY:
            # Normalize telemetry payload options
            telemetry_type = options.get("telemetry_type")
            if telemetry_type is not None:
                telemetry_type = str(telemetry_type)
                if telemetry_type not in ("device", "environment"):
                    telemetry_type = "device"
            else:
                telemetry_type = "device"
            telemetry_opts = options.get("telemetry_options") or {}
            sanitized_opts: Dict[str, Any] = {}
            # Known device fields
            for k in ("battery_level", "voltage", "channel_utilization", "air_util_tx", "uptime_seconds"):
                if k in telemetry_opts and telemetry_opts[k] is not None and telemetry_opts[k] != "":
                    try:
                        sanitized_opts[k] = int(telemetry_opts[k]) if k in ("battery_level", "uptime_seconds") else float(telemetry_opts[k])
                    except Exception:
                        sanitized_opts[k] = telemetry_opts[k]
            # Known environment fields
            for k in ("temperature", "relative_humidity", "barometric_pressure", "gas_resistance", "iaq"):
                if k in telemetry_opts and telemetry_opts[k] is not None and telemetry_opts[k] != "":
                    try:
                        sanitized_opts[k] = float(telemetry_opts[k])
                    except Exception:
                        sanitized_opts[k] = telemetry_opts[k]
            options["telemetry_type"] = telemetry_type
            options["telemetry_options"] = sanitized_opts
            if "want_response" in options:
                options["want_response"] = bool(options.get("want_response", False))
        return options

    def _serialize_periodic_job(self, job: PublisherPeriodicJob) -> Dict[str, Any]:
        interface = job.interface
        interface_payload = None
        if interface:
            interface_payload = {
                "id": interface.id,
                "name": interface.name,
                "display_name": interface.display_name,
                "status": interface.status,
            }

        return {
            "id": job.id,
            "name": job.name,
            "description": job.description or None,
            "enabled": job.enabled,
            "payload_type": job.payload_type,
            "from_node": job.from_node,
            "to_node": job.to_node,
            "channel_name": job.channel_name,
            "gateway_node": job.gateway_node or None,
            "channel_key": job.channel_key or None,
            "hop_limit": job.hop_limit,
            "hop_start": job.hop_start,
            "want_ack": job.want_ack,
            "pki_encrypted": job.pki_encrypted,
            "period_seconds": job.period_seconds,
            "interface_id": interface.id if interface else None,
            "interface": interface_payload,
            "payload_options": job.payload_options or {},
            "next_run_at": job.next_run_at,
            "last_run_at": job.last_run_at,
            "last_status": job.last_status,
            "last_error_message": job.last_error_message or None,
            "created_at": job.created_at,
            "updated_at": job.updated_at,
        }

    @route.get("/nodes/selectable", response=List[NodeSchema], auth=auth)
    def get_selectable_nodes(self, request):
        queryset = (
            Node.objects.all()
            .prefetch_related("interfaces")
            .order_by("long_name", "node_id")
        )
        if getattr(settings, "SET_VIRTUAL_NODES", True):
            queryset = queryset.filter(is_virtual=True)
        return [serialize_node(node) for node in queryset]

    @route.post("/publish/text-message", response={200: MessageSchema, 400: MessageSchema}, auth=auth)
    def publish_text_message(self, request, payload: PublishMessageSchema):
        # Enforce selectable node constraints if configured
        err = self._ensure_selectable_nodes([payload.from_node, payload.gateway_node])
        if err:
            return err
        
        try:
            # Queue the task in Celery worker (which has MQTT interfaces)
            task = publish_text_message_task.delay(
                from_node=payload.from_node,
                to_node=payload.to_node,
                message_text=payload.message_text,
                channel_name=payload.channel_name,
                channel_aes_key=payload.channel_key,
                hop_limit=payload.hop_limit,
                hop_start=payload.hop_start,
                want_ack=payload.want_ack,
                pki_encrypted=payload.pki_encrypted,
                gateway_node=payload.gateway_node,
                interface_id=payload.interface_id,
            )
            # Wait for task completion with timeout
            result = task.get(timeout=10)
            
            if result.get("success"):
                return 200, MessageSchema(message="Text message published successfully")
            else:
                error_msg = result.get("error", "Unknown error")
                return 400, MessageSchema(message=f"Failed to publish message: {error_msg}")
        except Exception as e:
            return 400, MessageSchema(message=f"Error queuing publish task: {str(e)}")

    @route.post("/publish/nodeinfo", response={200: MessageSchema, 400: MessageSchema}, auth=auth)
    def publish_nodeinfo(self, request, payload: PublishNodeInfoSchema):
        err = self._ensure_selectable_nodes([payload.from_node, payload.gateway_node])
        if err:
            return err
        
        try:
            # Queue the task in Celery worker (which has MQTT interfaces)
            task = publish_nodeinfo_task.delay(
                from_node=payload.from_node,
                to_node=payload.to_node,
                short_name=payload.short_name,
                long_name=payload.long_name,
                hw_model=payload.hw_model,
                public_key=payload.public_key,
                channel_name=payload.channel_name,
                channel_aes_key=payload.channel_key,
                hop_limit=payload.hop_limit,
                hop_start=payload.hop_start,
                want_ack=payload.want_ack,
                gateway_node=payload.gateway_node,
                interface_id=payload.interface_id,
            )
            # Wait for task completion with timeout
            result = task.get(timeout=10)
            
            if result.get("success"):
                return 200, MessageSchema(message="Node info published successfully")
            else:
                error_msg = result.get("error", "Unknown error")
                return 400, MessageSchema(message=f"Failed to publish node info: {error_msg}")
        except Exception as e:
            return 400, MessageSchema(message=f"Error queuing publish task: {str(e)}")

    @route.post("/publish/position", response={200: MessageSchema, 400: MessageSchema}, auth=auth)
    def publish_position(self, request, payload: PublishPositionSchema):
        err = self._ensure_selectable_nodes([payload.from_node, payload.gateway_node])
        if err:
            return err
        
        try:
            # Queue the task in Celery worker (which has MQTT interfaces)
            task = publish_position_task.delay(
                from_node=payload.from_node,
                to_node=payload.to_node,
                lat=payload.lat,
                lon=payload.lon,
                alt=payload.alt,
                channel_name=payload.channel_name,
                channel_aes_key=payload.channel_key,
                hop_limit=payload.hop_limit,
                hop_start=payload.hop_start,
                want_ack=payload.want_ack,
                want_response=payload.want_response if hasattr(payload, 'want_response') else False,
                pki_encrypted=payload.pki_encrypted if hasattr(payload, 'pki_encrypted') else False,
                gateway_node=payload.gateway_node,
                interface_id=payload.interface_id,
            )
            # Wait for task completion with timeout
            result = task.get(timeout=10)
            
            if result.get("success"):
                return 200, MessageSchema(message="Position published successfully")
            else:
                error_msg = result.get("error", "Unknown error")
                return 400, MessageSchema(message=f"Failed to publish position: {error_msg}")
        except Exception as e:
            return 400, MessageSchema(message=f"Error queuing publish task: {str(e)}")

    @route.post("/publish/traceroute", response={200: MessageSchema, 400: MessageSchema}, auth=auth)
    def publish_traceroute(self, request, payload: PublishTracerouteSchema):
        err = self._ensure_selectable_nodes([payload.from_node, payload.gateway_node])
        if err:
            return err
        
        try:
            # Queue the task in Celery worker (which has MQTT interfaces)
            task = publish_traceroute_task.delay(
                from_node=payload.from_node,
                to_node=payload.to_node,
                channel_name=payload.channel_name,
                channel_aes_key=payload.channel_key,
                hop_limit=payload.hop_limit,
                hop_start=payload.hop_start,
                want_ack=payload.want_ack,
                gateway_node=payload.gateway_node,
                interface_id=payload.interface_id,
            )
            # Wait for task completion with timeout
            result = task.get(timeout=10)
            
            if result.get("success"):
                return 200, MessageSchema(message="Traceroute published successfully")
            else:
                error_msg = result.get("error", "Unknown error")
                return 400, MessageSchema(message=f"Failed to publish traceroute: {error_msg}")
        except Exception as e:
            return 400, MessageSchema(message=f"Error queuing publish task: {str(e)}")

    @route.post("/publish/reachability-test", response={200: MessageSchema, 400: MessageSchema}, auth=auth)
    def publish_reachability_test(self, request, payload: PublishReachabilitySchema):
        err = self._ensure_selectable_nodes([payload.from_node, payload.gateway_node])
        if err:
            return err
        
        try:
            # Queue the task in Celery worker (which has MQTT interfaces)
            task = publish_reachability_probe_task.delay(
                from_node=payload.from_node,
                to_node=payload.to_node,
                channel_name=payload.channel_name,
                channel_aes_key=payload.channel_key,
                hop_limit=payload.hop_limit,
                hop_start=payload.hop_start,
                gateway_node=payload.gateway_node,
                interface_id=payload.interface_id,
            )
            # Wait for task completion with timeout
            result = task.get(timeout=10)
            
            if result.get("success"):
                return 200, MessageSchema(message="Reachability probe dispatched")
            else:
                error_msg = result.get("error", "Unknown error")
                return 400, MessageSchema(message=f"Failed to send reachability probe: {error_msg}")
        except Exception as e:
            return 400, MessageSchema(message=f"Error queuing publish task: {str(e)}")

    @route.post("/publish/telemetry", response={200: MessageSchema, 400: MessageSchema}, auth=auth)
    def publish_telemetry(self, request, payload: PublishTelemetrySchema):
        err = self._ensure_selectable_nodes([payload.from_node, payload.gateway_node])
        if err:
            return err

        try:
            task = publish_telemetry_task.delay(
                from_node=payload.from_node,
                to_node=payload.to_node,
                channel_name=payload.channel_name,
                channel_aes_key=payload.channel_key,
                hop_limit=payload.hop_limit,
                hop_start=payload.hop_start,
                want_ack=payload.want_ack,
                want_response=payload.want_response if hasattr(payload, 'want_response') else False,
                telemetry_type=payload.telemetry_type,
                telemetry_options=payload.telemetry_options,
                pki_encrypted=payload.pki_encrypted,
                gateway_node=payload.gateway_node,
                interface_id=payload.interface_id,
            )
            result = task.get(timeout=10)

            if result.get("success"):
                return 200, MessageSchema(message="Telemetry published successfully")
            else:
                error_msg = result.get("error", "Unknown error")
                return 400, MessageSchema(message=f"Failed to publish telemetry: {error_msg}")
        except Exception as e:
            return 400, MessageSchema(message=f"Error queuing publish task: {str(e)}")

    @route.get("/reactive/status", response={200: PublisherReactiveStatusSchema, 400: MessageSchema}, auth=auth)
    def get_reactive_status(self, request):
        publisher_service = self._get_publisher_service()
        if not publisher_service:
            return 400, MessageSchema(message="Publisher service not available")
        status = publisher_service.get_reactive_status()
        return 200, status

    @route.post("/reactive/config", response={200: PublisherReactiveStatusSchema, 400: MessageSchema}, auth=auth)
    def update_reactive_config(self, request, payload: PublisherReactiveConfigUpdateSchema):
        publisher_service = self._get_publisher_service()
        if not publisher_service:
            return 400, MessageSchema(message="Publisher service not available")

        update_data = payload.dict(exclude_unset=True)

        if update_data:
            err = self._ensure_selectable_nodes([
                update_data.get("from_node"),
                update_data.get("gateway_node"),
            ])
            if err:
                return err

        try:
            publisher_service.update_reactive_config(**update_data)
            self.service_manager.refresh_publisher_reactive_runtime()
            status = publisher_service.get_reactive_status()
            return 200, status
        except Exception as exc:
            return 400, MessageSchema(message=f"Failed to update reactive config: {exc}")

    @route.get("/periodic/jobs", response=List[PublisherPeriodicJobSchema], auth=auth)
    def list_periodic_jobs(self, request):
        jobs = PublisherPeriodicJob.objects.select_related("interface").order_by("name")
        return [self._serialize_periodic_job(job) for job in jobs]

    @route.post("/periodic/jobs", response={200: PublisherPeriodicJobSchema, 400: MessageSchema}, auth=auth)
    def create_periodic_job(self, request, payload: PublisherPeriodicJobCreateSchema):
        data = payload.dict()
        err = self._ensure_selectable_nodes([data.get("from_node"), data.get("gateway_node")])
        if err:
            return err

        interface_id = data.pop("interface_id", None)
        payload_options = self._sanitize_payload_options(
            PublisherPeriodicJob.PayloadTypes(data["payload_type"]),
            data.pop("payload_options", {}),
        )

        interface = None
        if interface_id is not None:
            interface = Interface.objects.filter(id=interface_id).first()
            if not interface:
                return 400, MessageSchema(message="Interface not found")

        data["name"] = data.get("name", "").strip()
        data["channel_name"] = data.get("channel_name", "").strip()
        if data.get("channel_key") is None:
            data["channel_key"] = ""
        if data.get("gateway_node") is None:
            data["gateway_node"] = ""

        job = PublisherPeriodicJob(**data, payload_options=payload_options, interface=interface)

        try:
            job.full_clean()
        except ValidationError as exc:
            return 400, MessageSchema(message=str(exc))

        if job.enabled and job.next_run_at is None:
            job.next_run_at = timezone.now()

        job.save()
        job.refresh_from_db()
        return self._serialize_periodic_job(job)

    @route.put("/periodic/jobs/{job_id}", response={200: PublisherPeriodicJobSchema, 400: MessageSchema, 404: MessageSchema}, auth=auth)
    def update_periodic_job(self, request, job_id: int, payload: PublisherPeriodicJobUpdateSchema):
        job = PublisherPeriodicJob.objects.select_related("interface").filter(pk=job_id).first()
        if not job:
            return 404, MessageSchema(message="Periodic job not found")

        update_data = payload.dict(exclude_unset=True)
        if not update_data:
            return self._serialize_periodic_job(job)

        err = self._ensure_selectable_nodes([
            update_data.get("from_node", job.from_node),
            update_data.get("gateway_node", job.gateway_node or None),
        ])
        if err:
            return err

        interface_id = update_data.pop("interface_id", None)
        if "payload_options" in update_data:
            update_data["payload_options"] = self._sanitize_payload_options(
                PublisherPeriodicJob.PayloadTypes(update_data.get("payload_type", job.payload_type)),
                update_data["payload_options"],
            )

        if interface_id is not None:
            if interface_id == 0:
                job.interface = None
            else:
                interface = Interface.objects.filter(id=interface_id).first()
                if not interface:
                    return 400, MessageSchema(message="Interface not found")
                job.interface = interface

        previous_enabled = job.enabled
        previous_period = job.period_seconds

        for field, value in update_data.items():
            if field in {"name", "channel_name"} and isinstance(value, str):
                value = value.strip()
            if field == "channel_key" and value is None:
                value = ""
            if field == "gateway_node" and value is None:
                value = ""
            setattr(job, field, value)

        try:
            job.full_clean()
        except ValidationError as exc:
            return 400, MessageSchema(message=str(exc))

        reset_next_run = False
        if "enabled" in update_data:
            reset_next_run = reset_next_run or (previous_enabled is False and job.enabled is True)
        if "period_seconds" in update_data and job.enabled:
            reset_next_run = True

        if reset_next_run and job.enabled:
            job.next_run_at = timezone.now()

        job.save()
        job.refresh_from_db()
        return self._serialize_periodic_job(job)

    @route.delete("/periodic/jobs/{job_id}", response={200: MessageSchema, 404: MessageSchema}, auth=auth)
    def delete_periodic_job(self, request, job_id: int):
        job = PublisherPeriodicJob.objects.filter(pk=job_id).first()
        if not job:
            return 404, MessageSchema(message="Periodic job not found")
        job.delete()
        return 200, MessageSchema(message="Periodic job deleted")
