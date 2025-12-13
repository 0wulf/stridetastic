from unfold.admin import ModelAdmin
from django.contrib import admin
from ..models.channel_models import Channel


@admin.register(Channel)
class ChannelAdmin(ModelAdmin):
    list_display = (
        "channel_id",
        "channel_num",
        "psk",
        "members_count",
        "packets_count",
        "last_seen"
    )

    list_filter = (
        "channel_id",
        "channel_num",
        "members__node_id",
        "members__long_name",
        "members__short_name",
    )

    readonly_fields = (
        "interfaces",
        "channel_id",
        "channel_num",
        "members",
        "members_count",
        "packets_count",
        "last_seen",
    )

    fieldsets = (
        (None, {
            "fields": (
                "interfaces",
                "channel_id",
                "channel_num",
                "psk",
                "members",
                "members_count",
                "packets_count",
                "last_seen",
            ),
        }),
    )


    ordering = ("-last_seen",)

    def members_count(self, obj):
        has_broadcast = 1 if obj.members.filter(node_id='!ffffffff').exists() else 0
        return obj.members.count() - has_broadcast

    def packets_count(self, obj):
        return obj.packets.count()
    