import logging

from meshtastic.protobuf import mqtt_pb2

from ..mesh.packet.handler import on_message

def normalize_mqtt_message(msg, interface_id=None):
    """
    Extracts and normalizes the Meshtastic packet from an MQTT message.
    Returns a dict with normalized fields for the protocol handler.
    """
    topic = msg.topic
    try:
        envelope = mqtt_pb2.ServiceEnvelope()
        envelope.ParseFromString(msg.payload)
        gateway_node_id = getattr(envelope, 'gateway_id', None)
        channel_id = getattr(envelope, 'channel_id', None)
        packet = envelope.packet
        logging.info(f"Received envelope in topic={topic}\n{envelope}")
    except Exception as e:
        logging.error(f"Failed to parse MQTT message envelope: {e}")
        return None
    return {
        'gateway_node_id': gateway_node_id,
        'channel_id': channel_id,
        'packet': packet,
        'interface_id': interface_id,
    }


def handle_mqtt_ingest(client, userdata, msg, interface_id=None):
    """
    Handles MQTT message ingestion, normalizes, and dispatches to protocol handler.
    """
    from ..services.service_manager import ServiceManager  # Local import to avoid circular dependency

    try:
        manager = ServiceManager.get_instance()
        capture_service = manager.get_capture_service() or manager.initialize_capture_service()
    except Exception:
        capture_service = None

    if capture_service:
        try:
            capture_service.handle_ingest(
                source_type="mqtt",
                raw_payload=msg.payload,
                interface_id=interface_id,
            )
        except Exception as exc:
            logging.error(f"Failed to record capture payload: {exc}")

    normalized = normalize_mqtt_message(msg, interface_id=interface_id)
    if normalized is not None:
        try:
            on_message(client, userdata, normalized)
        except Exception as e:
            logging.error(f"Error in protocol handler: {e}")

