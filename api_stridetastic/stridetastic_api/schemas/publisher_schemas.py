from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime
from ninja import Field, Schema

class PublishGenericSchema(Schema):
    from_node: str = Field(..., description="The node sending the published message")
    to_node: str = Field(..., description="The node receiving the published message")
    channel_name: str = Field(..., description="The channel through which the message is sent")
    gateway_node: Optional[str] = Field(None, description="Optional gateway node for routing the message")
    channel_key: str = Field("", description="Optional AES key for the channel, if encryption is used")
    hop_limit: int = Field(3, description="Maximum number of hops for the message")
    hop_start: int = Field(3, description="Initial hop count for the message")
    want_ack: bool = Field(False, description="Whether an acknowledgment is requested for the published message")
    pki_encrypted: bool = Field(False, description="Whether the message is PKI encrypted")
    interface_id: Optional[int] = Field(None, description="Interface ID (MQTT instance) to use for publishing. If omitted, default publisher is used.")

class PublishMessageSchema(PublishGenericSchema):
    message_text: str = Field(..., description="The content of the published message")

class PublishNodeInfoSchema(PublishGenericSchema):
    short_name: str = Field(..., description="Short name of the node")
    long_name: str = Field(..., description="Long name of the node")
    hw_model: int = Field(..., description="Hardware model identifier of the node")
    public_key: str = Field(..., description="Public key of the node for encryption purposes")

class PublishPositionSchema(PublishGenericSchema):
    lat: float = Field(..., description="Latitude of the published position")
    lon: float = Field(..., description="Longitude of the published position")
    alt: float = Field(0.0, description="Altitude of the published position, default is 0.0")
    # Whether the Data protobuf should request a response from the recipient
    want_response: Optional[bool] = Field(False, description="Whether the Data protobuf should request a response (only used for request-style position packets)")

class PublishTracerouteSchema(PublishGenericSchema):
    pass


class PublishTelemetrySchema(PublishGenericSchema):
    """Schema for publishing telemetry values (device or environment metrics)."""
    # telemetry_type: 'device' or 'environment'
    telemetry_type: str = Field(..., description="Telemetry category: 'device' or 'environment'")
    telemetry_options: Dict[str, Any] = Field(default_factory=dict, description="Numeric telemetry fields to include in the payload")
    want_response: Optional[bool] = Field(False, description="Whether the Data protobuf should request a response (only used for request-style telemetry packets)")


class PublishReachabilitySchema(PublishGenericSchema):
    want_ack: bool = Field(True, description="Reachability probes always request acknowledgments.")


class ReactiveInterfaceSchema(Schema):
    id: int = Field(..., description="Interface primary key")
    name: Optional[str] = Field(None, description="Interface type name")
    display_name: Optional[str] = Field(None, description="Human-readable interface name")
    status: Optional[str] = Field(None, description="Runtime status of the interface")


class PublisherReactiveConfigSchema(Schema):
    enabled: bool = Field(..., description="Whether reactive publishing is enabled")
    from_node: Optional[str] = Field(None, description="Node ID to publish traceroute packets from")
    gateway_node: Optional[str] = Field(None, description="Gateway node ID to use when publishing")
    channel_key: Optional[str] = Field(None, description="AES key for the publishing channel")
    hop_limit: int = Field(3, description="Maximum hop limit for published traceroute packets")
    hop_start: int = Field(3, description="Hop start value for published traceroute packets")
    want_ack: bool = Field(False, description="Whether published traceroute packets should request ACK")
    max_tries: int = Field(0, description="Maximum attempts per node within the rolling window")
    trigger_ports: list[str] = Field(default_factory=list, description="Port names that trigger traceroute injection")
    listen_interface_ids: List[int] = Field(default_factory=list, description="Interface IDs to listen on for reactive publishing. Empty means all interfaces.")
    listen_interfaces: List[ReactiveInterfaceSchema] = Field(default_factory=list, description="Metadata for the configured listener interfaces.")


