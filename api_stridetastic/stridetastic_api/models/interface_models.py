from django.db import models


class Interface(models.Model):
    """
    Represents a communication interface instance (MQTT, SERIAL, TCP, etc.).
    Multiple instances per type can exist with their own configuration.
    """

    class Types(models.TextChoices):
        MQTT = "MQTT", "MQTT"
        SERIAL = "SERIAL", "Serial"
        TCP = "TCP", "TCP (Network)"

    class Status(models.TextChoices):
        INIT = "INIT", "Init"
        CONNECTING = "CONNECTING", "Connecting"
        RUNNING = "RUNNING", "Running"
        ERROR = "ERROR", "Error"
        STOPPED = "STOPPED", "Stopped"

    # Type of interface (MQTT, SERIAL, TCP)
    interface_type = models.CharField(
        max_length=20,
        choices=Types.choices,
        default=Types.MQTT,
        help_text="Type of the interface (MQTT / SERIAL / TCP).",
    )

    # Human readable unique name for this specific instance
    name = models.CharField(
        max_length=50,
        unique=True,
        help_text="Unique name for this interface instance.",
    )

    # Lifecycle
    is_enabled = models.BooleanField(
        default=True, help_text="Whether this interface should be started."
    )
    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.INIT,
        help_text="Current runtime status of this interface instance.",
    )
    last_connected = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time the interface successfully connected/started.",
    )
    last_error = models.TextField(
        null=True, blank=True, help_text="Last runtime error message, if any."
    )

    # Generic config (allows future expansion without schema changes)
    config = models.JSONField(
        null=True, blank=True, help_text="Arbitrary configuration blob."
    )

    # MQTT specific configuration
    mqtt_broker_address = models.CharField(max_length=255, null=True, blank=True)
    mqtt_port = models.IntegerField(null=True, blank=True)
    mqtt_topic = models.CharField(max_length=255, null=True, blank=True)
    mqtt_base_topic = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Base publish topic override for this interface.",
    )
    mqtt_username = models.CharField(max_length=255, null=True, blank=True)
    mqtt_password = models.CharField(max_length=255, null=True, blank=True)
    mqtt_tls = models.BooleanField(default=False)
    mqtt_ca_certs = models.CharField(max_length=255, null=True, blank=True)

    # Serial specific configuration
    serial_port = models.CharField(max_length=255, null=True, blank=True)
    serial_baudrate = models.IntegerField(null=True, blank=True)
    serial_node = models.ForeignKey(
        "Node",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text="Node to bind the serial interface to (if applicable).",
    )

    # TCP specific configuration (for network-connected nodes)
    tcp_hostname = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="IP address or hostname of the Meshtastic node.",
    )
    tcp_port = models.IntegerField(
        null=True,
        blank=True,
        default=4403,
        help_text="TCP port for the Meshtastic node (default 4403).",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Interface"
        verbose_name_plural = "Interfaces"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.interface_type})"

    def save(self, *args, **kwargs):
        # Auto-populate name if empty (first save only)
        if not self.name:
            base = self.interface_type.lower()
            similar = Interface.objects.filter(name__startswith=base).count()
            self.name = f"{base}-{similar+1}" if similar else base
        super().save(*args, **kwargs)
