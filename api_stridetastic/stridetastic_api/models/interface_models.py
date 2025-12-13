from django.db import models

class Interface(models.Model):
    """
    Represents a communication interface instance (MQTT, SERIAL, etc.).
    Multiple instances per type can exist with their own configuration.
    """
    class Names(models.TextChoices):  # Backwards compatibility (used as type)
        MQTT = "MQTT", "MQTT"
        SERIAL = "SERIAL", "Serial"

    class Status(models.TextChoices):
        INIT = "INIT", "Init"
        CONNECTING = "CONNECTING", "Connecting"
        RUNNING = "RUNNING", "Running"
        ERROR = "ERROR", "Error"
        STOPPED = "STOPPED", "Stopped"

    # Type of interface (original field retained for minimal code changes)
    name = models.CharField(
        max_length=20,
        choices=Names.choices,
        default=Names.MQTT,
        help_text="Type of the interface (MQTT / SERIAL)."
    )

    # Human readable unique name for this specific instance
    display_name = models.CharField(
        max_length=50,
        unique=True,
        help_text="Unique display name for this interface instance."
    )

    # Lifecycle
    is_enabled = models.BooleanField(default=True, help_text="Whether this interface should be started.")
    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.INIT,
        help_text="Current runtime status of this interface instance."
    )
    last_connected = models.DateTimeField(null=True, blank=True, help_text="Last time the interface successfully connected/started.")
    last_error = models.TextField(null=True, blank=True, help_text="Last runtime error message, if any.")

    # Generic config (allows future expansion without schema changes)
    config = models.JSONField(null=True, blank=True, help_text="Arbitrary configuration blob.")

    # MQTT specific configuration
    mqtt_broker_address = models.CharField(max_length=255, null=True, blank=True)
    mqtt_port = models.IntegerField(null=True, blank=True)
    mqtt_topic = models.CharField(max_length=255, null=True, blank=True)
    mqtt_base_topic = models.CharField(max_length=255, null=True, blank=True, help_text="Base publish topic override for this interface.")
    mqtt_username = models.CharField(max_length=255, null=True, blank=True)
    mqtt_password = models.CharField(max_length=255, null=True, blank=True)
    mqtt_tls = models.BooleanField(default=False)
    mqtt_ca_certs = models.CharField(max_length=255, null=True, blank=True)

    # Serial specific configuration
    serial_port = models.CharField(max_length=255, null=True, blank=True)
    serial_baudrate = models.IntegerField(null=True, blank=True)
    serial_node = models.ForeignKey(
        'Node',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text="Node to bind the serial interface to (if applicable)."
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Interface"
        verbose_name_plural = "Interfaces"
        ordering = ["display_name"]

    def __str__(self):
        return f"{self.display_name} ({self.name})"

    def save(self, *args, **kwargs):
        # Auto-populate display_name if empty (first save only)
        if not self.display_name:
            base = self.name.lower()
            similar = Interface.objects.filter(display_name__startswith=base).count()
            self.display_name = f"{base}-{similar+1}" if similar else base
        super().save(*args, **kwargs)