class PublisherReactiveConfigUpdateSchema(Schema):
    enabled: Optional[bool] = Field(None, description="Enable or disable reactive publishing")
    from_node: Optional[str] = Field(None, description="Node ID to publish traceroute packets from")
    gateway_node: Optional[str] = Field(None, description="Gateway node ID to use when publishing")
    channel_key: Optional[str] = Field(None, description="AES key for the publishing channel")
    hop_limit: Optional[int] = Field(None, description="Maximum hop limit for published traceroute packets")
    hop_start: Optional[int] = Field(None, description="Hop start value for published traceroute packets")
    want_ack: Optional[bool] = Field(None, description="Whether published traceroute packets should request ACK")
    max_tries: Optional[int] = Field(None, description="Maximum attempts per node within the rolling window")
    trigger_ports: Optional[list[str]] = Field(None, description="Port names that should trigger traceroute injection")
    listen_interface_ids: Optional[List[int]] = Field(None, description="Interface IDs to listen on for reactive publishing. Use an empty list to listen on all interfaces.")


class PublisherReactiveAttemptSchema(Schema):
    count: int = Field(..., description="Number of publish attempts in the current window")
    first_attempt: Optional[datetime] = Field(None, description="Timestamp of the first attempt in the current window")
    last_attempt: Optional[datetime] = Field(None, description="Timestamp of the last attempt in the current window")


class PublisherReactiveStatusSchema(Schema):
    enabled: bool = Field(..., description="Runtime enablement state of reactive publishing")
    config: PublisherReactiveConfigSchema
    attempts: Dict[str, PublisherReactiveAttemptSchema] = Field(default_factory=dict)
    attempt_window_seconds: int = Field(..., description="Rolling window (seconds) used for attempt tracking")


class PeriodicPayloadType(str, Enum):
    TEXT = "text"
    POSITION = "position"
    NODEINFO = "nodeinfo"
    TRACEROUTE = "traceroute"
    TELEMETRY = "telemetry"


class PublisherPeriodicJobCreateSchema(Schema):
    name: str = Field(..., description="Friendly name for the periodic job")
    description: Optional[str] = Field(None, description="Optional description of the job")
    enabled: bool = Field(True, description="Whether the job should be active")
    payload_type: PeriodicPayloadType = Field(..., description="Type of payload to inject")
    from_node: str = Field(..., description="Publishing source node")
    to_node: str = Field(..., description="Publishing target node")
    channel_name: str = Field(..., description="Channel to publish on")
    gateway_node: Optional[str] = Field(None, description="Optional gateway node")
    channel_key: Optional[str] = Field(None, description="Channel AES key, leave blank for default")
    hop_limit: int = Field(3, description="Hop limit for the payload")
    hop_start: int = Field(3, description="Initial hop count")
    want_ack: bool = Field(False, description="Whether to request an ACK")
    pki_encrypted: bool = Field(False, description="Whether to PKI-encrypt the periodic message (text, position, or telemetry)")
    period_seconds: int = Field(300, description="Execution period in seconds")
    interface_id: Optional[int] = Field(None, description="Preferred MQTT interface id")
    payload_options: Dict[str, Any] = Field(default_factory=dict, description="Payload specific options")


class PublisherPeriodicJobUpdateSchema(Schema):
    name: Optional[str] = Field(None)
    description: Optional[str] = Field(None)
    enabled: Optional[bool] = Field(None)
    payload_type: Optional[PeriodicPayloadType] = Field(None)
    from_node: Optional[str] = Field(None)
    to_node: Optional[str] = Field(None)
    channel_name: Optional[str] = Field(None)
    gateway_node: Optional[str] = Field(None)
    channel_key: Optional[str] = Field(None)
    hop_limit: Optional[int] = Field(None)
    hop_start: Optional[int] = Field(None)
    want_ack: Optional[bool] = Field(None)
    pki_encrypted: Optional[bool] = Field(None)
    period_seconds: Optional[int] = Field(None)
    interface_id: Optional[int] = Field(None)
    payload_options: Optional[Dict[str, Any]] = Field(None)


class PublisherPeriodicJobSchema(Schema):
    id: int
    name: str
    description: Optional[str]
    enabled: bool
    payload_type: PeriodicPayloadType
    from_node: str
    to_node: str
    channel_name: str
    gateway_node: Optional[str]
    channel_key: Optional[str]
    hop_limit: int
    hop_start: int
    want_ack: bool
    pki_encrypted: bool
    period_seconds: int
    interface_id: Optional[int]
    interface: Optional[ReactiveInterfaceSchema]
    payload_options: Dict[str, Any]
    next_run_at: Optional[datetime]
    last_run_at: Optional[datetime]
    last_status: str
    last_error_message: Optional[str]
    created_at: datetime
    updated_at: datetime