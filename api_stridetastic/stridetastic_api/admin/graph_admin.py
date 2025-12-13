from unfold.admin import ModelAdmin
from django.contrib import admin
from ..models.graph_models import Edge

@admin.register(Edge)
class EdgeAdmin(ModelAdmin):
    list_display = (
        "source_node",
        "target_node",
        "first_seen",
        "last_seen",
        "last_packet",
        "last_rx_rssi",
        "last_rx_snr",
        "last_hops",
    )

    list_filter = (
        "source_node__node_id",
        "target_node__node_id",
        "first_seen",
        "last_seen",
        "last_packet",
        "last_rx_rssi",
        "last_rx_snr",
        "last_hops",
    )

    readonly_fields = (
        "source_node",
        "target_node",
        "first_seen",
        "last_seen",
        "last_packet",
        "last_rx_rssi",
        "last_rx_snr",
        "last_hops",
    )

    search_fields = (
        "source_node__node_id",
        "target_node__node_id",
    )