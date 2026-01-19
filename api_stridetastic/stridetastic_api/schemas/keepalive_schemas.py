from datetime import datetime
from typing import List, Optional

from ninja import Field, Schema


class KeepaliveNodeSummarySchema(Schema):
    id: int
    node_id: str
    node_num: int
    short_name: Optional[str] = None
    long_name: Optional[str] = None


class KeepaliveInterfaceSchema(Schema):
    id: int = Field(..., description="Interface primary key")
    name: Optional[str] = Field(None, description="Interface type name")
    display_name: Optional[str] = Field(
        None, description="Human-readable interface name"
    )
    status: Optional[str] = Field(None, description="Runtime status of the interface")


class KeepaliveConfigSchema(Schema):
    enabled: bool = Field(..., description="Whether keepalive monitoring is enabled")
    payload_type: str = Field(
        "reachability", description="Packet type: reachability or traceroute"
    )
    from_node: Optional[str] = Field(None, description="Source node ID")
    gateway_node: Optional[str] = Field(None, description="Optional gateway node")
    channel_name: Optional[str] = Field(None, description="Channel name")
    channel_key: Optional[str] = Field(None, description="Channel AES key")
    hop_limit: int = Field(3, description="Hop limit")
    hop_start: int = Field(3, description="Hop start")
    interface_id: Optional[int] = Field(None, description="Preferred MQTT interface ID")
    interface: Optional[KeepaliveInterfaceSchema] = Field(
        None, description="Interface metadata when configured"
    )
    offline_after_seconds: int = Field(
        3600, description="Seconds of inactivity before a node is considered offline"
    )
    check_interval_seconds: int = Field(
        60, description="How often the keepalive check runs"
    )
    scope: str = Field("all", description="Node scope: all, selected, or virtual_only")
    selected_node_ids: List[int] = Field(
        default_factory=list, description="Node IDs selected for keepalive monitoring"
    )
    selected_nodes: List[KeepaliveNodeSummarySchema] = Field(
        default_factory=list, description="Selected node details"
    )


class KeepaliveConfigUpdateSchema(Schema):
    enabled: Optional[bool] = Field(
        None, description="Enable or disable keepalive monitoring"
    )
    payload_type: Optional[str] = Field(
        None, description="Packet type: reachability or traceroute"
    )
    from_node: Optional[str] = Field(None, description="Source node ID")
    gateway_node: Optional[str] = Field(None, description="Optional gateway node")
    channel_name: Optional[str] = Field(None, description="Channel name")
    channel_key: Optional[str] = Field(None, description="Channel AES key")
    hop_limit: Optional[int] = Field(None, description="Hop limit")
    hop_start: Optional[int] = Field(None, description="Hop start")
    interface_id: Optional[int] = Field(None, description="Preferred MQTT interface ID")
    offline_after_seconds: Optional[int] = Field(
        None, description="Seconds of inactivity before a node is considered offline"
    )
    check_interval_seconds: Optional[int] = Field(
        None, description="How often the keepalive check runs"
    )
    scope: Optional[str] = Field(
        None, description="Node scope: all, selected, or virtual_only"
    )
    selected_node_ids: Optional[List[int]] = Field(
        None, description="Node IDs selected for keepalive monitoring"
    )


class KeepaliveStatusSchema(Schema):
    enabled: bool
    config: KeepaliveConfigSchema
    last_run_at: Optional[datetime]
    last_error_message: Optional[str]


class KeepaliveTransitionSchema(Schema):
    id: int
    node_id: str
    node_num: int
    short_name: Optional[str]
    long_name: Optional[str]
    last_seen: datetime
    offline_at: datetime
    reason: str
    recorded_at: datetime
