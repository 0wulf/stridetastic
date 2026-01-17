from datetime import datetime
from typing import List, Optional

from ninja import Field, Schema


class NodeSchema(Schema):
    id: int = Field(..., description="Database primary key of the node.")
    node_num: int = Field(..., description="Unique identifier for the node.")
    node_id: str = Field(..., description="Unique ID for the node.")
    mac_address: str = Field(..., description="MAC address of the node.")

    short_name: Optional[str] = Field(
        ..., description="Short name of the node.", max_length=4
    )
    long_name: Optional[str] = Field(
        ..., description="Long name of the node.", max_length=32
    )
    hw_model: Optional[str] = Field(
        ..., description="Hardware model of the node.", max_length=32
    )
    is_licensed: bool = Field(..., description="Indicates if the node is licensed.")
    role: Optional[str] = Field(
        ..., description="Role of the node in the network.", max_length=32
    )
    public_key: Optional[str] = Field(
        ..., description="Public key of the node for encryption.", max_length=64
    )
    is_low_entropy_public_key: bool = Field(
        ..., description="Indicates if the public key matches a known low-entropy hash."
    )
    has_private_key: bool = Field(
        ..., description="Indicates if the backend holds a private key for this node."
    )
    private_key_fingerprint: Optional[str] = Field(
        None,
        description="Fingerprint of the stored private key, if available.",
        max_length=128,
    )
    is_unmessagable: Optional[bool] = Field(
        ..., description="Indicates if the node is unmessagable."
    )
    is_virtual: bool = Field(
        ..., description="Indicates if the node is managed as a virtual node."
    )

    latitude: Optional[float] = Field(
        ..., description="Latitude of the node's position."
    )
    longitude: Optional[float] = Field(
        ..., description="Longitude of the node's position."
    )
    altitude: Optional[float] = Field(
        ..., description="Altitude of the node's position in meters."
    )
    position_accuracy: Optional[float] = Field(
        ..., description="Accuracy of the position data."
    )
    location_source: Optional[str] = Field(
        None, description="Source reported for the most recent position fix."
    )

    battery_level: Optional[int] = Field(
        ..., description="Battery level of the device in percentage."
    )
    voltage: Optional[float] = Field(..., description="Voltage of the device in volts.")
    channel_utilization: Optional[float] = Field(
        ..., description="Channel utilization of the device in percentage."
    )
    air_util_tx: Optional[float] = Field(
        ..., description="Air utilization for transmission of the device in percentage."
    )
    uptime_seconds: Optional[int] = Field(
        ..., description="Uptime of the device in seconds."
    )

    temperature: Optional[float] = Field(
        ..., description="Temperature in degrees Celsius."
    )
    relative_humidity: Optional[float] = Field(
        ..., description="Relative humidity in percentage."
    )
    barometric_pressure: Optional[float] = Field(
        ..., description="Barometric pressure in hPa."
    )
    gas_resistance: Optional[float] = Field(..., description="Gas resistance in ohms.")
    iaq: Optional[float] = Field(..., description="Indoor Air Quality (IAQ) index.")
    interfaces: Optional[List[str]] = Field(
        None, description="Interfaces where this node has been listened to."
    )
    private_key_updated_at: Optional[datetime] = Field(
        None, description="Timestamp when the private key was last updated, if known."
    )
    latency_reachable: Optional[bool] = Field(
        None, description="Whether the node responded to the most recent latency probe."
    )
    latency_ms: Optional[int] = Field(
        None,
        description="Latency in milliseconds recorded for the most recent probe response.",
    )

    first_seen: datetime = Field(
        ..., description="Timestamp when the node was first seen."
    )
    last_seen: datetime = Field(
        ..., description="Timestamp when the node was last seen."
    )


class NodeKeyHealthSchema(Schema):
    node_id: str = Field(..., description="Unique identifier for the node.")
    node_num: int = Field(..., description="Numeric identifier for the node.")
    short_name: Optional[str] = Field(None, description="Short name, if set.")
    long_name: Optional[str] = Field(None, description="Long name, if set.")
    mac_address: str = Field(..., description="MAC address for traceability.")
    public_key: Optional[str] = Field(
        None, description="Current stored public key, if any."
    )
    is_virtual: bool = Field(..., description="Whether the node is virtual.")
    is_low_entropy_public_key: bool = Field(
        ..., description="True when the key matches known low-entropy material."
    )
    duplicate_count: int = Field(
        ...,
        ge=0,
        description="How many nodes share the same non-empty public key (including this one).",
    )
    duplicate_node_ids: List[str] = Field(
        default_factory=list, description="Other node IDs that share the same key."
    )
    first_seen: datetime = Field(..., description="When the node was first observed.")
    last_seen: datetime = Field(..., description="Most recent time the node was seen.")


class NodeStatisticsSchema(Schema):
    pass


