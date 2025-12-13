from datetime import datetime
from typing import Optional, List

from ninja import Field, Schema


class OverviewMetricSnapshotSchema(Schema):
    timestamp: datetime = Field(..., description="Timestamp when the snapshot was recorded.")
    total_nodes: int = Field(..., description="Total nodes known to the system at capture time.")
    active_nodes: int = Field(..., description="Nodes seen within the active activity window.")
    reachable_nodes: int = Field(..., description="Nodes that responded to the latest reactive probe cycle.")
    active_connections: int = Field(..., description="Active edges observed at capture time.")
    channels: int = Field(..., description="Active channels observed at capture time.")
    avg_battery: Optional[float] = Field(None, description="Average battery level across reporting nodes.")
    avg_rssi: Optional[float] = Field(None, description="Average RSSI value across active edges.")
    avg_snr: Optional[float] = Field(None, description="Average SNR value across active edges.")


class OverviewMetricsSchema(Schema):
    total_nodes: int = Field(..., description="Current total node count.")
    active_nodes: int = Field(..., description="Nodes observed within the configured active window.")
    reachable_nodes: int = Field(..., description="Nodes that responded to the most recent reactive probe cycle.")
    active_connections: int = Field(..., description="Current active edge count.")
    channels: int = Field(..., description="Current active channel count.")
    avg_battery: Optional[float] = Field(None, description="Average battery level across nodes reporting telemetry.")
    avg_rssi: Optional[float] = Field(None, description="Average RSSI across active edges.")
    avg_snr: Optional[float] = Field(None, description="Average SNR across active edges.")


class OverviewMetricsResponseSchema(Schema):
    current: OverviewMetricsSchema = Field(..., description="Current snapshot of overview metrics.")
    history: List[OverviewMetricSnapshotSchema] = Field(
        default_factory=list,
        description="Historical snapshot series ordered chronologically.",
    )
