# Node Controller

# 1. GET for 1 node
# 2. GET for all nodes
# 2. Get statistics for node


from collections import defaultdict
from typing import List, Optional

from django.db.models import Count, Max, Q  # type: ignore[import]
from meshtastic.protobuf import portnums_pb2  # type: ignore[attr-defined]
from ninja_extra import permissions  # type: ignore[import]
from ninja_extra import api_controller, route
from ninja_jwt.authentication import JWTAuth  # type: ignore[import]

from ..models import Node, NodeLatencyHistory  # type: ignore[import]
from ..models.packet_models import PacketData, PositionPayload, TelemetryPayload
from ..schemas import (
    MessageSchema,
    NodeKeyHealthSchema,
    NodeLatencyHistorySchema,
    NodePortActivitySchema,
    NodePortPacketSchema,
    NodePositionHistorySchema,
    NodeSchema,
    NodeStatisticsSchema,
    NodeTelemetryHistorySchema,
    VirtualNodeCreateSchema,
    VirtualNodeSecretsSchema,
    VirtualNodeUpdateSchema,
)
from ..services.virtual_node_service import VirtualNodeError, VirtualNodeService
from ..utils.node_serialization import serialize_node
from ..utils.packet_payloads import build_packet_payload_schema
from ..utils.ports import resolve_port_identity
from ..utils.time_filters import parse_time_window

auth = JWTAuth()


