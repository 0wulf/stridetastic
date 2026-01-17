import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class CaptureSession(models.Model):
    class Status(models.TextChoices):
        RUNNING = "RUNNING", "Running"
        COMPLETED = "COMPLETED", "Completed"
        ERROR = "ERROR", "Error"
        CANCELLED = "CANCELLED", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(
        max_length=128, help_text="Human readable capture session name."
    )
    filename = models.CharField(
        max_length=255, help_text="Name of the generated PCAP file."
    )
    file_path = models.CharField(
        max_length=512, help_text="Relative path where the PCAP is stored."
    )
    file_size = models.BigIntegerField(
        default=0, help_text="Size of the capture file in bytes."
    )
    packet_count = models.PositiveIntegerField(
        default=0, help_text="Number of packets written to the capture."
    )
    byte_count = models.PositiveBigIntegerField(
        default=0, help_text="Number of payload bytes written to the capture."
    )

    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.RUNNING
    )
    source_type = models.CharField(
        max_length=32,
        default="mqtt",
        help_text="Source type of the capture (mqtt, serial, etc).",
    )

    interface = models.ForeignKey(
        "stridetastic_api.Interface",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="capture_sessions",
        help_text="Optional interface that originated the capture data.",
    )
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="capture_sessions",
        help_text="User that initiated the capture session.",
    )

    started_at = models.DateTimeField(
        default=timezone.now, help_text="Timestamp when the capture started."
    )
    ended_at = models.DateTimeField(
        null=True, blank=True, help_text="Timestamp when the capture ended."
    )
    last_packet_at = models.DateTimeField(
        null=True, blank=True, help_text="Timestamp of the most recent packet written."
    )

    notes = models.JSONField(
        null=True, blank=True, help_text="Optional metadata about the capture session."
    )

    class Meta:
        verbose_name = "Capture Session"
        verbose_name_plural = "Capture Sessions"
        ordering = ["-started_at"]

    def mark_completed(self, file_size: int | None = None):
        self.status = self.Status.COMPLETED
        self.ended_at = timezone.now()
        if file_size is not None:
            self.file_size = file_size
        self.save(update_fields=["status", "ended_at", "file_size"])

    def mark_error(self, message: str | None = None):
        self.status = self.Status.ERROR
        self.ended_at = timezone.now()
        notes = self.notes or {}
        if message:
            notes["error"] = message
            self.notes = notes
        self.save(update_fields=["status", "ended_at", "notes"])

    def is_active(self) -> bool:
        return self.status == self.Status.RUNNING
