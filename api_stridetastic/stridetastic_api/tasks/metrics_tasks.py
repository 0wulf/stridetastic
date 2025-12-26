from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Optional

from celery import shared_task
from django.db.models import Avg

import logging

from django.utils import timezone

from ..models import (
    Node,
    Edge,
    Channel,
    NodeLink,
    NetworkOverviewSnapshot,
    NodeLatencyHistory,
)


logger = logging.getLogger(__name__)

ACTIVE_WINDOW = timedelta(hours=1)


def _to_float(value: Optional[Decimal | float | int]) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


@shared_task(name="stridetastic_api.tasks.metrics_tasks.record_network_overview_snapshot")
def record_network_overview_snapshot() -> bool:
    """Compute aggregate overview metrics and persist a NetworkOverviewSnapshot.

    This duplicates the snapshotting logic used by the overview API so the
    dashboard can be populated on a regular schedule by Celery Beat.
    """
    try:
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

        avg_battery_result = nodes_qs.exclude(battery_level__isnull=True).aggregate(avg=Avg("battery_level"))
        avg_rssi_result = active_edges_qs.exclude(last_rx_rssi__isnull=True).exclude(last_rx_rssi=0).aggregate(avg=Avg("last_rx_rssi"))
        avg_snr_result = active_edges_qs.exclude(last_rx_snr__isnull=True).exclude(last_rx_snr=0).aggregate(avg=Avg("last_rx_snr"))

        avg_battery = _to_float(avg_battery_result.get("avg"))
        avg_rssi = _to_float(avg_rssi_result.get("avg"))
        avg_snr = _to_float(avg_snr_result.get("avg"))

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

        return True
    except Exception:  # pragma: no cover - defensive logging in worker
        logger.exception("Failed to record network overview snapshot")
        return False


@shared_task(name="stridetastic_api.tasks.metrics_tasks.mark_unreachable_nodes")
def mark_unreachable_nodes() -> int:
    """Mark nodes as unreachable if they were last seen before the configured timeout.

    This task looks for nodes where `latency_reachable=True` but `last_seen` is
    older than `REACTIVE_REACHABILITY_TIMEOUT_SECS` and flips the flag. It also
    records a `NodeLatencyHistory` entry for auditing.
    """
    try:
        from django.conf import settings

        timeout_secs = getattr(settings, "REACTIVE_REACHABILITY_TIMEOUT_SECS", 3600)
        cutoff = timezone.now() - timedelta(seconds=int(timeout_secs))

        qs = Node.objects.filter(latency_reachable=True, last_seen__lt=cutoff)
        node_ids = list(qs.values_list("id", flat=True))

        if not node_ids:
            return 0

        updated = qs.update(latency_reachable=False)

        # Record history entries for audit / downstream consumers
        for nid in node_ids:
            try:
                NodeLatencyHistory.objects.create(node_id=nid, reachable=False, responded_at=None)
            except Exception:
                logger.exception("Failed to write NodeLatencyHistory for node %s", nid)

        logger.info("Marked %d node(s) unreachable: %s", updated, node_ids)
        return int(updated)
    except Exception:  # pragma: no cover - defensive
        logger.exception("mark_unreachable_nodes task failed")
        return 0