class VirtualNodeCreateSchema(Schema):
    short_name: Optional[str] = Field(
        default=None,
        description="Short name for the virtual node (max 4 characters).",
        max_length=4,
    )
    long_name: Optional[str] = Field(
        default=None,
        description="Long name for the virtual node (max 32 characters).",
        max_length=32,
    )
    hw_model: Optional[str] = Field(
        default=None,
        description="Hardware model label for the virtual node.",
        max_length=32,
    )
    role: Optional[str] = Field(
        default=None, description="Role assigned to the virtual node.", max_length=32
    )
    is_licensed: Optional[bool] = Field(
        default=None, description="Whether the virtual node is marked as licensed."
    )
    is_unmessagable: Optional[bool] = Field(
        default=None, description="Whether the virtual node is marked as unmessagable."
    )
    node_num: Optional[int] = Field(
        default=None, description="Explicit node number to assign."
    )
    node_id: Optional[str] = Field(
        default=None, description="Explicit node ID to assign.", max_length=10
    )
    mac_address: Optional[str] = Field(
        default=None, description="Explicit MAC address to assign.", max_length=17
    )


class VirtualNodeUpdateSchema(VirtualNodeCreateSchema):
    regenerate_keys: Optional[bool] = Field(
        default=False,
        description="When true, generate a new private/public key pair for the virtual node.",
    )


class VirtualNodeSecretsSchema(Schema):
    node: NodeSchema = Field(..., description="Serialized node details.")
    public_key: Optional[str] = Field(
        None, description="Base64 encoded public key when a new key pair is generated."
    )
    private_key: Optional[str] = Field(
        None, description="Base64 encoded private key when a new key pair is generated."
    )


class VirtualNodeKeyPairSchema(Schema):
    public_key: str = Field(..., description="Generated base64 encoded public key.")
    private_key: str = Field(..., description="Generated base64 encoded private key.")


class VirtualNodePrefillSchema(Schema):
    short_name: str = Field(
        ..., description="Suggested short name for the new virtual node."
    )
    long_name: str = Field(
        ..., description="Suggested long name for the new virtual node."
    )
    node_id: str = Field(
        ..., description="Suggested unique node ID for the new virtual node."
    )


class VirtualNodeEnumOptionSchema(Schema):
    value: str = Field(
        ..., description="Enum value as defined in the Meshtastic protobuf."
    )
    label: str = Field(..., description="Human readable label for the enum value.")


class VirtualNodeOptionsSchema(Schema):
    roles: List[VirtualNodeEnumOptionSchema] = Field(
        ...,
        description="Available role options derived from the Meshtastic protobuf definitions.",
    )
    hardware_models: List[VirtualNodeEnumOptionSchema] = Field(
        ...,
        description="Available hardware model options derived from the Meshtastic protobuf definitions.",
    )
    default_role: str = Field(
        ..., description="Default role to preselect when creating a virtual node."
    )
    default_hardware_model: str = Field(
        ...,
        description="Default hardware model to preselect when creating a virtual node.",
    )


class NodePositionHistorySchema(Schema):
    timestamp: datetime = Field(
        ..., description="Timestamp when this position was recorded."
    )
    latitude: float = Field(..., description="Latitude at the recorded timestamp.")
    longitude: float = Field(..., description="Longitude at the recorded timestamp.")
    altitude: Optional[float] = Field(
        None, description="Altitude in meters, if available."
    )
    accuracy: Optional[float] = Field(
        None, description="Reported position accuracy, if available."
    )
    sequence_number: Optional[int] = Field(
        None, description="Reported sequence number for the position payload."
    )
    packet_id: Optional[int] = Field(
        None, description="Packet identifier associated with this position update."
    )
    location_source: Optional[str] = Field(
        None, description="Source reported for the position fix."
    )


class NodeTelemetryHistorySchema(Schema):
    timestamp: datetime = Field(
        ..., description="Timestamp when this telemetry snapshot was recorded."
    )
    battery_level: Optional[int] = Field(None, description="Battery level percentage.")
    voltage: Optional[float] = Field(None, description="Battery voltage in volts.")
    channel_utilization: Optional[float] = Field(
        None, description="Channel utilisation percentage."
    )
    air_util_tx: Optional[float] = Field(
        None, description="Air utilisation for transmission percentage."
    )
    uptime_seconds: Optional[int] = Field(None, description="Device uptime in seconds.")
    temperature: Optional[float] = Field(
        None, description="Temperature in degrees Celsius."
    )
    relative_humidity: Optional[float] = Field(
        None, description="Relative humidity percentage."
    )
    barometric_pressure: Optional[float] = Field(
        None, description="Barometric pressure in hPa."
    )
    gas_resistance: Optional[float] = Field(None, description="Gas resistance in ohms.")
    iaq: Optional[float] = Field(None, description="Indoor Air Quality index.")


class NodeLatencyHistorySchema(Schema):
    timestamp: datetime = Field(
        ..., description="Timestamp when this latency probe completed."
    )
    probe_message_id: Optional[int] = Field(
        None, description="Mesh packet identifier used when dispatching the probe."
    )
    reachable: Optional[bool] = Field(
        None, description="Whether the node responded to the probe."
    )
    latency_ms: Optional[int] = Field(
        None, description="Round-trip latency in milliseconds when available."
    )
    responded_at: Optional[datetime] = Field(
        None, description="Timestamp when a response was recorded, if any."
    )
