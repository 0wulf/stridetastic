from django.db import models


class Edge(models.Model):
    """
    Represents a connection between two Meshtastic nodes.
    """

    source_node = models.ForeignKey(
        "Node",
        related_name="source_edges",
        on_delete=models.CASCADE,
        help_text="Source node of the edge.",
    )
    target_node = models.ForeignKey(
        "Node",
        related_name="target_edges",
        on_delete=models.CASCADE,
        help_text="Target node of the edge.",
    )
    interfaces = models.ManyToManyField(
        "Interface",
        related_name="edges",
        help_text="Interfaces through which this edge is observed.",
    )

    first_seen = models.DateTimeField(
        auto_now_add=True, help_text="Timestamp when the edge was first seen."
    )
    last_seen = models.DateTimeField(
        auto_now=True, help_text="Timestamp when the edge was last seen."
    )
    last_packet = models.ForeignKey(
        "Packet",
        related_name="last_packet_edge",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        help_text="Last packet associated with this edge.",
    )
    last_rx_rssi = models.IntegerField(
        blank=True, null=True, help_text="Last received RSSI for the edge."
    )
    last_rx_snr = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        blank=True,
        null=True,
        help_text="Last received SNR for the edge.",
    )
    last_hops = models.IntegerField(
        default=0, help_text="Last number of hops for the edge."
    )

    class Meta:
        unique_together = ("source_node", "target_node")
