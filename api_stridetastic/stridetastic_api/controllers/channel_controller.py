# Channel Controller

# 1. GET for 1..n channels
# 2. Get statistics for channel

from typing import List

from ninja_extra import api_controller, permissions, route
from ninja_jwt.authentication import JWTAuth

from ..models import Channel
from ..schemas import (
    ChannelSchema,
    ChannelsStatisticsSchema,
    ChannelStatisticsSchema,
    MessageSchema,
)
from ..utils.node_serialization import serialize_node

auth = JWTAuth()


@api_controller(
    "/channels", tags=["Channels"], permissions=[permissions.IsAuthenticated]
)
class ChannelController:
    @route.get("/", response={200: List[ChannelSchema], 404: MessageSchema}, auth=auth)
    def get_all_channels(self):
        """
        Get a list of all channels.
        """
        channels = Channel.objects.all()
        if not channels:
            return 404, MessageSchema(message="No channels found")
        return 200, [ChannelSchema.from_orm(channel) for channel in channels]

    @route.get(
        "/statistics",
        response={200: ChannelsStatisticsSchema, 404: MessageSchema},
        auth=auth,
    )
    def get_channels_statistics(self):
        """
        Get statistics for all channels
        """
        channels = Channel.objects.all()
        if not channels:
            return 404, MessageSchema(message="No channels found")

        statistics = []
        for channel in channels:
            channel_stats = channel.get_statistics()
            if not channel_stats:
                continue
            statistics.append(ChannelStatisticsSchema(**channel_stats))

        if not statistics:
            return 404, MessageSchema(message="No channel statistics available")

        return 200, ChannelsStatisticsSchema(channels=statistics)

    @route.get(
        "/{channel_id}/{channel_num}",
        response={200: ChannelSchema, 404: MessageSchema},
        auth=auth,
    )
    def get_channel(self, channel_id: str, channel_num: int):
        """
        Get details of a specific channel by ID.

        Here we should rethink the logic for interfaces, maybe it is not optimal.
        """
        channel = Channel.objects.filter(
            channel_id=channel_id, channel_num=channel_num
        ).first()
        if not channel:
            return 404, MessageSchema(message="Channel not found")
        members = [serialize_node(member) for member in channel.members.all()]
        interfaces = (
            [iface.name for iface in channel.interfaces.all()]
            if hasattr(channel, "interfaces")
            else []
        )
        channel_data = ChannelSchema(
            channel_id=channel.channel_id,
            channel_num=channel.channel_num,
            psk=channel.psk,
            first_seen=channel.first_seen,
            last_seen=channel.last_seen,
            members=members,
            interfaces=interfaces,
        )
        return 200, channel_data
