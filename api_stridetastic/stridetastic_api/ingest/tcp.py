"""
TCP ingest handler for Meshtastic nodes connected over network (WiFi/Ethernet).
"""

import logging

from ..mesh.packet.handler import on_message


def normalize_tcp_message(raw_data, interface_id=None):
    """
    Normalize TCP message data to a consistent format for the packet handler.

    Args:
        raw_data: The raw packet data from the TCP interface
        interface_id: The database interface ID for tracking

    Returns:
        Normalized message dict with gateway_node_id, channel_id, packet, and interface_id
    """
    return {
        "gateway_node_id": None,
        "channel_id": (
            raw_data.get("channel", "0")
            if isinstance(raw_data, dict) and "channel" in raw_data
            else "0"
        ),
        "packet": raw_data.get("raw") if isinstance(raw_data, dict) else raw_data,
        "interface_id": interface_id,
    }


def handle_tcp_ingest(raw_data, interface_id=None):
    """
    Handles TCP message ingestion from network-connected Meshtastic nodes.
    Normalizes the data and dispatches to the protocol handler.

    Args:
        raw_data: The raw packet data from the TCP interface
        interface_id: The database interface ID for tracking
    """
    normalized = normalize_tcp_message(raw_data, interface_id=interface_id)
    if normalized is not None:
        logging.info(f"[TCP Ingest] Processing packet from interface {interface_id}")
        logging.debug(f"[TCP Ingest] Normalized data: {normalized}")
        on_message(None, None, normalized, "TCP")
