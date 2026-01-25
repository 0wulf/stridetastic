from ninja import Field, Schema


class InterfaceSchema(Schema):
    id: int = Field(..., description="Database primary key of the interface.")
    name: str = Field(..., description="Unique name for this interface instance.")
    interface_type: str = Field(
        ..., description="Type of the interface (MQTT / SERIAL / TCP)."
    )
    is_enabled: bool = Field(
        ..., description="Whether this interface should be started."
    )
    status: str = Field(
        ..., description="Current runtime status of this interface instance."
    )
    serial_node_id: int = Field(
        None, description="ID of the node bound to this serial interface, if any."
    )
