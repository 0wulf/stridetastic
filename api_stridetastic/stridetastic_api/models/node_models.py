from typing import Optional

from django.db import models
from django.utils import timezone
from timescale.db.models.models import TimescaleModel

from ..utils.public_key_entropy import is_low_entropy_public_key


class Node(models.Model):
    """
    Represents a Meshtastic node.
    """
    node_num = models.BigIntegerField(unique=True, help_text="Unique number assigned to the node (0-x).")
    node_id = models.CharField(max_length=10, unique=True, help_text="Unique identifier for the node.")
    mac_address = models.CharField(max_length=18, unique=True, help_text="MAC address of the node.")

    # Last Node Info
    short_name = models.CharField(max_length=4, help_text="Short name of the node.", blank=True, null=True)
    long_name = models.CharField(max_length=32, help_text="Long name of the node.", blank=True, null=True)
    hw_model = models.CharField(max_length=32, help_text="Hardware model of the node.", blank=True, null=True)
    is_licensed = models.BooleanField(default=False, help_text="Indicates if the node is set as licensed operator.")
    role = models.CharField(max_length=32, default="CLIENT", help_text="Role of the node in the network (e.g., 'router', 'client').", blank=True, null=True)
    public_key = models.CharField(max_length=64, help_text="Public key of the node for encryption.", blank=True, null=True)
    is_low_entropy_public_key = models.BooleanField(
        default=False,
        help_text="Indicates whether the stored public key matches a known low-entropy hash.",
    )
    private_key = models.TextField(blank=True, null=True, help_text="PEM encoded private key for decrypting PKI messages. Should be stored encrypted at rest once support is added.")
    private_key_fingerprint = models.CharField(max_length=128, blank=True, null=True, help_text="Fingerprint of the stored private key for quick identification.")
    private_key_updated_at = models.DateTimeField(blank=True, null=True, help_text="Timestamp when the private key was last updated.")
    is_unmessagable = models.BooleanField(default=False, help_text="Indicates if the node is set as unmessagable.")
    is_virtual = models.BooleanField(default=False, help_text="Indicates if the node is managed as a virtual node.")

    # Last Position
    latitude = models.DecimalField(max_digits=10, decimal_places=7, help_text="Latitude of the node's position.", blank=True, null=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, help_text="Longitude of the node's position.", blank=True, null=True)
    altitude = models.DecimalField(max_digits=10, decimal_places=2, help_text="Altitude of the node's position in meters.", blank=True, null=True)
    position_accuracy = models.DecimalField(max_digits=10, decimal_places=2, help_text="Accuracy of the position data.", blank=True, null=True)
    location_source = models.CharField(
        max_length=32,
        blank=True,
        null=True,
        help_text="Source reported for the most recent position fix.",
    )

    # Last Device Telemetry
    battery_level = models.IntegerField(blank=True, null=True, help_text="Battery level of the device in percentage.")
    voltage = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, help_text="Voltage of the device in volts.")
    channel_utilization = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, help_text="Channel utilization of the device in percentage.")
    air_util_tx = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, help_text="Air utilization for transmission of the device in percentage.")
    uptime_seconds = models.IntegerField(blank=True, null=True, help_text="Uptime of the device in seconds.")
    
    # Last Environment Telemetry
    temperature = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, help_text="Temperature in degrees Celsius.")
    relative_humidity = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, help_text="Relative humidity in percentage.")
    barometric_pressure = models.DecimalField(max_digits=7, decimal_places=2, blank=True, null=True, help_text="Barometric pressure in hPa.")
    gas_resistance = models.DecimalField(max_digits=7, decimal_places=2, blank=True, null=True, help_text="Gas resistance in ohms.")
    iaq = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, help_text="Indoor Air Quality (IAQ) index.")

    # Reactive traceroute metrics
    latency_reachable = models.BooleanField(
        blank=True,
        null=True,
        help_text="Indicates whether the most recent latency probe received a response.",
    )
    latency_ms = models.PositiveIntegerField(
        blank=True,
        null=True,
        help_text="Round-trip latency in milliseconds observed for the most recent probe response.",
    )

    interfaces = models.ManyToManyField(
        'stridetastic_api.Interface',
        related_name='nodes_listened',
        blank=True,
        help_text="Interfaces where this node has been listened to."
    )

    # Edges ?


    first_seen = models.DateTimeField(auto_now_add=True, help_text="Timestamp when the node was first seen.")
    last_seen = models.DateTimeField(auto_now=True, help_text="Timestamp when the node was last seen.")


    class Meta:
        verbose_name = "Node"
        verbose_name_plural = "Nodes"
        ordering = ['last_seen', 'first_seen']

    def __str__(self):
        return self.node_id
    
    def update_last_seen(self):
        self.last_seen = timezone.now()
        self.save()

    @property
    def has_private_key(self) -> bool:
        return bool(self.private_key)

    def store_private_key(self, key_material: str, fingerprint: Optional[str] = None) -> None:
        self.private_key = key_material
        if fingerprint:
            self.private_key_fingerprint = fingerprint
        self.private_key_updated_at = timezone.now()
        self.save(update_fields=[
            "private_key",
            "private_key_fingerprint",
            "private_key_updated_at",
        ])

    def save(self, *args, **kwargs):
        desired_flag = is_low_entropy_public_key(self.public_key)
        if desired_flag != self.is_low_entropy_public_key:
            self.is_low_entropy_public_key = desired_flag
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                mutable_fields = set(update_fields)
                mutable_fields.add("is_low_entropy_public_key")
                kwargs["update_fields"] = mutable_fields
        super().save(*args, **kwargs)
    
    # def get_status(self):
        

class NodeLatencyHistory(TimescaleModel):
    """Historical records of latency probe outcomes for nodes."""

    time = models.DateTimeField(auto_now_add=True, help_text="Timestamp when the probe result was recorded.")
    node = models.ForeignKey(
        Node,
        on_delete=models.CASCADE,
        related_name="latency_history",
        help_text="Node associated with the probe result.",
    )
    probe_message_id = models.BigIntegerField(
        blank=True,
        null=True,
        help_text="Mesh packet identifier associated with this probe when available.",
    )
    reachable = models.BooleanField(
        blank=True,
        null=True,
        help_text="Whether the probe determined the node to be reachable.",
    )
    latency_ms = models.PositiveIntegerField(
        blank=True,
        null=True,
        help_text="Round-trip latency measurement in milliseconds when available.",
    )
    responded_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Timestamp when a response was received for this probe.",
    )

    class Meta:
        verbose_name = "Node Latency History"
        verbose_name_plural = "Node Latency History"
        ordering = ["time"]
