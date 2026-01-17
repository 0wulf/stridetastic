from datetime import datetime
from typing import Any, Dict, Optional

from ninja import Field, Schema  # type: ignore[import]


class PortActivitySchema(Schema):
    port: str = Field(..., description="Meshtastic port identifier.")
    display_name: str = Field(..., description="Human-friendly port name.")
    total_packets: int = Field(
        ..., description="Total number of packets observed for this port."
    )
    last_seen: Optional[datetime] = Field(
        None, description="Timestamp of the most recent packet for this port."
    )


class NodePortActivitySchema(Schema):
    port: str = Field(..., description="Meshtastic port identifier.")
    display_name: str = Field(..., description="Human-friendly port name.")
    sent_count: int = Field(
        ..., description="Number of packets sent by the node on this port."
    )
    received_count: int = Field(
        ..., description="Number of packets received by the node on this port."
    )
    last_sent: Optional[datetime] = Field(
        None, description="Most recent transmission timestamp on this port."
    )
    last_received: Optional[datetime] = Field(
        None, description="Most recent receive timestamp on this port."
    )


class PortNodeActivitySchema(Schema):
    node_id: str = Field(..., description="Identifier of the node using this port.")
    node_num: Optional[int] = Field(
        None, description="Mesh node number when available."
    )
    short_name: Optional[str] = Field(
        None, description="Short name advertised by the node."
    )
    long_name: Optional[str] = Field(
        None, description="Long name advertised by the node."
    )
    sent_count: int = Field(
        ..., description="Packets sent by this node on the selected port."
    )
    received_count: int = Field(
        ..., description="Packets received by this node on the selected port."
    )
    total_packets: int = Field(
        ..., description="Combined sent and received packets on this port."
    )
    last_sent: Optional[datetime] = Field(
        None, description="Most recent packet sent by this node on the port."
    )
    last_received: Optional[datetime] = Field(
        None, description="Most recent packet received by this node on the port."
    )
    last_activity: Optional[datetime] = Field(
        None, description="Latest activity timestamp considering both directions."
    )


class PacketPayloadSchema(Schema):
    payload_type: str = Field(
        ..., description="Type identifier for the payload contents."
    )
    fields: Dict[str, Any] = Field(
        default_factory=dict, description="Payload attributes as key-value pairs."
    )


class NodePortPacketSchema(Schema):
    packet_id: Optional[int] = Field(
        None, description="Identifier of the packet when available."
    )
    timestamp: datetime = Field(
        ..., description="Timestamp when the packet was observed."
    )
    direction: str = Field(
        ..., description="Whether the node sent or received the packet."
    )
    port: str = Field(..., description="Canonical Meshtastic port identifier.")
    display_name: str = Field(..., description="Human-friendly port name.")
    portnum: Optional[int] = Field(None, description="Numeric port value, if known.")
    from_node_id: Optional[str] = Field(None, description="Sender node identifier.")
    to_node_id: Optional[str] = Field(None, description="Receiver node identifier.")
    payload: Optional[PacketPayloadSchema] = Field(
        None, description="Decoded payload contents when available."
    )
