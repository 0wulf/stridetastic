from django.db import models
from timescale.db.models.models import TimescaleModel


class NetworkOverviewSnapshot(TimescaleModel):
    """Time-series snapshot of high-level network metrics for overview dashboards."""

    time = models.DateTimeField(
        auto_now_add=True, help_text="Timestamp when the snapshot was captured."
    )
    total_nodes = models.PositiveIntegerField(
        help_text="Total nodes known to the system at capture time."
    )
    active_nodes = models.PositiveIntegerField(
        help_text="Nodes seen within the active activity window."
    )
    reachable_nodes = models.PositiveIntegerField(
        help_text="Nodes that responded to the most recent reactive probe cycle.",
        default=0,
    )
    active_connections = models.PositiveIntegerField(
        help_text="Active edges observed at capture time."
    )
    channels = models.PositiveIntegerField(
        help_text="Active channels observed at capture time."
    )
    avg_battery = models.DecimalField(
        max_digits=6,
        decimal_places=3,
        blank=True,
        null=True,
        help_text="Average battery level percentage across reporting nodes.",
    )
    avg_rssi = models.DecimalField(
        max_digits=6,
        decimal_places=3,
        blank=True,
        null=True,
        help_text="Average RSSI value across active edges.",
    )
    avg_snr = models.DecimalField(
        max_digits=6,
        decimal_places=3,
        blank=True,
        null=True,
        help_text="Average SNR value across active edges.",
    )

    class Meta:
        verbose_name = "Network Overview Snapshot"
        verbose_name_plural = "Network Overview Snapshots"
        ordering = ["time"]
