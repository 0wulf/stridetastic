from django.contrib import admin
from unfold.admin import ModelAdmin

from ..models.packet_models import (
    NodeInfoPayload,
    Packet,
    PacketData,
    PositionPayload,
    RouteDiscoveryPayload,
    RouteDiscoveryRoute,
    RoutingPayload,
    TelemetryPayload,
)


@admin.register(Packet)
class PacketAdmin(ModelAdmin):
    list_display = (
        "packet_id",
        "channel_ids",
        "data__port",
        "from_node__node_id",
        "from_node__long_name",
        "gateway_nodes_node_id",
        "gateway_nodes_long_name",
        "to_node__node_id",
        "to_node__long_name",
        "ackd",
        "time",
    )

    list_filter = (
        "ackd",
        "from_node__node_id",
        "from_node__short_name",
        "from_node__long_name",
        "gateway_nodes__node_id",
        "gateway_nodes__short_name",
        "gateway_nodes__long_name",
        "to_node__node_id",
        "to_node__short_name",
        "to_node__long_name",
    )

    readonly_fields = (
        "packet_id",
        "channels",
        "from_node",
        "to_node",
        "hop_start",
        "hop_limit",
        "want_ack",
        "ackd",
        "priority",
        "delayed",
        "via_mqtt",
        "pki_encrypted",
        "public_key",
        "raw_data",
        "time",
    )
    fieldsets = ((None, {"fields": readonly_fields}),)

    ordering = ("-time",)

    search_fields = (
        "from_node__node_id",
        "from_node__short_name",
        "from_node__long_name",
        "gateway_nodes__node_id",
        "gateway_nodes__short_name",
        "gateway_nodes__long_name",
        "to_node__node_id",
        "to_node__short_name",
        "to_node__long_name",
    )

    def channel_ids(self, obj):
        return ", ".join(str(channel.channel_id) for channel in obj.channels.all())

    def gateway_nodes_node_id(self, obj):
        return ", ".join(str(node.node_id) for node in obj.gateway_nodes.all())

    def gateway_nodes_long_name(self, obj):
        return ", ".join(str(node.long_name) for node in obj.gateway_nodes.all())

    def gateway_nodes_short_name(self, obj):
        return ", ".join(str(node.short_name) for node in obj.gateway_nodes.all())

    channel_ids.short_description = "Channel IDs"
    gateway_nodes_node_id.short_description = "Gateways Node IDs"
    gateway_nodes_long_name.short_description = "Gateways Long Name"
    gateway_nodes_short_name.short_description = "Gateways Short Name"


@admin.register(PacketData)
class PacketDataAdmin(ModelAdmin):
    list_display = (
        "packet__packet_id",
        "port",
        "packet__from_node__node_id",
        "packet__from_node__long_name",
        "packet__to_node__node_id",
        "packet__to_node__long_name",
        "source",
        "dest",
        "request_id",
        "reply_id",
        "got_response",
        "time",
    )

    list_filter = (
        "port",
        "packet__from_node__node_id",
        "packet__from_node__long_name",
        "packet__to_node__node_id",
        "packet__to_node__long_name",
        "source",
        "dest",
        "request_id",
        "reply_id",
        "got_response",
    )

    readonly_fields = (
        "packet",
        "port",
        "raw_payload",
        "source",
        "dest",
        "request_id",
        "reply_id",
        "want_response",
        "got_response",
        "time",
    )
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "packet",
                    "port",
                    "raw_payload",
                    "source",
                    "dest",
                    "request_id",
                    "reply_id",
                    "want_response",
                    "got_response",
                    "time",
                ),
            },
        ),
    )

    list_select_related = ("packet",)

    ordering = ("-time",)


@admin.register(RoutingPayload)
class RoutingPayloadAdmin(ModelAdmin):
    list_display = (
        "packet_data__packet__packet_id",
        "packet_data__packet__from_node__node_id",
        "packet_data__packet__from_node__long_name",
        "packet_data__packet__to_node__node_id",
        "packet_data__packet__to_node__long_name",
        "error_reason",
        "time",
    )

    list_filter = (
        "packet_data__packet__from_node__node_id",
        "packet_data__packet__from_node__long_name",
        "packet_data__packet__to_node__node_id",
        "packet_data__packet__to_node__long_name",
        "error_reason",
    )

    readonly_fields = (
        "packet_data",
        "error_reason",
        "time",
    )

    fieldsets = (
        (
            None,
            {
                "fields": readonly_fields,
            },
        ),
    )

    list_select_related = ("packet_data",)

    ordering = ("-time",)