@api_controller("/nodes", tags=["Nodes"], permissions=[permissions.IsAuthenticated])
class NodeController:
    def _serialize_node(self, node: Node) -> NodeSchema:
        return serialize_node(node)

    @route.get(
        "/",
        response={200: List[NodeSchema], 404: MessageSchema, 400: MessageSchema},
        auth=auth,
    )
    def get_all_nodes(
        self,
        request,
    ):
        """
        Get a list of all nodes.

        Here we should rethink the interfaces logic, maybe its not optimal.
        """
        query_params = request.GET
        last = query_params.get("last")
        since = query_params.get("since")
        until = query_params.get("until")

        try:
            since_utc, until_utc = parse_time_window(
                last=last, since=since, until=until
            )
        except ValueError as e:
            return 400, MessageSchema(message=str(e))

        nodes_qs = Node.objects.all().prefetch_related("interfaces")
        if since_utc is not None:
            nodes_qs = nodes_qs.filter(last_seen__gte=since_utc)
        if until_utc is not None:
            nodes_qs = nodes_qs.filter(last_seen__lte=until_utc)

        nodes = list(nodes_qs)
        if not nodes:
            return 404, MessageSchema(message="No nodes found")
        return 200, [self._serialize_node(node) for node in nodes]

    @route.get("/keys/health", response=List[NodeKeyHealthSchema], auth=auth)
    def get_node_key_health(self):
        """Return nodes that have low-entropy keys or duplicate public keys."""
        nodes = list(
            Node.objects.all()
            .only(
                "node_id",
                "node_num",
                "short_name",
                "long_name",
                "mac_address",
                "public_key",
                "is_virtual",
                "is_low_entropy_public_key",
                "first_seen",
                "last_seen",
            )
            .order_by("-last_seen")
        )

        key_to_nodes = defaultdict(list)
        for node in nodes:
            key_value = (node.public_key or "").strip()
            if not key_value:
                continue
            key_to_nodes[key_value].append(node)

        results: List[NodeKeyHealthSchema] = []
        for node in nodes:
            key_value = (node.public_key or "").strip()
            duplicates = key_to_nodes.get(key_value, []) if key_value else []
            duplicate_node_ids = [
                peer.node_id for peer in duplicates if peer.node_id != node.node_id
            ]
            duplicate_count = len(duplicates) if len(duplicates) > 1 else 0

            if not node.is_low_entropy_public_key and duplicate_count <= 0:
                continue

            results.append(
                NodeKeyHealthSchema(
                    node_id=node.node_id,
                    node_num=node.node_num,
                    short_name=node.short_name,
                    long_name=node.long_name,
                    mac_address=node.mac_address,
                    public_key=node.public_key,
                    is_virtual=node.is_virtual,
                    is_low_entropy_public_key=node.is_low_entropy_public_key,
                    duplicate_count=duplicate_count,
                    duplicate_node_ids=duplicate_node_ids,
                    first_seen=node.first_seen,
                    last_seen=node.last_seen,
                )
            )

        results.sort(
            key=lambda entry: (
                0 if entry.is_low_entropy_public_key else 1,
                -entry.duplicate_count,
                -entry.last_seen.timestamp(),
            )
        )
        return results

    @route.get("/virtual", response=List[NodeSchema], auth=auth)
    def list_virtual_nodes(self):
        nodes = (
            Node.objects.filter(is_virtual=True)
            .prefetch_related("interfaces")
            .order_by("long_name", "node_id")
        )
        return [self._serialize_node(node) for node in nodes]

    @route.post(
        "/virtual",
        response={201: VirtualNodeSecretsSchema, 400: MessageSchema},
        auth=auth,
    )
    def create_virtual_node(self, payload: VirtualNodeCreateSchema):
        payload_data = payload.dict(exclude_unset=True)
        try:
            node, secrets = VirtualNodeService.create_virtual_node(payload_data)
        except VirtualNodeError as exc:
            return 400, MessageSchema(message=str(exc))

        return 201, VirtualNodeSecretsSchema(
            node=self._serialize_node(node),
            public_key=secrets.public_key,
            private_key=secrets.private_key,
        )

    @route.put(
        "/virtual/{node_id}",
        response={
            200: VirtualNodeSecretsSchema,
            400: MessageSchema,
            404: MessageSchema,
        },
        auth=auth,
    )
    def update_virtual_node(self, node_id: str, payload: VirtualNodeUpdateSchema):
        node = Node.objects.filter(node_id=node_id).first()
        if not node or not node.is_virtual:
            return 404, MessageSchema(message="Virtual node not found")

        payload_data = payload.dict(exclude_unset=True)
        regenerate_keys = bool(payload_data.pop("regenerate_keys", False))

        try:
            updated_node, secrets = VirtualNodeService.update_virtual_node(
                node,
                payload_data,
                regenerate_keys=regenerate_keys,
            )
        except VirtualNodeError as exc:
            return 400, MessageSchema(message=str(exc))

        return 200, VirtualNodeSecretsSchema(
            node=self._serialize_node(updated_node),
            public_key=secrets.public_key if secrets else None,
            private_key=secrets.private_key if secrets else None,
        )

    @route.delete(
        "/virtual/{node_id}",
        response={200: MessageSchema, 404: MessageSchema, 400: MessageSchema},
        auth=auth,
    )
    def delete_virtual_node(self, node_id: str):
        node = Node.objects.filter(node_id=node_id).first()
        if not node or not node.is_virtual:
            return 404, MessageSchema(message="Virtual node not found")

        try:
            VirtualNodeService.delete_virtual_node(node)
        except VirtualNodeError as exc:
            return 400, MessageSchema(message=str(exc))

        return 200, MessageSchema(message="Virtual node deleted")

    @route.get("/{node_id}", response={200: NodeSchema, 404: MessageSchema}, auth=auth)
    def get_node(self, node_id: str):
        """
        Get details of a specific node by ID.
        """
        node = Node.objects.filter(node_id=node_id).first()
        if not node:
            return 404, MessageSchema(message="Node not found")
        return 200, self._serialize_node(node)

    @route.get(
        "/{node_id}/statistics",
        response={200: NodeStatisticsSchema, 404: MessageSchema},
        auth=auth,
    )
    def get_node_statistics(self, node_id: str):
        """
        Get statistics for a specific node.
        """
        pass

    @route.get(
        "/{node_id}/positions",
        response={
            200: List[NodePositionHistorySchema],
            400: MessageSchema,
            404: MessageSchema,
        },
        auth=auth,
    )
    def get_node_positions(self, request, node_id: str):
        """Return historical position updates for the requested node."""
        node = Node.objects.filter(node_id=node_id).first()
        if not node:
            return 404, MessageSchema(message="Node not found")

        query_params = request.GET
        last = query_params.get("last")
        since = query_params.get("since")
        until = query_params.get("until")
        limit_param = query_params.get("limit")

        try:
            since_utc, until_utc = parse_time_window(
                last=last, since=since, until=until
            )
        except ValueError as exc:
            return 400, MessageSchema(message=str(exc))

        limit = 100
        if limit_param:
            try:
                limit = int(limit_param)
            except ValueError:
                return 400, MessageSchema(message="Invalid limit parameter")
        limit = max(1, min(limit, 500))

        positions_qs = (
            PositionPayload.objects.filter(
                packet_data__packet__from_node=node,
                latitude__isnull=False,
                longitude__isnull=False,
            )
            .select_related("packet_data__packet")
            .order_by("-time")
        )

        if since_utc is not None:
            positions_qs = positions_qs.filter(time__gte=since_utc)
        if until_utc is not None:
            positions_qs = positions_qs.filter(time__lte=until_utc)

        positions = list(positions_qs[:limit])
        if not positions:
            return 200, []

        history = []
        for payload in reversed(positions):
            latitude = float(payload.latitude) if payload.latitude is not None else None
            longitude = (
                float(payload.longitude) if payload.longitude is not None else None
            )
            if latitude is None or longitude is None:
                continue
            altitude = float(payload.altitude) if payload.altitude is not None else None
            accuracy = float(payload.accuracy) if payload.accuracy is not None else None
            packet = getattr(payload.packet_data, "packet", None)
            packet_id = getattr(packet, "packet_id", None) if packet else None
            history.append(
                NodePositionHistorySchema(
                    timestamp=payload.time,
                    latitude=latitude,
                    longitude=longitude,
                    altitude=altitude,
                    accuracy=accuracy,
                    sequence_number=payload.seq_number,
                    location_source=payload.location_source,
                    packet_id=packet_id,
                )
            )

        return 200, history

    @route.get(
        "/{node_id}/telemetry",
        response={
            200: List[NodeTelemetryHistorySchema],
            400: MessageSchema,
            404: MessageSchema,
        },
        auth=auth,
    )
    def get_node_telemetry(self, request, node_id: str):
        """Return historical telemetry readings for the requested node."""
        node = Node.objects.filter(node_id=node_id).first()
        if not node:
            return 404, MessageSchema(message="Node not found")

        query_params = request.GET
        last = query_params.get("last")
        since = query_params.get("since")
        until = query_params.get("until")
        limit_param = query_params.get("limit")

        try:
            since_utc, until_utc = parse_time_window(
                last=last, since=since, until=until
            )
        except ValueError as exc:
            return 400, MessageSchema(message=str(exc))

        limit = 200
        if limit_param:
            try:
                limit = int(limit_param)
            except ValueError:
                return 400, MessageSchema(message="Invalid limit parameter")
        limit = max(1, min(limit, 500))

        telemetry_qs = (
            TelemetryPayload.objects.filter(
                packet_data__packet__from_node=node,
            )
            .select_related("packet_data__packet")
            .order_by("-time")
        )

        if since_utc is not None:
            telemetry_qs = telemetry_qs.filter(time__gte=since_utc)
        if until_utc is not None:
            telemetry_qs = telemetry_qs.filter(time__lte=until_utc)

        telemetry = list(telemetry_qs[:limit])
        if not telemetry:
            return 200, []

        history: List[NodeTelemetryHistorySchema] = []
        for payload in reversed(telemetry):
            history.append(
                NodeTelemetryHistorySchema(
                    timestamp=payload.time,
                    battery_level=payload.battery_level,
                    voltage=(
                        float(payload.voltage) if payload.voltage is not None else None
                    ),
                    channel_utilization=(
                        float(payload.channel_utilization)
                        if payload.channel_utilization is not None
                        else None
                    ),
                    air_util_tx=(
                        float(payload.air_util_tx)
                        if payload.air_util_tx is not None
                        else None
                    ),
                    uptime_seconds=payload.uptime_seconds,
                    temperature=(
                        float(payload.temperature)
                        if payload.temperature is not None
                        else None
                    ),
                    relative_humidity=(
                        float(payload.relative_humidity)
                        if payload.relative_humidity is not None
                        else None
                    ),
                    barometric_pressure=(
                        float(payload.barometric_pressure)
                        if payload.barometric_pressure is not None
                        else None
                    ),
                    gas_resistance=(
                        float(payload.gas_resistance)
                        if payload.gas_resistance is not None
                        else None
                    ),
                    iaq=float(payload.iaq) if payload.iaq is not None else None,
                )
            )

        return 200, history

    @route.get(
        "/{node_id}/latency",
        response={
            200: List[NodeLatencyHistorySchema],
            400: MessageSchema,
            404: MessageSchema,
        },
        auth=auth,
    )
    def get_node_latency_history(self, request, node_id: str):
        """Return historical latency probe results for the requested node."""
        node = Node.objects.filter(node_id=node_id).first()
        if not node:
            return 404, MessageSchema(message="Node not found")

        query_params = request.GET
        last = query_params.get("last")
        since = query_params.get("since")
        until = query_params.get("until")
        limit_param = query_params.get("limit")

        try:
            since_utc, until_utc = parse_time_window(
                last=last, since=since, until=until
            )
        except ValueError as exc:
            return 400, MessageSchema(message=str(exc))

        limit = 200
        if limit_param:
            try:
                limit = int(limit_param)
            except ValueError:
                return 400, MessageSchema(message="Invalid limit parameter")
        limit = max(1, min(limit, 500))

        history_qs = NodeLatencyHistory.objects.filter(node=node).order_by("-time")

        if since_utc is not None:
            history_qs = history_qs.filter(time__gte=since_utc)
        if until_utc is not None:
            history_qs = history_qs.filter(time__lte=until_utc)

        entries = list(history_qs[:limit])
        if not entries:
            return 200, []

        response_payload: List[NodeLatencyHistorySchema] = []
        for record in reversed(entries):
            response_payload.append(
                NodeLatencyHistorySchema(
                    timestamp=record.time,
                    probe_message_id=record.probe_message_id,
                    reachable=record.reachable,
                    latency_ms=record.latency_ms,
                    responded_at=record.responded_at,
                )
            )

        return 200, response_payload

    @route.get(
        "/{node_id}/ports",
        response={200: List[NodePortActivitySchema], 404: MessageSchema},
        auth=auth,
    )
    def get_node_port_activity(self, node_id: str):
        node = Node.objects.filter(node_id=node_id).first()
        if not node:
            return 404, MessageSchema(message="Node not found")

        base_filter = Q(port__isnull=False) | Q(portnum__isnull=False)

        sent_query = (
            PacketData.objects.filter(base_filter, packet__from_node=node)
            .values("port", "portnum")
            .annotate(count=Count("id"), last_seen=Max("time"))
        )
        received_query = (
            PacketData.objects.filter(base_filter, packet__to_node=node)
            .values("port", "portnum")
            .annotate(count=Count("id"), last_seen=Max("time"))
        )

        def build_port_map(queryset):
            port_map = {}
            for entry in queryset:
                port_key, display_name = resolve_port_identity(
                    entry["port"], entry["portnum"]
                )
                port_map[port_key] = {
                    "count": entry["count"],
                    "last_seen": entry["last_seen"],
                    "display": display_name,
                }
            return port_map

        sent_map = build_port_map(sent_query)
        received_map = build_port_map(received_query)

        all_ports = set(sent_map.keys()) | set(received_map.keys())

        results: List[NodePortActivitySchema] = []
        for port_key in sorted(all_ports):
            sent_entry = sent_map.get(port_key)
            received_entry = received_map.get(port_key)
            display_entry = sent_entry if sent_entry else received_entry
            display_name = display_entry["display"] if display_entry else port_key
            results.append(
                NodePortActivitySchema(
                    port=port_key,
                    display_name=display_name,
                    sent_count=sent_entry["count"] if sent_entry else 0,
                    received_count=received_entry["count"] if received_entry else 0,
                    last_sent=sent_entry["last_seen"] if sent_entry else None,
                    last_received=(
                        received_entry["last_seen"] if received_entry else None
                    ),
                )
            )

        # Sort by combined activity descending for convenience
        results.sort(
            key=lambda item: item.sent_count + item.received_count, reverse=True
        )
        return 200, results

    @route.get(
        "/{node_id}/ports/{port}/packets",
        response={
            200: List[NodePortPacketSchema],
            400: MessageSchema,
            404: MessageSchema,
        },
        auth=auth,
    )
    def get_node_port_packets(self, request, node_id: str, port: str):
        node = Node.objects.filter(node_id=node_id).first()
        if not node:
            return 404, MessageSchema(message="Node not found")

        raw_port = port.strip()
        if not raw_port:
            return 400, MessageSchema(message="Port identifier is required")

        port_conditions: List[Q] = []
        canonical_port: Optional[str] = None

        # Attempt numeric interpretation first to support /ports/32 style access
        try:
            portnum_value = int(raw_port, 0)
        except ValueError:
            portnum_value = None

        if portnum_value is not None:
            canonical_port, _ = resolve_port_identity(None, portnum_value)
            port_conditions.append(Q(portnum=portnum_value))
            port_conditions.append(Q(port=canonical_port))
        else:
            normalized = raw_port.replace("-", "_").upper()
            canonical_port, _ = resolve_port_identity(normalized, None)
            port_conditions.append(Q(port=canonical_port))
            if normalized != canonical_port:
                port_conditions.append(Q(port=normalized))
            try:
                portnum_value = portnums_pb2.PortNum.Value(canonical_port)
                port_conditions.append(Q(portnum=portnum_value))
            except ValueError:
                portnum_value = None

        if not port_conditions:
            return 400, MessageSchema(message="Unable to resolve port identifier")

        port_filters = port_conditions[0]
        for condition in port_conditions[1:]:
            port_filters |= condition

        query_params = request.GET
        direction_param = (query_params.get("direction") or "all").lower()
        if direction_param not in {"all", "sent", "received"}:
            return 400, MessageSchema(
                message="direction must be 'all', 'sent', or 'received'"
            )

        last = query_params.get("last")
        since = query_params.get("since")
        until = query_params.get("until")
        try:
            since_utc, until_utc = parse_time_window(
                last=last, since=since, until=until
            )
        except ValueError as exc:
            return 400, MessageSchema(message=str(exc))

        limit_param = query_params.get("limit")
        limit = 50
        if limit_param:
            try:
                limit = int(limit_param)
            except ValueError:
                return 400, MessageSchema(message="Invalid limit parameter")
        limit = max(1, min(limit, 200))

        qs = (
            PacketData.objects.filter(port_filters)
            .filter(Q(packet__from_node=node) | Q(packet__to_node=node))
            .select_related(
                "packet",
                "packet__from_node",
                "packet__to_node",
                "telemetry_payload",
                "position_payload",
                "node_info_payload",
                "neighbor_info_payload",
                "route_discovery_payload",
                "route_discovery_payload__route_towards",
                "route_discovery_payload__route_back",
                "routing_payload",
            )
            .prefetch_related(
                "neighbor_info_payload__neighbors",
                "neighbor_info_payload__neighbors__node",
                "route_discovery_payload__route_towards__nodes",
                "route_discovery_payload__route_back__nodes",
            )
            .order_by("-time")
        )

        if direction_param == "sent":
            qs = qs.filter(packet__from_node=node)
        elif direction_param == "received":
            qs = qs.filter(packet__to_node=node)

        if since_utc is not None:
            qs = qs.filter(time__gte=since_utc)
        if until_utc is not None:
            qs = qs.filter(time__lte=until_utc)

        packet_entries = list(qs[:limit])
        if not packet_entries:
            return 200, []

        results: List[NodePortPacketSchema] = []
        for packet_data in packet_entries:
            packet = getattr(packet_data, "packet", None)
            if packet is None:
                continue

            port_key, port_display = resolve_port_identity(
                packet_data.port, packet_data.portnum
            )

            direction = "sent" if packet.from_node_id == node.pk else "received"
            payload_schema = build_packet_payload_schema(packet_data)

            results.append(
                NodePortPacketSchema(
                    packet_id=packet.packet_id,
                    timestamp=packet_data.time,
                    direction=direction,
                    port=port_key,
                    display_name=port_display,
                    portnum=packet_data.portnum,
                    from_node_id=getattr(packet.from_node, "node_id", None),
                    to_node_id=getattr(packet.to_node, "node_id", None),
                    payload=payload_schema,
                )
            )

        return 200, results
