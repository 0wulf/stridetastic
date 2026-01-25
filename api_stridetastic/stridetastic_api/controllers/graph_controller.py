# Graph Controller
# 1. GET all edges

from typing import List

from ninja_extra import permissions  # type: ignore[import]
from ninja_extra import api_controller, route
from ninja_jwt.authentication import JWTAuth  # type: ignore[import]

from ..models.graph_models import Edge
from ..schemas import EdgeSchema, MessageSchema
from ..utils.time_filters import parse_time_window

auth = JWTAuth()


@api_controller("/graph", tags=["Graph"], permissions=[permissions.IsAuthenticated])
class GraphController:
    @route.get(
        "/edges",
        response={200: List[EdgeSchema], 404: MessageSchema, 400: MessageSchema},
        auth=auth,
    )
    def get_all_edges(
        self,
        request,
    ):
        """
        Get a list of all edges in the graph.

        This one is relatively slow, is it because of the interfaces?

        Here we should do all the filtering logic, not in the frontend
        """
        # Parse time window if provided
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

        # Queryset with optional time filter and perf optimizations
        edges_qs = Edge.objects.select_related(
            "source_node", "target_node", "last_packet"
        ).prefetch_related("interfaces")
        if since_utc is not None:
            edges_qs = edges_qs.filter(last_seen__gte=since_utc)
        if until_utc is not None:
            edges_qs = edges_qs.filter(last_seen__lte=until_utc)

        edges = list(edges_qs)
        if not edges:
            return 404, MessageSchema(message="No edges found")
        return 200, [
            EdgeSchema(
                source_node_id=edge.source_node.id,
                target_node_id=edge.target_node.id,
                first_seen=edge.first_seen,
                last_seen=edge.last_seen,
                last_packet_id=edge.last_packet.packet_id if edge.last_packet else None,
                last_rx_rssi=edge.last_rx_rssi,
                last_rx_snr=edge.last_rx_snr,
                last_hops=edge.last_hops,
                interfaces_names=[iface.name for iface in edge.interfaces.all()],
            )
            for edge in edges
        ]
