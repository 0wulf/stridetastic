from datetime import datetime
from typing import List, Optional

from ninja import Field, Schema  # type: ignore[import]

from .port_schemas import PacketPayloadSchema


class LinkNodeSchema(Schema):
    id: int = Field(..., description="Database identifier for the node.")
    node_id: str = Field(..., description="Mesh node identifier (e.g., !abcd1234).")
    node_num: int = Field(..., description="Numeric node identifier.")
    short_name: Optional[str] = Field(None, description="Short name advertised by the node.")
    long_name: Optional[str] = Field(None, description="Long name advertised by the node.")


class LinkChannelSchema(Schema):
    channel_id: str = Field(..., description="Channel identifier associated with the link.")
    channel_num: Optional[int] = Field(None, description="Numeric channel number when known.")


class NodeLinkSchema(Schema):
    id: int = Field(..., description="Identifier for the logical link.")
    node_a: LinkNodeSchema = Field(..., description="Canonical first node in the link.")
    node_b: LinkNodeSchema = Field(..., description="Canonical second node in the link.")
    node_a_to_node_b_packets: int = Field(..., description="Packets observed from node_a to node_b.")
    node_b_to_node_a_packets: int = Field(..., description="Packets observed from node_b to node_a.")
    total_packets: int = Field(..., description="Total packets observed across both directions.")
    is_bidirectional: bool = Field(..., description="True when traffic has been observed in both directions.")
    first_seen: datetime = Field(..., description="Timestamp when the link was first detected.")
    last_activity: datetime = Field(..., description="Timestamp for the most recent packet observed on this link.")
    last_packet_id: Optional[int] = Field(None, description="Identifier of the most recent packet when available.")
    last_packet_port: Optional[str] = Field(None, description="Port identifier of the most recent packet when known.")
    last_packet_port_display: Optional[str] = Field(
        None,
        description="Human-friendly label for the most recent packet's port.",
    )
    last_packet_channel: Optional[LinkChannelSchema] = Field(
        None,
        description="Channel associated with the most recent packet, when available.",
    )
    channels: List[LinkChannelSchema] = Field(
        default_factory=list,
        description="Channels that have carried traffic between these nodes.",
    )


class NodeLinkPacketSchema(Schema):
    packet_id: Optional[int] = Field(None, description="Identifier of the packet when available.")
    timestamp: datetime = Field(..., description="Timestamp when the packet was observed.")
    direction: str = Field(..., description="Direction of travel relative to the canonical link.")
    from_node: LinkNodeSchema = Field(..., description="Sender node details.")
    to_node: LinkNodeSchema = Field(..., description="Receiver node details.")
    port: Optional[str] = Field(None, description="Canonical port identifier for the packet.")
    port_display: Optional[str] = Field(None, description="Human-friendly port label.")
    channel: Optional[LinkChannelSchema] = Field(None, description="Channel that carried the packet when known.")
    payload: Optional[PacketPayloadSchema] = Field(None, description="Decoded payload contents when available.")
