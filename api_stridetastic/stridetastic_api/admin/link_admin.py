from django.contrib import admin
from unfold.admin import ModelAdmin

from ..models.link_models import NodeLink


@admin.register(NodeLink)
class NodeLinkAdmin(ModelAdmin):
    list_display = (
        "link_label",
        "is_bidirectional",
        "node_a_to_node_b_packets",
        "node_b_to_node_a_packets",
        "total_packets",
        "last_activity",
    )
    list_filter = (
        "is_bidirectional",
        "channels__channel_id",
    )
    search_fields = (
        "node_a__node_id",
        "node_a__short_name",
        "node_a__long_name",
        "node_b__node_id",
        "node_b__short_name",
        "node_b__long_name",
    )
    readonly_fields = (
        "node_a",
        "node_b",
        "node_a_to_node_b_packets",
        "node_b_to_node_a_packets",
        "is_bidirectional",
        "first_seen",
        "last_activity",
        "last_packet",
        "total_packets",
        "channels",
    )
    ordering = ("-last_activity",)

    def total_packets(self, obj: NodeLink) -> int:
        return obj.total_packets

    total_packets.short_description = "Total packets"  # type: ignore[attr-defined]

    def link_label(self, obj: NodeLink) -> str:
        return f"{obj.node_a.node_id} ↔ {obj.node_b.node_id}"

    link_label.short_description = "Link"  # type: ignore[attr-defined]
