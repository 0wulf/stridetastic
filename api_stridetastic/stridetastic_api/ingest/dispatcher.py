"""
Ingest dispatcher for all incoming data sources (MQTT, serial, TCP, etc).
This module provides a single entry point for ingesting packets from any source,
normalizing and dispatching them to the appropriate protocol handler.
"""

from .mqtt import handle_mqtt_ingest
from .serial import handle_serial_ingest
from .tcp import handle_tcp_ingest


def ingest_packet(source_type, raw_data, meta=None):
    """
    Entry point for all incoming packets.
    - source_type: 'mqtt', 'serial', 'tcp', etc.
    - raw_data: bytes, dict, or protobuf (raw payload)
    - meta: dict with extra info (topic, timestamp, client, userdata, msg, etc.)
    """
    interface_id = meta.get("interface_id") if meta else None
    if source_type == "mqtt":
        if meta and all(k in meta for k in ("client", "userdata", "msg")):
            handle_mqtt_ingest(
                meta["client"], meta["userdata"], meta["msg"], interface_id=interface_id
            )
        else:
            raise ValueError(
                "meta must contain 'client', 'userdata', and 'msg' for MQTT ingestion"
            )
    elif source_type == "serial":
        handle_serial_ingest(raw_data, interface_id=interface_id)
    elif source_type == "tcp":
        handle_tcp_ingest(raw_data, interface_id=interface_id)
    else:
        raise ValueError(f"Unknown source_type: {source_type}")
