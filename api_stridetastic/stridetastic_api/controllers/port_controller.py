from typing import List
from urllib.parse import unquote

from django.db.models import Count, Max, Q  # type: ignore[import]
from meshtastic.protobuf import portnums_pb2  # type: ignore[attr-defined]
from ninja_extra import permissions  # type: ignore[import]
from ninja_extra import api_controller, route
from ninja_jwt.authentication import JWTAuth  # type: ignore[import]

from ..models.packet_models import PacketData
from ..schemas import MessageSchema, PortActivitySchema, PortNodeActivitySchema
from ..utils.ports import resolve_port_identity

auth = JWTAuth()


@api_controller("/ports", tags=["Ports"], permissions=[permissions.IsAuthenticated])
class PortController:
    @route.get("/activity", response={200: List[PortActivitySchema]}, auth=auth)
    def get_port_activity(self):
        queryset = (
            PacketData.objects.filter(Q(port__isnull=False) | Q(portnum__isnull=False))
            .values("port", "portnum")
            .annotate(total_packets=Count("id"), last_seen=Max("time"))
            .order_by("-total_packets")
        )

        results: List[PortActivitySchema] = []
        for entry in queryset:
            canonical_port, display_name = resolve_port_identity(
                entry["port"], entry["portnum"]
            )
            results.append(
                PortActivitySchema(
                    port=canonical_port,
                    display_name=display_name,
                    total_packets=entry["total_packets"],
                    last_seen=entry["last_seen"],
                )
            )

        return 200, results

    @route.get(
        "/{port}/nodes",
        response={200: List[PortNodeActivitySchema], 400: MessageSchema},
        auth=auth,
    )
    def get_port_node_activity(self, port: str):
        raw_port = unquote(port).strip()
        if not raw_port:
            return 400, MessageSchema(message="Port identifier is required")

        port_conditions: List[Q] = []

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

        port_filter = port_conditions[0]
        for condition in port_conditions[1:]:
            port_filter |= condition

        sender_query = (
            PacketData.objects.filter(port_filter)
            .values(
                "packet__from_node__node_id",
                "packet__from_node__node_num",
                "packet__from_node__short_name",
                "packet__from_node__long_name",
            )
            .annotate(sent_count=Count("id"), last_sent=Max("time"))
        )

        results: List[PortNodeActivitySchema] = []
        for entry in sender_query:
            node_id = entry.get("packet__from_node__node_id")
            if not node_id:
                continue

            sent_count = entry["sent_count"]
            last_sent = entry["last_sent"]

            results.append(
                PortNodeActivitySchema(
                    node_id=node_id,
                    node_num=entry.get("packet__from_node__node_num"),
                    short_name=entry.get("packet__from_node__short_name"),
                    long_name=entry.get("packet__from_node__long_name"),
                    sent_count=sent_count,
                    received_count=0,
                    total_packets=sent_count,
                    last_sent=last_sent,
                    last_received=None,
                    last_activity=last_sent,
                )
            )

        if not results:
            return 200, []

        def sort_key(entry: PortNodeActivitySchema) -> tuple[int, float]:
            candidate = entry.last_activity or entry.last_sent or entry.last_received
            timestamp = candidate.timestamp() if candidate else 0.0
            return entry.total_packets, timestamp

        results.sort(key=sort_key, reverse=True)

        return 200, results
