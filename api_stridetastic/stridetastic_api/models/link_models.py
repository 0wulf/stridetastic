from __future__ import annotations

from typing import Optional, Tuple

from django.db import models
from django.db.models import F, Value
from django.utils import timezone


class NodeLinkQuerySet(models.QuerySet):
    def with_totals(self) -> "NodeLinkQuerySet":
        return self.annotate(
            total_packets=models.F("node_a_to_node_b_packets") + models.F("node_b_to_node_a_packets")
        )


class NodeLinkManager(models.Manager):
    def get_queryset(self) -> NodeLinkQuerySet:  # type: ignore[override]
        return NodeLinkQuerySet(self.model, using=self._db)

    @staticmethod
    def _normalize_nodes(
        from_node: "Node",
        to_node: "Node",
    ) -> Tuple["Node", "Node", str]:
        """Determine canonical ordering for logical links."""

        def sort_key(node: "Node") -> Tuple[int, int | str, int]:
            node_num = getattr(node, "node_num", None)
            if node_num is not None:
                try:
                    return (0, int(node_num), node.pk or 0)
                except (TypeError, ValueError):
                    pass

            node_id = getattr(node, "node_id", None)
            if node_id:
                return (1, node_id, node.pk or 0)

            return (2, 0, node.pk or 0)

        from_key = sort_key(from_node)
        to_key = sort_key(to_node)

        if from_key <= to_key:
            return from_node, to_node, "node_a_to_node_b"
        return to_node, from_node, "node_b_to_node_a"

    def record_activity(
        self,
        *,
        from_node: "Node",
        to_node: "Node",
        packet: "Packet",
        channel: Optional["Channel"] = None,
    ) -> Optional["NodeLink"]:
        if from_node.pk == to_node.pk:
            return None

        node_a, node_b, direction = self._normalize_nodes(from_node, to_node)

        link, _ = self.get_or_create(
            node_a=node_a,
            node_b=node_b,
        )

        packet_time = getattr(packet, "time", None) or timezone.now()

        update_kwargs: dict[str, object] = {
            "last_activity": packet_time,
            "last_packet": packet,
        }

        increment = Value(1)
        if direction == "node_a_to_node_b":
            update_kwargs["node_a_to_node_b_packets"] = F("node_a_to_node_b_packets") + increment
        else:
            update_kwargs["node_b_to_node_a_packets"] = F("node_b_to_node_a_packets") + increment

        self.filter(pk=link.pk).update(**update_kwargs)

        if channel is not None:
            link.channels.add(channel)

        link.refresh_from_db(
            fields=[
                "node_a_to_node_b_packets",
                "node_b_to_node_a_packets",
                "is_bidirectional",
                "last_activity",
                "last_packet",
            ]
        )

        if (
            not link.is_bidirectional
            and link.node_a_to_node_b_packets > 0
            and link.node_b_to_node_a_packets > 0
        ):
            self.filter(pk=link.pk).update(is_bidirectional=True)
            link.is_bidirectional = True

        return link


class NodeLink(models.Model):
    node_a = models.ForeignKey(
        "Node",
        related_name="links_as_node_a",
        on_delete=models.CASCADE,
        help_text="Canonical first node of the logical link.",
    )
    node_b = models.ForeignKey(
        "Node",
        related_name="links_as_node_b",
        on_delete=models.CASCADE,
        help_text="Canonical second node of the logical link.",
    )
    node_a_to_node_b_packets = models.PositiveIntegerField(
        default=0,
        help_text="Packets observed flowing from node_a toward node_b.",
    )
    node_b_to_node_a_packets = models.PositiveIntegerField(
        default=0,
        help_text="Packets observed flowing from node_b toward node_a.",
    )
    is_bidirectional = models.BooleanField(
        default=False,
        help_text="True once packets have been seen in both directions.",
    )
    first_seen = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when this logical link was first observed.",
    )
    last_activity = models.DateTimeField(
        default=timezone.now,
        help_text="Timestamp when communication was most recently observed on this link.",
    )
    last_packet = models.ForeignKey(
        "Packet",
        related_name="logical_links",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        help_text="Most recent packet associated with this link.",
    )
    channels = models.ManyToManyField(
        "Channel",
        related_name="logical_links",
        blank=True,
        help_text="Channels that have carried traffic for this logical link.",
    )

    objects: NodeLinkManager = NodeLinkManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("node_a", "node_b"),
                name="unique_logical_link_pair",
            )
        ]
        ordering = ["-last_activity", "-first_seen"]
        indexes = [
            models.Index(fields=("last_activity",)),
            models.Index(fields=("is_bidirectional",)),
        ]

    def __str__(self) -> str:
        return f"{self.node_a.node_id} ↔ {self.node_b.node_id}"

    @property
    def total_packets(self) -> int:
        return self.node_a_to_node_b_packets + self.node_b_to_node_a_packets


from .node_models import Node  # noqa: E402  # circular import guard
from .packet_models import Packet  # noqa: E402
from .channel_models import Channel  # noqa: E402

__all__ = ["NodeLink", "NodeLinkManager", "NodeLinkQuerySet"]
