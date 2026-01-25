from typing import List, Optional

from django.core.exceptions import ValidationError
from ninja_extra import permissions  # type: ignore[import]
from ninja_extra import api_controller, route
from ninja_jwt.authentication import JWTAuth  # type: ignore[import]

from ..models import KeepaliveConfig, Node, NodePresenceHistory
from ..models.interface_models import Interface
from ..schemas import (
    KeepaliveConfigSchema,
    KeepaliveConfigUpdateSchema,
    KeepaliveInterfaceSchema,
    KeepaliveNodeSummarySchema,
    KeepaliveStatusSchema,
    KeepaliveTransitionSchema,
    MessageSchema,
)
from ..utils.time_filters import parse_time_window

auth = JWTAuth()
DEFAULT_TRANSITION_LAST = "1hour"
DEFAULT_TRANSITION_LIMIT = 200
MAX_TRANSITION_LIMIT = 500


@api_controller(
    "/keepalive", tags=["Keepalive"], permissions=[permissions.IsAuthenticated]
)
class KeepaliveController:
    def _serialize_config(self, config: KeepaliveConfig) -> KeepaliveConfigSchema:
        selected_nodes = list(
            config.selected_nodes.all().only(
                "id", "node_id", "node_num", "short_name", "long_name"
            )
        )
        iface = config.interface
        interface_payload = None
        if iface:
            interface_payload = KeepaliveInterfaceSchema(
                id=iface.id,
                name=iface.name,
                interface_type=iface.interface_type,
                status=iface.status,
            )
        return KeepaliveConfigSchema(
            enabled=bool(config.enabled),
            payload_type=config.payload_type,
            from_node=config.from_node or None,
            gateway_node=config.gateway_node or None,
            channel_name=config.channel_name or None,
            channel_key=config.channel_key or None,
            hop_limit=int(config.hop_limit),
            hop_start=int(config.hop_start),
            interface_id=iface.id if iface else None,
            interface=interface_payload,
            offline_after_seconds=int(config.offline_after_seconds),
            check_interval_seconds=int(config.check_interval_seconds),
            scope=config.scope,
            selected_node_ids=[node.id for node in selected_nodes],
            selected_nodes=[
                KeepaliveNodeSummarySchema(
                    id=node.id,
                    node_id=node.node_id,
                    node_num=node.node_num,
                    short_name=node.short_name,
                    long_name=node.long_name,
                )
                for node in selected_nodes
            ],
        )

    def _serialize_status(self, config: KeepaliveConfig) -> KeepaliveStatusSchema:
        return KeepaliveStatusSchema(
            enabled=bool(config.enabled),
            config=self._serialize_config(config),
            last_run_at=config.last_run_at,
            last_error_message=config.last_error_message or None,
        )

    @route.get(
        "/status",
        response={200: KeepaliveStatusSchema, 400: MessageSchema},
        auth=auth,
    )
    def get_status(self, request):
        try:
            config = KeepaliveConfig.get_solo()
            return 200, self._serialize_status(config)
        except Exception as exc:
            return 400, MessageSchema(message=f"Failed to load keepalive status: {exc}")

    @route.post(
        "/config",
        response={200: KeepaliveStatusSchema, 400: MessageSchema},
        auth=auth,
    )
    def update_config(self, request, payload: KeepaliveConfigUpdateSchema):
        data = payload.dict(exclude_unset=True)
        try:
            config = KeepaliveConfig.get_solo()

            if "enabled" in data:
                config.enabled = bool(data["enabled"])
            if "payload_type" in data and data["payload_type"]:
                config.payload_type = str(data["payload_type"])
            if "from_node" in data:
                config.from_node = str(data["from_node"] or "")
            if "gateway_node" in data:
                config.gateway_node = str(data["gateway_node"] or "")
            if "channel_name" in data:
                config.channel_name = str(data["channel_name"] or "")
            if "channel_key" in data:
                config.channel_key = str(data["channel_key"] or "")
            if "hop_limit" in data and data["hop_limit"] is not None:
                config.hop_limit = int(data["hop_limit"])
            if "hop_start" in data and data["hop_start"] is not None:
                config.hop_start = int(data["hop_start"])
            if (
                "offline_after_seconds" in data
                and data["offline_after_seconds"] is not None
            ):
                config.offline_after_seconds = int(data["offline_after_seconds"])
            if (
                "check_interval_seconds" in data
                and data["check_interval_seconds"] is not None
            ):
                config.check_interval_seconds = int(data["check_interval_seconds"])
            if "scope" in data and data["scope"]:
                config.scope = str(data["scope"])

            interface_id = data.get("interface_id")
            if interface_id is not None:
                iface = Interface.objects.filter(id=interface_id).first()
                if not iface:
                    return 400, MessageSchema(message="Interface not found")
                if iface.interface_type != Interface.Types.MQTT:
                    return 400, MessageSchema(
                        message="Interface type not supported for keepalive"
                    )
                config.interface = iface
            elif "interface_id" in data and interface_id is None:
                config.interface = None

            try:
                config.full_clean()
            except ValidationError as exc:
                return 400, MessageSchema(message=str(exc))

            config.save()

            if "selected_node_ids" in data:
                node_ids = data.get("selected_node_ids") or []
                selected_qs = Node.objects.filter(id__in=node_ids)
                config.selected_nodes.set(selected_qs)

            config.refresh_from_db()
            return 200, self._serialize_status(config)
        except Exception as exc:
            return 400, MessageSchema(
                message=f"Failed to update keepalive config: {exc}"
            )

    @route.get(
        "/transitions",
        response={200: List[KeepaliveTransitionSchema], 400: MessageSchema},
        auth=auth,
    )
    def list_transitions(
        self,
        request,
        last: Optional[str] = DEFAULT_TRANSITION_LAST,
        since: Optional[str] = None,
        until: Optional[str] = None,
        limit: Optional[int] = None,
    ):
        try:
            since_utc, until_utc = parse_time_window(
                last=last, since=since, until=until
            )
        except ValueError as exc:
            return 400, MessageSchema(message=str(exc))

        max_limit = DEFAULT_TRANSITION_LIMIT
        if limit is not None:
            max_limit = max(1, min(limit, MAX_TRANSITION_LIMIT))

        qs = NodePresenceHistory.objects.select_related("node").all()
        if since_utc is not None:
            qs = qs.filter(time__gte=since_utc)
        if until_utc is not None:
            qs = qs.filter(time__lte=until_utc)

        entries = list(qs.order_by("-time")[:max_limit])
        return [
            KeepaliveTransitionSchema(
                id=entry.id,
                node_id=entry.node.node_id,
                node_num=entry.node.node_num,
                short_name=entry.node.short_name,
                long_name=entry.node.long_name,
                last_seen=entry.last_seen,
                offline_at=entry.offline_at,
                reason=entry.reason,
                recorded_at=entry.time,
            )
            for entry in entries
        ]
