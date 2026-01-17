from datetime import datetime
from typing import List, Optional

from ninja import Field, Schema

from .node_schemas import NodeSchema


class ChannelSchema(Schema):
    channel_id: str = Field(..., description="Unique identifier for the channel.")
    channel_num: int = Field(..., description="Channel number (0-255).")
    psk: Optional[str] = Field(
        ..., description="AES encryption key for the channel.", max_length=256
    )
    first_seen: datetime = Field(
        ..., description="Timestamp when the channel was first seen."
    )
    last_seen: datetime = Field(
        ..., description="Timestamp when the channel was last seen."
    )
    members: List[NodeSchema] = Field(
        ..., description="List of nodes associated with the channel."
    )
    interfaces: Optional[List[str]] = Field(
        ...,
        description="Interfaces where this channel has been listened to. Should be a list of objects with id, name, display_name.",
    )


class ChannelStatisticsSchema(Schema):
    channel_id: str = Field(..., description="Unique identifier for the channel.")
    channel_num: int = Field(..., description="Channel number (0-255).")
    total_messages: int = Field(
        ..., description="Total number of messages sent on this channel."
    )
    first_seen: datetime = Field(
        ..., description="Timestamp when the channel was first seen."
    )
    last_seen: datetime = Field(
        ..., description="Timestamp when the channel was last seen."
    )
    members_count: int = Field(
        ..., description="Number of unique members in the channel."
    )


class ChannelsStatisticsSchema(Schema):
    channels: List[ChannelStatisticsSchema] = Field(
        ..., description="List of statistics for all channels."
    )
