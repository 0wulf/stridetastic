from typing import List

from django.db.models import Exists, OuterRef, Q  # type: ignore[import]
from ninja_extra import permissions  # type: ignore[import]
from ninja_extra import api_controller, route
from ninja_jwt.authentication import JWTAuth  # type: ignore[import]

from ..models import NodeLink
from ..models.packet_models import Packet
from ..schemas import MessageSchema, NodeLinkPacketSchema, NodeLinkSchema
from ..utils.link_serialization import serialize_link_packet, serialize_node_link
from ..utils.time_filters import parse_time_window

auth = JWTAuth()


@api_controller("/links", tags=["Links"], permissions=[permissions.IsAuthenticated])
class LinkController:
    @route.get("/", response={200: List[NodeLinkSchema], 400: MessageSchema}, auth=auth)
    def list_links(self, request):
        query_params = request.GET
        last = query_params.get("last")
        since = query_params.get("since")
        until = query_params.get("until")
        search = query_params.get("search")
        node_filter = query_params.get("node")
        bidirectional_param = query_params.get("bidirectional")
        port_filter = query_params.get("port")

        try:
            since_utc, until_utc = parse_time_window(
                last=last, since=since, until=until
            )
        except ValueError as exc:
            return 400, MessageSchema(message=str(exc))

        queryset = (
            NodeLink.objects.select_related(
                "node_a",
                "node_b",
                "last_packet",
                "last_packet__from_node",
                "last_packet__to_node",
                "last_packet__data",
            )
            .prefetch_related("channels", "last_packet__channels")
            .order_by("-last_activity", "-first_seen")
        )

        if since_utc is not None:
            queryset = queryset.filter(last_activity__gte=since_utc)
        if until_utc is not None:
            queryset = queryset.filter(last_activity__lte=until_utc)

        if node_filter:
            queryset = queryset.filter(
                Q(node_a__node_id__iexact=node_filter)
                | Q(node_b__node_id__iexact=node_filter)
            )

        if bidirectional_param is not None:
            normalized = bidirectional_param.lower()
            if normalized in {"true", "1", "yes"}:
                queryset = queryset.filter(is_bidirectional=True)
            elif normalized in {"false", "0", "no"}:
                queryset = queryset.filter(is_bidirectional=False)

        if search:
            queryset = queryset.filter(
                Q(node_a__node_id__icontains=search)
                | Q(node_a__short_name__icontains=search)
                | Q(node_a__long_name__icontains=search)
                | Q(node_b__node_id__icontains=search)
                | Q(node_b__short_name__icontains=search)
                | Q(node_b__long_name__icontains=search)
            )

        if port_filter:
            packets_for_port = Packet.objects.filter(
                Q(from_node=OuterRef("node_a"), to_node=OuterRef("node_b"))
                | Q(from_node=OuterRef("node_b"), to_node=OuterRef("node_a"))
            ).filter(data__port=port_filter)

            if since_utc is not None:
                packets_for_port = packets_for_port.filter(time__gte=since_utc)
            if until_utc is not None:
                packets_for_port = packets_for_port.filter(time__lte=until_utc)

            queryset = queryset.filter(Exists(packets_for_port))

        limit_param = query_params.get("limit")
        offset_param = query_params.get("offset")

        limit = 50
        if limit_param:
            try:
                limit = int(limit_param)
            except ValueError:
                return 400, MessageSchema(message="Invalid limit parameter")
        limit = max(1, min(limit, 200))

        offset = 0
        if offset_param:
            try:
                offset = max(0, int(offset_param))
            except ValueError:
                return 400, MessageSchema(message="Invalid offset parameter")

        links = list(queryset[offset : offset + limit])
        serialized = [serialize_node_link(link) for link in links]
        return 200, serialized

    @route.get(
        "/{link_id}",
        response={200: NodeLinkSchema, 404: MessageSchema},
        auth=auth,
    )
    def get_link(self, link_id: int):
        link = (
            NodeLink.objects.select_related(
                "node_a",
                "node_b",
                "last_packet",
                "last_packet__from_node",
                "last_packet__to_node",
                "last_packet__data",
                "last_packet__data__telemetry_payload",
                "last_packet__data__position_payload",
                "last_packet__data__node_info_payload",
                "last_packet__data__neighbor_info_payload",
                "last_packet__data__route_discovery_payload",
                "last_packet__data__route_discovery_payload__route_towards",
                "last_packet__data__route_discovery_payload__route_back",
                "last_packet__data__routing_payload",
            )
            .prefetch_related(
                "channels",
                "last_packet__channels",
                "last_packet__data__neighbor_info_payload__neighbors",
                "last_packet__data__neighbor_info_payload__neighbors__node",
                "last_packet__data__route_discovery_payload__route_towards__nodes",
                "last_packet__data__route_discovery_payload__route_back__nodes",
            )
            .filter(pk=link_id)
            .first()
        )
        if not link:
            return 404, MessageSchema(message="Link not found")
        return 200, serialize_node_link(link)

    @route.get(
        "/{link_id}/packets",
        response={
            200: List[NodeLinkPacketSchema],
            400: MessageSchema,
            404: MessageSchema,
        },
        auth=auth,
    )
    def get_link_packets(self, request, link_id: int):
        link = (
            NodeLink.objects.select_related("node_a", "node_b")
            .filter(pk=link_id)
            .first()
        )
        if not link:
            return 404, MessageSchema(message="Link not found")

        query_params = request.GET
        last = query_params.get("last")
        since = query_params.get("since")
        until = query_params.get("until")
        order_param = (query_params.get("order") or "asc").lower()
        port_filter = query_params.get("port")

        try:
            since_utc, until_utc = parse_time_window(
                last=last, since=since, until=until
            )
        except ValueError as exc:
            return 400, MessageSchema(message=str(exc))

        limit_param = query_params.get("limit")
        limit = 100
        if limit_param:
            try:
                limit = int(limit_param)
            except ValueError:
                return 400, MessageSchema(message="Invalid limit parameter")
        limit = max(1, min(limit, 300))

        packet_filter = Q(from_node=link.node_a, to_node=link.node_b) | Q(
            from_node=link.node_b, to_node=link.node_a
        )

        order_by = "time" if order_param == "asc" else "-time"

        packets_qs = (
            Packet.objects.filter(packet_filter)
            .select_related(
                "from_node",
                "to_node",
                "data",
                "data__telemetry_payload",
                "data__position_payload",
                "data__node_info_payload",
                "data__neighbor_info_payload",
                "data__route_discovery_payload",
                "data__route_discovery_payload__route_towards",
                "data__route_discovery_payload__route_back",
                "data__routing_payload",
            )
            .prefetch_related("channels")
            .prefetch_related(
                "data__neighbor_info_payload__neighbors",
                "data__neighbor_info_payload__neighbors__node",
                "data__route_discovery_payload__route_towards__nodes",
                "data__route_discovery_payload__route_back__nodes",
            )
            .order_by(order_by)
        )

        if since_utc is not None:
            packets_qs = packets_qs.filter(time__gte=since_utc)
        if until_utc is not None:
            packets_qs = packets_qs.filter(time__lte=until_utc)
        if port_filter:
            packets_qs = packets_qs.filter(data__port=port_filter)

        packets = list(packets_qs[:limit])

        serialized_packets = [serialize_link_packet(packet, link) for packet in packets]

        return 200, serialized_packets
