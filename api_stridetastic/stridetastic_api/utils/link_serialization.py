from __future__ import annotations

from typing import Iterable, Optional

from ..models import NodeLink
from ..models.channel_models import Channel
from ..models.node_models import Node
from ..models.packet_models import Packet
from ..schemas import (
    LinkChannelSchema,
    LinkNodeSchema,
    NodeLinkPacketSchema,
    NodeLinkSchema,
)
from .packet_payloads import build_packet_payload_schema
from .ports import resolve_port_identity


def _serialize_node(node: Node) -> LinkNodeSchema:
    return LinkNodeSchema(
        id=node.pk,
        node_id=node.node_id,
        node_num=node.node_num,
        short_name=node.short_name,
        long_name=node.long_name,
    )


def _serialize_channel(channel: Channel) -> LinkChannelSchema:
    return LinkChannelSchema(
        channel_id=channel.channel_id,
        channel_num=channel.channel_num,
    )


def _first_or_none(items: Iterable[Channel]) -> Optional[Channel]:
    for item in items:
        return item
    return None


def serialize_node_link(link: NodeLink) -> NodeLinkSchema:
    last_port: Optional[str] = None
    last_port_display: Optional[str] = None
    last_channel_schema: Optional[LinkChannelSchema] = None

    last_packet = link.last_packet
    if last_packet is not None:
        packet_data = getattr(last_packet, "data", None)
        if packet_data:
            last_port, last_port_display = resolve_port_identity(
                packet_data.port, packet_data.portnum
            )
        channel_instance = _first_or_none(last_packet.channels.all())
        if channel_instance is not None:
            last_channel_schema = _serialize_channel(channel_instance)

    channels = [_serialize_channel(channel) for channel in link.channels.all()]

    return NodeLinkSchema(
        id=link.pk,
        node_a=_serialize_node(link.node_a),
        node_b=_serialize_node(link.node_b),
        node_a_to_node_b_packets=link.node_a_to_node_b_packets,
        node_b_to_node_a_packets=link.node_b_to_node_a_packets,
        total_packets=link.total_packets,
        is_bidirectional=link.is_bidirectional,
        first_seen=link.first_seen,
        last_activity=link.last_activity,
        last_packet_id=getattr(last_packet, "packet_id", None) if last_packet else None,
        last_packet_port=last_port,
        last_packet_port_display=last_port_display,
        last_packet_channel=last_channel_schema,
        channels=channels,
    )


def serialize_link_packet(packet: Packet, link: NodeLink) -> NodeLinkPacketSchema:
    packet_data = getattr(packet, "data", None)
    port: Optional[str] = None
    port_display: Optional[str] = None
    payload = None

    if packet_data:
        port, port_display = resolve_port_identity(
            packet_data.port, packet_data.portnum
        )
        payload = build_packet_payload_schema(packet_data)

    channel_instance = _first_or_none(packet.channels.all())
    channel_schema = _serialize_channel(channel_instance) if channel_instance else None

    direction = "unknown"
    node_a_pk = link.node_a.pk
    node_b_pk = link.node_b.pk
    if packet.from_node_id == node_a_pk and packet.to_node_id == node_b_pk:
        direction = "node_a_to_node_b"
    elif packet.from_node_id == node_b_pk and packet.to_node_id == node_a_pk:
        direction = "node_b_to_node_a"

    return NodeLinkPacketSchema(
        packet_id=packet.packet_id,
        timestamp=packet.time,
        direction=direction,
        from_node=_serialize_node(packet.from_node),
        to_node=_serialize_node(packet.to_node),
        port=port,
        port_display=port_display,
        channel=channel_schema,
        payload=payload,
    )
