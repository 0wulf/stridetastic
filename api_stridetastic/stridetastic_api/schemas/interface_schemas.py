from ninja import Field, Schema
from typing import Optional

class InterfaceSchema(Schema):
    id: int = Field(..., description="Database primary key of the interface.")
    name: str = Field(..., description="Type of the interface (MQTT / SERIAL / etc).")
    display_name: str = Field(..., description="Unique display name for this interface instance.")
    is_enabled: bool = Field(..., description="Whether this interface should be started.")
    status: str = Field(..., description="Current runtime status of this interface instance.")
    serial_node_id: int = Field(None, description="ID of the node bound to this serial interface, if any.")
