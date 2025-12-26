from __future__ import annotations

from datetime import timedelta, datetime
from typing import Optional

from django.db import models
from django.contrib.postgres.fields import ArrayField
from django.core.exceptions import ValidationError
from django.utils import timezone

from .interface_models import Interface


class PublishErserviceConfig(models.Model):
    """Singleton configuration for the reactive publishing service."""

    singleton_enforcer = models.BooleanField(default=True, unique=True, editable=False)

    enabled = models.BooleanField(default=False)

    # Publishing parameters mirror traceroute solicitation inputs
    from_node = models.CharField(max_length=32, blank=True, default="")
    gateway_node = models.CharField(max_length=32, blank=True, default="")
    channel_key = models.TextField(blank=True, default="")

    hop_limit = models.IntegerField(default=3)
    hop_start = models.IntegerField(default=3)
    want_ack = models.BooleanField(default=False)

    listen_interfaces = models.ManyToManyField(
        Interface,
        blank=True,
        related_name="reactive_listener_configs",
        help_text="Interfaces that should trigger reactive traceroutes. Leave empty to listen on all.",
    )

    max_tries = models.IntegerField(default=3)
    trigger_ports = ArrayField(
        models.CharField(max_length=64),
        default=list,
        blank=True,
        help_text="Allowed Meshtastic port names that should trigger reactive traceroute injection.",
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Reactive Publisher Service Configuration"

    def __str__(self) -> str:  # pragma: no cover - repr convenience
        return "Reactive Publisher Service Configuration"

    @classmethod
    def get_solo(cls) -> "PublishErserviceConfig":
        obj, _ = cls.objects.get_or_create(pk=1, defaults={})
        return obj


# New preferred alias; keep compatibility with legacy PublishErservice naming
PublisherReactiveConfig = PublishErserviceConfig


class PublisherPeriodicJob(models.Model):
    """Definition of a periodic publishing job that injects payloads into the mesh."""

    MIN_PERIOD_SECONDS = 30

    class PayloadTypes(models.TextChoices):
        TEXT = "text", "Text Message"
        POSITION = "position", "Position"
        NODEINFO = "nodeinfo", "Node Info"
        TRACEROUTE = "traceroute", "Traceroute"
        TELEMETRY = "telemetry", "Telemetry"

    class RunStatus(models.TextChoices):
        IDLE = "idle", "Idle"
        SUCCESS = "success", "Success"
        ERROR = "error", "Error"
        SKIPPED = "skipped", "Skipped"

    name = models.CharField(max_length=128)
    description = models.TextField(blank=True, default="")
    enabled = models.BooleanField(default=True)
    payload_type = models.CharField(max_length=32, choices=PayloadTypes.choices)

    from_node = models.CharField(max_length=32)
    to_node = models.CharField(max_length=32)
    channel_name = models.CharField(max_length=64)
    channel_key = models.TextField(blank=True, default="")
    gateway_node = models.CharField(max_length=32, blank=True, default="")

    hop_limit = models.PositiveSmallIntegerField(default=3)
    hop_start = models.PositiveSmallIntegerField(default=3)
    want_ack = models.BooleanField(default=False)
    pki_encrypted = models.BooleanField(default=False)

    interface = models.ForeignKey(
        Interface,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="periodic_publisher_jobs",
    )

    payload_options = models.JSONField(default=dict, blank=True)
    period_seconds = models.PositiveIntegerField(default=300, help_text="Execution period in seconds.")

    next_run_at = models.DateTimeField(default=timezone.now)
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_status = models.CharField(max_length=16, choices=RunStatus.choices, default=RunStatus.IDLE)
    last_error_message = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)
        indexes = [
            models.Index(fields=("enabled", "next_run_at"), name="periodic_publish_due_idx"),
        ]
        verbose_name = "Periodic Publisher Job"
        verbose_name_plural = "Periodic Publisher Jobs"

    def __str__(self) -> str:  # pragma: no cover - repr convenience
        return f"Periodic publish '{self.name}' ({self.get_payload_type_display()})"

    def clean(self):  # pragma: no cover - called indirectly in tests
        super().clean()

        errors = {}

        if not self.from_node:
            errors["from_node"] = "Source node is required."
        if not self.to_node:
            errors["to_node"] = "Target node is required."
        if not self.channel_name:
            errors["channel_name"] = "Channel name is required."

        if self.period_seconds < self.MIN_PERIOD_SECONDS:
            errors["period_seconds"] = f"Period must be at least {self.MIN_PERIOD_SECONDS} seconds."

        # Allow PKI encryption for text, position and telemetry periodic payloads
        if self.pki_encrypted and self.payload_type not in (
            self.PayloadTypes.TEXT,
            self.PayloadTypes.POSITION,
            self.PayloadTypes.TELEMETRY,
        ):
            errors["pki_encrypted"] = "PKI encryption is only supported for text, position, and telemetry payloads."

        if self.interface and self.interface.name != Interface.Names.MQTT:
            errors["interface"] = "Periodic publishing is only supported on MQTT interfaces."

        payload_errors = self._validate_payload_options()
        if payload_errors:
            errors["payload_options"] = payload_errors

        if errors:
            raise ValidationError(errors)

    def _validate_payload_options(self) -> dict:
        options = self.payload_options or {}
        errors: dict[str, str] = {}

        if self.payload_type == self.PayloadTypes.TEXT:
            message_text = options.get("message_text")
            if not message_text:
                errors["message_text"] = "Message text is required for text payloads."
        elif self.payload_type == self.PayloadTypes.POSITION:
            for field in ("lat", "lon"):
                value = options.get(field)
                if value is None:
                    errors[field] = "This field is required for position payloads."
            # Optional: allow requesting a response in periodic position payloads
            # (handled by PublisherService.publish_position)
            if "want_response" in options and not isinstance(options.get("want_response"), (bool, int)):
                errors["want_response"] = "want_response must be a boolean for position payloads."
        elif self.payload_type == self.PayloadTypes.NODEINFO:
            for field in ("short_name", "long_name", "hw_model", "public_key"):
                value = options.get(field)
                if value in (None, ""):
                    errors[field] = "This field is required for nodeinfo payloads."
        elif self.payload_type == self.PayloadTypes.TELEMETRY:
            # telemetry payload expects telemetry_type and telemetry_options
            telemetry_type = options.get("telemetry_type")
            telemetry_opts = options.get("telemetry_options")
            if telemetry_type not in ("device", "environment"):
                errors["telemetry_type"] = "telemetry_type must be 'device' or 'environment'"
            if telemetry_opts is None:
                errors["telemetry_options"] = "telemetry_options is required for telemetry payloads"
            elif not isinstance(telemetry_opts, dict):
                errors["telemetry_options"] = "telemetry_options must be an object/map"
            else:
                # Validate numericness of provided fields (best-effort)
                for k, v in telemetry_opts.items():
                    if v is None:
                        continue
                    if not (isinstance(v, (int, float)) or (isinstance(v, str) and v.strip() != "")):
                        errors[f"telemetry_options.{k}"] = "Telemetry option must be numeric"
            if "want_response" in options and not isinstance(options.get("want_response"), (bool, int)):
                errors["want_response"] = "want_response must be a boolean for telemetry payloads."
        elif self.payload_type == self.PayloadTypes.TRACEROUTE:
            # No additional payload validation needed
            pass
        else:
            errors["payload_type"] = "Unsupported payload type."

        return errors

    def get_period_timedelta(self) -> timedelta:
        return timedelta(seconds=max(self.period_seconds, self.MIN_PERIOD_SECONDS))

    def schedule_next_run(self, reference: Optional[datetime] = None) -> None:
        reference_time = reference or timezone.now()
        self.next_run_at = reference_time + self.get_period_timedelta()

    def mark_success(self, message: str | None = None) -> None:
        update_kwargs = {
            "last_run_at": timezone.now(),
            "last_status": self.RunStatus.SUCCESS,
            "last_error_message": message or "",
        }
        self.__class__.objects.filter(pk=self.pk).update(**update_kwargs)

    def mark_failure(self, error_message: str) -> None:
        update_kwargs = {
            "last_run_at": timezone.now(),
            "last_status": self.RunStatus.ERROR,
            "last_error_message": error_message[:2048],
        }
        self.__class__.objects.filter(pk=self.pk).update(**update_kwargs)

    def mark_skipped(self, message: str | None = None) -> None:
        update_kwargs = {
            "last_run_at": timezone.now(),
            "last_status": self.RunStatus.SKIPPED,
            "last_error_message": message or "",
        }
        self.__class__.objects.filter(pk=self.pk).update(**update_kwargs)
