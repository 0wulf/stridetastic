from ..mesh.packet.handler import on_message

import logging

def normalize_serial_message(raw_data, interface_id=None):
    return {
        'gateway_node_id': None,
        'channel_id': raw_data['channel'] if 'channel' in raw_data.keys() else '0',
        'packet': raw_data['raw'],
        'interface_id': interface_id,
    }


def handle_serial_ingest(raw_data, interface_id=None):
    """
    Handles MQTT message ingestion, normalizes, and dispatches to protocol handler.
    """
    normalized = normalize_serial_message(raw_data, interface_id=interface_id)
    if normalized is not None:
        # Call the protocol handler with the original signature
        logging.info(normalized)
        on_message(None, None, normalized, 'Serial')
