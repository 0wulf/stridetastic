from __future__ import annotations

from typing import Optional

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from timescale.db.models.models import TimescaleModel

from .interface_models import Interface
from .node_models import Node


class KeepaliveConfig(models.Model):
    """Singleton configuration for offline keepalive monitoring."""

    MIN_CHECK_INTERVAL_SECONDS = 30
    MIN_OFFLINE_AFTER_SECONDS = 60

    class Scope(models.TextChoices):
        ALL = "all", "All nodes"
        SELECTED = "selected", "Selected nodes"
        VIRTUAL_ONLY = "virtual_only", "Virtual nodes only"

    class PayloadTypes(models.TextChoices):
        REACHABILITY = "reachability", "Reachability probe"
        TRACEROUTE = "traceroute", "Traceroute solicitation"

    singleton_enforcer = models.BooleanField(default=True, unique=True, editable=False)

    enabled = models.BooleanField(default=False)
    payload_type = models.CharField(
        max_length=16,
        choices=PayloadTypes.choices,
        default=PayloadTypes.REACHABILITY,
    )
    from_node = models.CharField(max_length=32, blank=True, default="")
    channel_name = models.CharField(max_length=64, blank=True, default="")
    channel_key = models.TextField(blank=True, default="")
    gateway_node = models.CharField(max_length=32, blank=True, default="")
    hop_limit = models.PositiveSmallIntegerField(default=3)
    hop_start = models.PositiveSmallIntegerField(default=3)
    interface = models.ForeignKey(
        Interface,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="keepalive_configs",
    )
    offline_after_seconds = models.PositiveIntegerField(
        default=3600,
        help_text="Seconds of inactivity before a node is considered offline.",
    )
    check_interval_seconds = models.PositiveIntegerField(
        default=60, help_text="How often the keepalive check should run."
    )
    scope = models.CharField(max_length=16, choices=Scope.choices, default=Scope.ALL)
    selected_nodes = models.ManyToManyField(
        Node,
        blank=True,
        related_name="keepalive_selected_configs",
        help_text="When scope=selected, only these nodes are monitored.",
    )

    last_run_at = models.DateTimeField(blank=True, null=True)
    last_error_message = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Keepalive Configuration"
        verbose_name_plural = "Keepalive Configuration"

    def __str__(self) -> str:  # pragma: no cover - repr convenience
        return "Keepalive Configuration"

    @classmethod
    def get_solo(cls) -> "KeepaliveConfig":
        obj, _ = cls.objects.get_or_create(pk=1, defaults={})
        return obj

    def clean(self) -> None:  # pragma: no cover - called indirectly in tests
        super().clean()
        errors = {}
        if self.offline_after_seconds < self.MIN_OFFLINE_AFTER_SECONDS:
            errors["offline_after_seconds"] = (
                f"Offline threshold must be at least {self.MIN_OFFLINE_AFTER_SECONDS} seconds."
            )
        if self.check_interval_seconds < self.MIN_CHECK_INTERVAL_SECONDS:
            errors["check_interval_seconds"] = (
                f"Check interval must be at least {self.MIN_CHECK_INTERVAL_SECONDS} seconds."
            )
        if self.enabled:
            if not self.from_node:
                errors["from_node"] = (
                    "Source node is required when keepalive is enabled."
                )
            if not self.channel_name:
                errors["channel_name"] = (
                    "Channel name is required when keepalive is enabled."
                )
            if self.interface and self.interface.name != Interface.Names.MQTT:
                errors["interface"] = (
                    "Only MQTT interfaces are supported for keepalive publishing."
                )
        if errors:
            raise ValidationError(errors)


class NodePresenceHistory(TimescaleModel):
    """Records when nodes transition from online to offline."""

    time = models.DateTimeField(
        auto_now_add=True, help_text="Timestamp when the transition was recorded."
    )
    node = models.ForeignKey(
        Node,
        on_delete=models.CASCADE,
        related_name="presence_history",
        help_text="Node associated with this offline transition.",
    )
    last_seen = models.DateTimeField(help_text="Node last_seen value at transition.")
    offline_at = models.DateTimeField(
        help_text="Timestamp when node crossed offline threshold."
    )
    reason = models.CharField(
        max_length=64, default="offline_threshold", help_text="Transition reason."
    )

    class Meta:
        verbose_name = "Node Presence History"
        verbose_name_plural = "Node Presence History"
        ordering = ["-time"]

    @property
    def elapsed_seconds(self) -> Optional[int]:
        if not self.offline_at:
            return None
        return int((timezone.now() - self.offline_at).total_seconds())
