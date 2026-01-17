from datetime import timedelta
from decimal import Decimal
from typing import List, Optional

from django.db.models import Avg
from django.utils import timezone
from ninja_extra import permissions  # type: ignore[import]
from ninja_extra import api_controller, route
from ninja_jwt.authentication import JWTAuth  # type: ignore[import]

from ..models import Channel, Edge, NetworkOverviewSnapshot, Node, NodeLink
from ..schemas import (
    MessageSchema,
    OverviewMetricSnapshotSchema,
    OverviewMetricsResponseSchema,
    OverviewMetricsSchema,
)
from ..utils.time_filters import parse_time_window

auth = JWTAuth()
ACTIVE_WINDOW = timedelta(hours=1)
DEFAULT_HISTORY_LIMIT = 500
DEFAULT_HISTORY_LAST = "7days"


def _to_float(value: Optional[Decimal | float | int]) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _build_snapshot_payload(
    snapshot: NetworkOverviewSnapshot,
) -> OverviewMetricSnapshotSchema:
    return OverviewMetricSnapshotSchema(
        timestamp=snapshot.time,
        total_nodes=snapshot.total_nodes,
        active_nodes=snapshot.active_nodes,
        reachable_nodes=snapshot.reachable_nodes,
        active_connections=snapshot.active_connections,
        channels=snapshot.channels,
        avg_battery=_to_float(snapshot.avg_battery),
        avg_rssi=_to_float(snapshot.avg_rssi),
        avg_snr=_to_float(snapshot.avg_snr),
    )


@api_controller("/metrics", tags=["Metrics"], permissions=[permissions.IsAuthenticated])
class MetricsController:
    @route.get(
        "/overview",
        response={200: OverviewMetricsResponseSchema, 400: MessageSchema},
        auth=auth,
    )
    def get_overview_metrics(
        self,
        request,
        include_history: bool = True,
        history_last: Optional[str] = DEFAULT_HISTORY_LAST,
        history_since: Optional[str] = None,
        history_until: Optional[str] = None,
        history_limit: Optional[int] = None,
        record_snapshot: bool = True,
    ):
        """Return aggregate network overview metrics and optional historical series."""

        now = timezone.now()
        active_threshold = now - ACTIVE_WINDOW

        nodes_qs = Node.objects.all()
        total_nodes = nodes_qs.count()
        active_nodes_qs = nodes_qs.filter(last_seen__gte=active_threshold)
        active_nodes = active_nodes_qs.count()
        reachable_nodes = active_nodes_qs.filter(latency_reachable=True).count()

        edges_qs = Edge.objects.all()
        active_edges_qs = edges_qs.filter(last_seen__gte=active_threshold)

        links_qs = NodeLink.objects.all()
        active_links_qs = links_qs.filter(last_activity__gte=active_threshold)
        active_connections = active_links_qs.count()

        channels_qs = Channel.objects.all()
        channels_count = channels_qs.count()

        avg_battery_result = nodes_qs.exclude(battery_level__isnull=True).aggregate(
            avg=Avg("battery_level")
        )
        avg_rssi_result = (
            active_edges_qs.exclude(last_rx_rssi__isnull=True)
            .exclude(last_rx_rssi=0)
            .aggregate(avg=Avg("last_rx_rssi"))
        )
        avg_snr_result = (
            active_edges_qs.exclude(last_rx_snr__isnull=True)
            .exclude(last_rx_snr=0)
            .aggregate(avg=Avg("last_rx_snr"))
        )

        avg_battery = _to_float(avg_battery_result.get("avg"))
        avg_rssi = _to_float(avg_rssi_result.get("avg"))
        avg_snr = _to_float(avg_snr_result.get("avg"))

        if record_snapshot:
            NetworkOverviewSnapshot.objects.create(
                total_nodes=total_nodes,
                active_nodes=active_nodes,
                reachable_nodes=reachable_nodes,
                active_connections=active_connections,
                channels=channels_count,
                avg_battery=avg_battery,
                avg_rssi=avg_rssi,
                avg_snr=avg_snr,
            )

        history_payload: List[OverviewMetricSnapshotSchema] = []
        if include_history:
            try:
                since_utc, until_utc = parse_time_window(
                    last=history_last,
                    since=history_since,
                    until=history_until,
                )
            except ValueError as exc:
                return 400, MessageSchema(message=str(exc))

            limit = DEFAULT_HISTORY_LIMIT
            if history_limit is not None:
                limit = max(1, min(history_limit, DEFAULT_HISTORY_LIMIT))

            history_qs = NetworkOverviewSnapshot.objects.all().order_by("-time")
            if since_utc is not None:
                history_qs = history_qs.filter(time__gte=since_utc)
            if until_utc is not None:
                history_qs = history_qs.filter(time__lte=until_utc)

            snapshots = list(history_qs[:limit])
            history_payload = [
                _build_snapshot_payload(snapshot) for snapshot in reversed(snapshots)
            ]

        response_payload = OverviewMetricsResponseSchema(
            current=OverviewMetricsSchema(
                total_nodes=total_nodes,
                active_nodes=active_nodes,
                reachable_nodes=reachable_nodes,
                active_connections=active_connections,
                channels=channels_count,
                avg_battery=avg_battery,
                avg_rssi=avg_rssi,
                avg_snr=avg_snr,
            ),
            history=history_payload,
        )

        return 200, response_payload