@admin.register(RouteDiscoveryPayload)
class RouteDiscoveryPayloadAdmin(ModelAdmin):
    list_display = (
        "packet_data__packet__packet_id",
        "packet_data__packet__from_node__node_id",
        "packet_data__packet__from_node__long_name",
        "route_towards__node_list",
        "snr_towards",
        "packet_data__packet__gateway_nodes__node_id",
        "packet_data__packet__gateway_nodes__long_name",
        "route_back__node_list",
        "snr_back",
        "packet_data__packet__to_node__node_id",
        "packet_data__packet__to_node__long_name",
        "time",
    )

    list_filter = (
        "packet_data__packet__from_node__node_id",
        "packet_data__packet__from_node__long_name",
        "route_towards__node_list",
        "snr_towards",
        "packet_data__packet__gateway_nodes__node_id",
        "packet_data__packet__gateway_nodes__long_name",
        "route_back__node_list",
        "snr_back",
        "packet_data__packet__to_node__node_id",
        "packet_data__packet__to_node__long_name",
    )

    readonly_fields = (
        "packet_data",
        "route_towards",
        "snr_towards",
        "route_back",
        "snr_back",
        "time",
    )

    fieldsets = (
        (
            None,
            {
                "fields": readonly_fields,
            },
        ),
    )

    list_select_related = (
        "packet_data",
        "route_towards",
        "route_back",
    )

    ordering = ("-time",)


@admin.register(RouteDiscoveryRoute)
class RouteDiscoveryRouteAdmin(ModelAdmin):
    list_display = (
        "node_list",
        "time",
    )
    readonly_fields = (
        "nodes",
        "node_list",
        "time",
    )
    fieldsets = (
        (
            None,
            {
                "fields": readonly_fields,
            },
        ),
    )

    ordering = ("-time",)


@admin.register(TelemetryPayload)
class TelemetryPayloadAdmin(ModelAdmin):
    list_display = (
        "packet_data__packet__from_node__node_id",
        "packet_data__packet__from_node__short_name",
        "packet_data__packet__from_node__long_name",
        "voltage",
        "channel_utilization",
        "uptime_seconds",
        "temperature",
        "time",
    )

    list_filter = (
        "packet_data__packet__from_node__node_id",
        "packet_data__packet__from_node__short_name",
        "packet_data__packet__from_node__long_name",
        "voltage",
        "channel_utilization",
        "uptime_seconds",
        "temperature",
    )

    readonly_fields = (
        "packet_data",
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
        "time",
    )

    fieldsets = (
        (
            None,
            {
                "fields": readonly_fields,
            },
        ),
    )

    list_select_related = ("packet_data",)

    ordering = ("-time",)


@admin.register(NodeInfoPayload)
class NodeInfoPayloadAdmin(ModelAdmin):
    list_display = (
        "packet_data__packet__from_node__node_id",
        "short_name",
        "long_name",
        "hw_model",
        "role",
        "time",
    )

    list_filter = (
        "packet_data__packet__from_node__node_id",
        "short_name",
        "long_name",
        "hw_model",
        "role",
    )

    readonly_fields = (
        "packet_data",
        "short_name",
        "long_name",
        "hw_model",
        "is_licensed",
        "role",
        "public_key",
        "is_unmessagable",
        "time",
    )

    fieldsets = (
        (
            None,
            {
                "fields": readonly_fields,
            },
        ),
    )

    list_select_related = ("packet_data",)

    ordering = ("-time",)


@admin.register(PositionPayload)
class PositionPayloadAdmin(ModelAdmin):
    list_display = (
        "packet_data__packet__from_node__node_id",
        "packet_data__packet__from_node__short_name",
        "packet_data__packet__from_node__long_name",
        "latitude",
        "longitude",
        "altitude",
        "location_source",
        "time",
    )

    list_filter = (
        "packet_data__packet__from_node__node_id",
        "packet_data__packet__from_node__short_name",
        "packet_data__packet__from_node__long_name",
        "latitude",
        "longitude",
        "altitude",
        "location_source",
    )
    readonly_fields = (
        "packet_data",
        "latitude",
        "longitude",
        "altitude",
        "accuracy",
        "seq_number",
        "location_source",
        "time",
    )

    fieldsets = (
        (
            None,
            {
                "fields": readonly_fields,
            },
        ),
    )

    list_select_related = ("packet_data",)

    ordering = ("-time",)
