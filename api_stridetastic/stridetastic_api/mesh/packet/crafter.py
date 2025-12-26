from typing import Optional

from meshtastic.protobuf import mesh_pb2, mqtt_pb2, portnums_pb2, admin_pb2
from meshtastic.protobuf import telemetry_pb2
import time
import base64
# import re
from ..utils import generate_hash, id_to_num
from ..encryption.aes import encrypt_message
from ..encryption.pkc import load_public_key_bytes, PKIDecryptionError

def craft_mesh_packet(
    from_id,
    to_id,
    channel_name,
    channel_aes_key,
    global_message_id,
    data_protobuf,
    hop_limit=3,
    hop_start=3,
    want_ack=False,
    pki_encrypted=False,
    public_key=None,
    encrypted_payload: Optional[bytes] = None,
):
    from_num = id_to_num(from_id)
    to_num = id_to_num(to_id)
    mesh_packet = mesh_pb2.MeshPacket()
    mesh_packet.id = global_message_id
    setattr(mesh_packet, "from", from_num)
    mesh_packet.to = to_num
    # Compute channel from channel_name and channel_aes_key
    if not pki_encrypted:
        mesh_packet.channel = generate_hash(channel_name, channel_aes_key)
    mesh_packet.hop_limit = hop_limit
    mesh_packet.hop_start = hop_start
    mesh_packet.want_ack = want_ack
    mesh_packet.pki_encrypted = pki_encrypted
    if public_key:
        try:
            mesh_packet.public_key = load_public_key_bytes(public_key)
        except PKIDecryptionError as exc:
            raise ValueError(f"Invalid public key material: {exc}") from exc

    if pki_encrypted:
        mesh_packet.channel = 0
        if encrypted_payload is None:
            raise ValueError("Encrypted payload must be provided for PKI packets")
        mesh_packet.encrypted = encrypted_payload
    elif channel_aes_key == "":
        mesh_packet.decoded.CopyFrom(data_protobuf)
    else:
        mesh_packet.encrypted = encrypt_message(channel_name, channel_aes_key, mesh_packet, data_protobuf, from_num)
    return mesh_packet

def craft_service_envelope(
        mesh_packet,
        channel_name,
        gateway_id,
):
    service_envelope = mqtt_pb2.ServiceEnvelope()
    service_envelope.packet.CopyFrom(mesh_packet)
    service_envelope.channel_id = channel_name
    service_envelope.gateway_id = gateway_id
    return service_envelope.SerializeToString()

def craft_text_message(message_text):
    text_message = mesh_pb2.Data()
    text_message.portnum = portnums_pb2.TEXT_MESSAGE_APP
    text_message.payload = message_text.encode("utf-8")
    text_message.bitfield = 1
    return text_message

def craft_nodeinfo(
        from_id,
        short_name,
        long_name,
        hw_model,
        public_key,
):
    user_pb = mesh_pb2.User()
    user_pb.id = from_id
    user_pb.long_name = long_name
    user_pb.short_name = short_name
    user_pb.hw_model = hw_model
    user_pb.public_key = base64.b64decode(public_key)

    user_pb = user_pb.SerializeToString()

    nodeinfo_packet = mesh_pb2.Data()
    nodeinfo_packet.portnum = portnums_pb2.NODEINFO_APP
    nodeinfo_packet.payload = user_pb
    nodeinfo_packet.bitfield = 1
    nodeinfo_packet.want_response = True
    return nodeinfo_packet



def craft_position(
    lat,
    lon,
    alt,
    want_response: bool = False
):
    position_pb = mesh_pb2.Position()
    position_pb.latitude_i = int(float(lat) * 1e7)
    position_pb.longitude_i = int(float(lon) * 1e7)
    position_pb.altitude = int(float(alt))
    position_pb.time = int(time.time())
    position_pb = position_pb.SerializeToString()

    position_packet = mesh_pb2.Data()
    position_packet.portnum = portnums_pb2.POSITION_APP
    position_packet.payload = position_pb
    position_packet.bitfield = 1
    position_packet.want_response = bool(want_response)
    return position_packet


def craft_traceroute():
    route_discovery_pb = mesh_pb2.RouteDiscovery()
    route_discovery_pb = route_discovery_pb.SerializeToString()

    traceroute_packet = mesh_pb2.Data()
    traceroute_packet.portnum = portnums_pb2.TRACEROUTE_APP
    traceroute_packet.payload = route_discovery_pb
    traceroute_packet.bitfield = 1
    traceroute_packet.want_response = True
    return traceroute_packet


def craft_reachability_probe():
    """Build a minimal routing packet suitable for reachability testing."""
    routing_pb = mesh_pb2.Routing()
    routing_payload = routing_pb.SerializeToString()

    routing_packet = mesh_pb2.Data()
    routing_packet.portnum = portnums_pb2.ROUTING_APP
    routing_packet.payload = routing_payload
    routing_packet.bitfield = 1
    routing_packet.want_response = False
    return routing_packet


def craft_telemetry(telemetry_type: str, telemetry_options: dict, want_response: bool = False):
    """Build a Telemetry Data protobuf from provided options.

    telemetry_type: 'device' or 'environment'
    telemetry_options: mapping of field names to numeric values
    """
    telemetry = telemetry_pb2.Telemetry()

    # Populate device metrics
    if telemetry_type == 'device':
        dev = telemetry.device_metrics
        if 'battery_level' in telemetry_options:
            dev.battery_level = int(telemetry_options['battery_level'])
        if 'voltage' in telemetry_options:
            dev.voltage = float(telemetry_options['voltage'])
        if 'channel_utilization' in telemetry_options:
            dev.channel_utilization = float(telemetry_options['channel_utilization'])
        if 'air_util_tx' in telemetry_options:
            dev.air_util_tx = float(telemetry_options['air_util_tx'])
        if 'uptime_seconds' in telemetry_options:
            dev.uptime_seconds = int(telemetry_options['uptime_seconds'])

    # Populate environment metrics
    if telemetry_type == 'environment':
        env = telemetry.environment_metrics
        if 'temperature' in telemetry_options:
            env.temperature = float(telemetry_options['temperature'])
        if 'relative_humidity' in telemetry_options:
            env.relative_humidity = float(telemetry_options['relative_humidity'])
        if 'barometric_pressure' in telemetry_options:
            env.barometric_pressure = float(telemetry_options['barometric_pressure'])
        if 'gas_resistance' in telemetry_options:
            env.gas_resistance = float(telemetry_options['gas_resistance'])
        if 'iaq' in telemetry_options:
            env.iaq = float(telemetry_options['iaq'])

    data_packet = mesh_pb2.Data()
    data_packet.portnum = portnums_pb2.TELEMETRY_APP
    data_packet.payload = telemetry.SerializeToString()
    data_packet.bitfield = 1
    data_packet.want_response = bool(want_response)
    return data_packet



# def send_ack(destination_id, message_id, node_number, channel, key, global_message_id, node_name, publish_topic, mqtt_client, debug=False):
#     if debug: print("Sending ACK")
#     encoded_message = mesh_pb2.Data()
#     encoded_message.portnum = portnums_pb2.ROUTING_APP
#     encoded_message.request_id = message_id
#     encoded_message.payload = b"\030\000"
#     generate_mesh_packet(
#         destination_id, encoded_message, node_number, channel, key, global_message_id, node_name, publish_topic, mqtt_client, debug
#     )
