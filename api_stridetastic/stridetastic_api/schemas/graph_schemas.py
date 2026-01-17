from datetime import datetime
from typing import List, Optional

from ninja import Field, Schema  # type: ignore[import]


class EdgeSchema(Schema):
    source_node_id: int = Field(..., description="ID of the source node.")
    target_node_id: int = Field(..., description="ID of the target node.")
    first_seen: datetime = Field(
        ..., description="Timestamp when the edge was first seen."
    )
    last_seen: datetime = Field(
        ..., description="Timestamp when the edge was last seen."
    )
    last_packet_id: Optional[int] = Field(
        None, description="ID of the last packet associated with this edge."
    )
    last_rx_rssi: Optional[int] = Field(
        None, description="Last received RSSI for the edge."
    )
    last_rx_snr: Optional[float] = Field(
        None, description="Last received SNR for the edge."
    )
    last_hops: Optional[int] = Field(
        None, description="Last number of hops for the edge."
    )
    interfaces_names: List[str] = Field(
        default_factory=list,
        description="List of interface names through which this edge is observed.",
    )
