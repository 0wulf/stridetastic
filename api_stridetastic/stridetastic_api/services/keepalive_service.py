from __future__ import annotations

import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from ..models import KeepaliveConfig, Node, NodePresenceHistory

logger = logging.getLogger(__name__)


class KeepaliveService:
    """Service that detects nodes transitioning from online to offline."""

    def __init__(self) -> None:
        self._config = None

    def load_config(self) -> KeepaliveConfig:
        self._config = KeepaliveConfig.get_solo()
        return self._config

    def _scoped_nodes(self, config: KeepaliveConfig) -> QuerySet[Node]:
        qs = Node.objects.all()
        if config.scope == KeepaliveConfig.Scope.VIRTUAL_ONLY:
            return qs.filter(is_virtual=True)
        if config.scope == KeepaliveConfig.Scope.SELECTED:
            selected_ids = list(config.selected_nodes.values_list("id", flat=True))
            if not selected_ids:
                return qs.none()
            return qs.filter(id__in=selected_ids)
        return qs

    def run_check(self) -> int:
        """Evaluate nodes that just transitioned to offline. Returns count."""
        now = timezone.now()

        with transaction.atomic():
            config = KeepaliveConfig.objects.select_for_update().filter(pk=1).first()
            if not config:
                config = KeepaliveConfig.get_solo()

            if not config.enabled:
                return 0

            if config.payload_type not in (
                KeepaliveConfig.PayloadTypes.REACHABILITY,
                KeepaliveConfig.PayloadTypes.TRACEROUTE,
            ):
                config.last_run_at = now
                config.last_error_message = "Invalid keepalive payload type"
                config.save(update_fields=["last_run_at", "last_error_message"])  # type: ignore[arg-type]
                return 0

            if not config.from_node or not config.channel_name:
                config.last_run_at = now
                config.last_error_message = (
                    "Keepalive publish configuration is incomplete"
                )
                config.save(update_fields=["last_run_at", "last_error_message"])  # type: ignore[arg-type]
                return 0

            offline_after = max(
                int(config.offline_after_seconds),
                KeepaliveConfig.MIN_OFFLINE_AFTER_SECONDS,
            )
            check_interval = max(
                int(config.check_interval_seconds),
                KeepaliveConfig.MIN_CHECK_INTERVAL_SECONDS,
            )

            if config.last_run_at is not None:
                elapsed = (now - config.last_run_at).total_seconds()
                if elapsed < check_interval:
                    return 0

            last_run_at = config.last_run_at or (
                now - timedelta(seconds=check_interval)
            )
            previous_cutoff = last_run_at - timedelta(seconds=offline_after)
            current_cutoff = now - timedelta(seconds=offline_after)

            if current_cutoff <= previous_cutoff:
                config.last_run_at = now
                config.last_error_message = ""
                config.save(update_fields=["last_run_at", "last_error_message"])  # type: ignore[arg-type]
                return 0

            node_qs = self._scoped_nodes(config)
            transitioned = list(
                node_qs.filter(
                    last_seen__lte=current_cutoff, last_seen__gt=previous_cutoff
                )
            )

            events = [
                NodePresenceHistory(
                    node=node,
                    last_seen=node.last_seen,
                    offline_at=current_cutoff,
                    reason="offline_threshold",
                )
                for node in transitioned
            ]

            if events:
                NodePresenceHistory.objects.bulk_create(events, batch_size=500)

            if transitioned:
                try:
                    from ..services.service_manager import ServiceManager

                    service_manager = ServiceManager.get_instance()
                    publisher_service = service_manager.initialize_publisher_service()

                    publisher = None
                    base_topic = None
                    if config.interface:
                        publisher, base_topic, err = (
                            service_manager.resolve_publish_context(config.interface.id)
                        )
                        if err:
                            config.last_run_at = now
                            config.last_error_message = err
                            config.save(update_fields=["last_run_at", "last_error_message"])  # type: ignore[arg-type]
                            return 0

                    for node in transitioned:
                        if (
                            config.payload_type
                            == KeepaliveConfig.PayloadTypes.TRACEROUTE
                        ):
                            publisher_service.publish_traceroute(
                                from_node=config.from_node,
                                to_node=node.node_id,
                                channel_name=config.channel_name,
                                channel_aes_key=config.channel_key,
                                hop_limit=config.hop_limit,
                                hop_start=config.hop_start,
                                want_ack=True,
                                gateway_node=config.gateway_node or None,
                                publisher=publisher,
                                base_topic=base_topic,
                                record_pending=True,
                                priority="ACK",
                            )
                        else:
                            publisher_service.publish_reachability_probe(
                                from_node=config.from_node,
                                to_node=node.node_id,
                                channel_name=config.channel_name,
                                channel_aes_key=config.channel_key,
                                hop_limit=config.hop_limit,
                                hop_start=config.hop_start,
                                gateway_node=config.gateway_node or None,
                                publisher=publisher,
                                base_topic=base_topic,
                                priority="ACK",
                            )
                except Exception as exc:
                    logger.exception("Keepalive publishing failed")
                    config.last_run_at = now
                    config.last_error_message = str(exc)
                    config.save(update_fields=["last_run_at", "last_error_message"])  # type: ignore[arg-type]
                    return len(transitioned)

            config.last_run_at = now
            config.last_error_message = ""
            config.save(update_fields=["last_run_at", "last_error_message"])  # type: ignore[arg-type]

        if transitioned:
            logger.info(
                "Keepalive recorded %d offline transition(s)", len(transitioned)
            )
        return len(transitioned)
