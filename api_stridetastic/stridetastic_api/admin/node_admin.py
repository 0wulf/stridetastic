import hashlib

from django import forms
from django.contrib import admin
from django.db.models import Q
from unfold.admin import ModelAdmin

from ..models.node_models import Node, NodeLatencyHistory


class HasPrivateKeyFilter(admin.SimpleListFilter):
    title = "Has private key"
    parameter_name = "has_private_key"

    def lookups(self, request, model_admin):
        return (
            ("yes", "Yes"),
            ("no", "No"),
        )

    def queryset(self, request, queryset):
        value = self.value()
        if value == "yes":
            return queryset.exclude(private_key__isnull=True).exclude(
                private_key__exact=""
            )
        if value == "no":
            return queryset.filter(
                Q(private_key__isnull=True) | Q(private_key__exact="")
            )
        return queryset


class LowEntropyKeyFilter(admin.SimpleListFilter):
    title = "Low entropy key"
    parameter_name = "low_entropy_key"

    def lookups(self, request, model_admin):
        return (
            ("yes", "Yes"),
            ("no", "No"),
        )

    def queryset(self, request, queryset):
        value = self.value()
        if value == "yes":
            return queryset.filter(is_low_entropy_public_key=True)
        if value == "no":
            return queryset.filter(is_low_entropy_public_key=False)
        return queryset


class NodeAdminForm(forms.ModelForm):
    private_key = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 12, "cols": 80}),
        help_text="Paste the PEM-encoded private key. Leave blank to remove the stored key.",
    )

    class Meta:
        model = Node
        fields = "__all__"


@admin.register(Node)
class NodeAdmin(ModelAdmin):
    form = NodeAdminForm

    list_display = (
        "node_id",
        "short_name",
        "long_name",
        "role",
        "is_virtual",
        "hw_model",
        "latitude",
        "longitude",
        "location_source",
        "latency_reachable",
        "latency_ms",
        "has_private_key_flag",
        "low_entropy_key_flag",
        "channels_count",
        "last_seen",
    )

    list_filter = (
        "node_id",
        "short_name",
        "long_name",
        "role",
        "is_virtual",
        "hw_model",
        "latitude",
        "longitude",
        "location_source",
        "latency_reachable",
        HasPrivateKeyFilter,
        LowEntropyKeyFilter,
        "channels__channel_id",
        "channels__channel_num",
    )

    readonly_fields = (
        "node_num",
        "node_id",
        "mac_address",
        "is_licensed",
        "is_unmessagable",
        "is_virtual",
        "public_key",
        "short_name",
        "long_name",
        "role",
        "hw_model",
        "latitude",
        "longitude",
        "altitude",
        "position_accuracy",
        "location_source",
        "battery_level",
        "voltage",
        "channel_utilization",
        "air_util_tx",
        "uptime_seconds",
        "temperature",
        "relative_humidity",
        "barometric_pressure",
        "gas_resistance",
        "iaq",
        "latency_reachable",
        "latency_ms",
        "interfaces",
        "has_private_key_flag",
        "private_key_fingerprint",
        "private_key_updated_at",
        "is_low_entropy_public_key",
        "low_entropy_key_flag",
        "first_seen",
        "last_seen",
    )

    fieldsets = (
        (
            None,
            {
                "fields": (
                    "node_num",
                    "node_id",
                    "mac_address",
                    "is_virtual",
                    "is_licensed",
                    "is_unmessagable",
                    "public_key",
                    "private_key",
                    "private_key_fingerprint",
                    "private_key_updated_at",
                    "short_name",
                    "long_name",
                    "role",
                    "hw_model",
                    "latitude",
                    "longitude",
                    "altitude",
                    "position_accuracy",
                    "location_source",
                    "battery_level",
                    "voltage",
                    "channel_utilization",
                    "air_util_tx",
                    "uptime_seconds",
                    "temperature",
                    "relative_humidity",
                    "barometric_pressure",
                    "gas_resistance",
                    "iaq",
                    "latency_reachable",
                    "latency_ms",
                    "interfaces",
                    "has_private_key_flag",
                    "low_entropy_key_flag",
                    "first_seen",
                    "last_seen",
                ),
            },
        ),
    )

    ordering = ("-last_seen",)

    search_fields = (
        "node_id",
        "short_name",
        "long_name",
        "mac_address",
        "role",
        "hw_model",
        "latitude",
        "longitude",
        "private_key_fingerprint",
        "location_source",
        "channels__channel_id",
        "channels__channel_num",
    )

    def channels_count(self, obj):
        return obj.channels.count()

    def has_private_key_flag(self, obj):
        return obj.has_private_key

    has_private_key_flag.short_description = "Has Private Key"
    has_private_key_flag.boolean = True

    def low_entropy_key_flag(self, obj):
        return obj.is_low_entropy_public_key

    low_entropy_key_flag.short_description = "Low Entropy"
    low_entropy_key_flag.boolean = True

    def save_model(self, request, obj, form, change):
        private_key = form.cleaned_data.get("private_key")
        super().save_model(request, obj, form, change)

        if "private_key" in form.changed_data or not change:
            fingerprint = None
            if private_key:
                fingerprint = hashlib.sha256(private_key.encode("utf-8")).hexdigest()
            obj.store_private_key(private_key or "", fingerprint=fingerprint)


@admin.register(NodeLatencyHistory)
class NodeLatencyHistoryAdmin(ModelAdmin):
    list_display = (
        "time",
        "node",
        "reachable",
        "latency_ms",
        "probe_message_id",
        "responded_at",
    )
    list_filter = ("reachable", "node")
    search_fields = ("node__node_id", "probe_message_id")
    list_select_related = ("node",)
    ordering = ("-time",)
    autocomplete_fields = ("node",)
