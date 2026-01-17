from datetime import datetime
from typing import Optional
from uuid import UUID

from ninja import Schema


class CaptureSessionSchema(Schema):
    id: UUID
    name: str
    status: str
    source_type: str
    interface_id: Optional[int] = None
    interface_name: Optional[str] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    last_packet_at: Optional[datetime] = None
    packet_count: int
    byte_count: int
    file_size: int
    filename: str
    file_path: str
    is_active: bool


class CaptureStartSchema(Schema):
    name: str
    interface_id: Optional[int] = None
    source_type: str = "mqtt"
