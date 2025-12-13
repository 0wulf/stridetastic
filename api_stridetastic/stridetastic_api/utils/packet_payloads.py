from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Optional

from ..models.packet_models import PacketData
from ..schemas import PacketPayloadSchema


def _coerce_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    return value


def _filter_fields(fields: Dict[str, Any]) -> Dict[str, Any]:
    return {key: _coerce_value(val) for key, val in fields.items() if val is not None}


def _serialize_datetime(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _serialize_node_summary(node: Any) -> Optional[Dict[str, Any]]:
    if node is None:
        return None
    return _filter_fields(
        {
            "id": getattr(node, "pk", None),
            "node_id": getattr(node, "node_id", None),
            "node_num": getattr(node, "node_num", None),
            "short_name": getattr(node, "short_name", None),
            "long_name": getattr(node, "long_name", None),
        }
    )


def _base_payload_fields(packet_data: PacketData) -> Dict[str, Any]:
    return _filter_fields(
        {
            "source": packet_data.source,
            "dest": packet_data.dest,
            "request_id": packet_data.request_id,
            "reply_id": packet_data.reply_id,
            "want_response": packet_data.want_response,
            "got_response": packet_data.got_response,
        }
    )


def _serialize_route_section(route: Any) -> Optional[Dict[str, Any]]:
    if route is None:
        return None

    node_list_value: Any = getattr(route, "node_list", None)
    if isinstance(node_list_value, str):
        try:
            node_list_value = json.loads(node_list_value)
        except json.JSONDecodeError:
            pass

    nodes_qs = getattr(route, "nodes", None)
    node_summaries = []
    if nodes_qs is not None:
        for node in nodes_qs.all():
            summary = _serialize_node_summary(node)
            if summary:
                node_summaries.append(summary)

    return _filter_fields(
        {
            "node_list": node_list_value,
            "nodes": node_summaries,
            "hops": getattr(route, "hops", None),
        }
    )


def build_packet_payload_schema(packet_data: PacketData) -> Optional[PacketPayloadSchema]:
    base_fields = _base_payload_fields(packet_data)

    telemetry = getattr(packet_data, "telemetry_payload", None)
    if telemetry:
        telemetry_fields = _filter_fields(
            {
                "battery_level": telemetry.battery_level,
                "voltage": telemetry.voltage,
                "channel_utilization": telemetry.channel_utilization,
                "air_util_tx": telemetry.air_util_tx,
                "uptime_seconds": telemetry.uptime_seconds,
                "temperature": telemetry.temperature,
                "relative_humidity": telemetry.relative_humidity,
                "barometric_pressure": telemetry.barometric_pressure,
                "gas_resistance": telemetry.gas_resistance,
                "iaq": telemetry.iaq,
            }
        )
        fields = dict(base_fields)
        fields.update(telemetry_fields)
        return PacketPayloadSchema(payload_type="telemetry", fields=fields)

    position = getattr(packet_data, "position_payload", None)
    if position:
        position_fields = _filter_fields(
            {
                "latitude": position.latitude,
                "longitude": position.longitude,
                "altitude": position.altitude,
                "accuracy": position.accuracy,
                "seq_number": position.seq_number,
                "location_source": position.location_source,
            }
        )
        fields = dict(base_fields)
        fields.update(position_fields)
        return PacketPayloadSchema(payload_type="position", fields=fields)

    node_info = getattr(packet_data, "node_info_payload", None)
    if node_info:
        node_info_fields = _filter_fields(
            {
                "short_name": node_info.short_name,
                "long_name": node_info.long_name,
                "hw_model": node_info.hw_model,
                "role": node_info.role,
                "public_key": node_info.public_key,
                "is_licensed": node_info.is_licensed,
                "is_unmessagable": node_info.is_unmessagable,
            }
        )
        fields = dict(base_fields)
        fields.update(node_info_fields)
        return PacketPayloadSchema(payload_type="node_info", fields=fields)

    neighbor_info = getattr(packet_data, "neighbor_info_payload", None)
    if neighbor_info:
        fields = dict(base_fields)
        reporting_node = _serialize_node_summary(getattr(neighbor_info, "reporting_node", None))
        if reporting_node:
            fields["reporting_node"] = reporting_node

        last_sent_fields = _filter_fields(
            {
                "node_num": getattr(neighbor_info, "last_sent_by_node_num", None),
            }
        )
        last_sent_node = _serialize_node_summary(getattr(neighbor_info, "last_sent_by_node", None))
        if last_sent_node:
            last_sent_fields["node"] = last_sent_node
        if last_sent_fields:
            fields["last_sent_by"] = last_sent_fields

        fields.update(
            _filter_fields(
                {
                    "reporting_node_id_text": getattr(neighbor_info, "reporting_node_id_text", None),
                    "node_broadcast_interval_secs": getattr(neighbor_info, "node_broadcast_interval_secs", None),
                }
            )
        )

        neighbors_data = []
        for neighbor in neighbor_info.neighbors.all():
            neighbor_summary = _filter_fields(
                {
                    "advertised_node_id": getattr(neighbor, "advertised_node_id", None),
                    "advertised_node_num": getattr(neighbor, "advertised_node_num", None),
                    "snr": getattr(neighbor, "snr", None),
                    "last_rx_time": _serialize_datetime(getattr(neighbor, "last_rx_time", None)),
                    "last_rx_time_raw": getattr(neighbor, "last_rx_time_raw", None),
                    "broadcast_interval_secs": getattr(neighbor, "node_broadcast_interval_secs", None),
                }
            )
            resolved = _serialize_node_summary(getattr(neighbor, "node", None))
            if resolved:
                neighbor_summary["node"] = resolved
            neighbors_data.append(neighbor_summary)

        fields["neighbors"] = neighbors_data
        fields["neighbors_count"] = len(neighbors_data)
        return PacketPayloadSchema(payload_type="neighbor_info", fields=fields)

    route_discovery = getattr(packet_data, "route_discovery_payload", None)
    if route_discovery:
        fields = dict(base_fields)
        towards = _serialize_route_section(getattr(route_discovery, "route_towards", None))
        back = _serialize_route_section(getattr(route_discovery, "route_back", None))
        if towards:
            fields["route_towards"] = towards
        if back:
            fields["route_back"] = back
        snr_towards = getattr(route_discovery, "snr_towards", None)
        snr_back = getattr(route_discovery, "snr_back", None)
        if snr_towards is not None:
            fields["snr_towards"] = snr_towards
        if snr_back is not None:
            fields["snr_back"] = snr_back
        return PacketPayloadSchema(payload_type="route_discovery", fields=fields)

    routing = getattr(packet_data, "routing_payload", None)
    if routing:
        fields = dict(base_fields)
        fields.update(
            _filter_fields(
                {
                    "error_reason": getattr(routing, "error_reason", None),
                }
            )
        )
        return PacketPayloadSchema(payload_type="routing", fields=fields)

    if getattr(packet_data, "port", None) == "TEXT_MESSAGE_APP" and packet_data.raw_payload:
        fields = dict(base_fields)
        fields["text"] = packet_data.raw_payload
        return PacketPayloadSchema(payload_type="text_message", fields=fields)

    raw_payload = packet_data.raw_payload or getattr(packet_data.packet, "raw_data", None)
    if raw_payload:
        fields = dict(base_fields)
        fields["raw_payload"] = raw_payload
        return PacketPayloadSchema(payload_type="raw", fields=fields)

    if base_fields:
        return PacketPayloadSchema(payload_type="metadata", fields=base_fields)

    return None
