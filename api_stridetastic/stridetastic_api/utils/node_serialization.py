from __future__ import annotations

from decimal import Decimal
from typing import Any

from ..models import Node
from ..schemas import NodeSchema


def _coerce(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    return value


def serialize_node(node: Node) -> NodeSchema:
    interface_names = list(node.interfaces.values_list("display_name", flat=True))  # type: ignore[attr-defined]
    return NodeSchema(
        id=node.pk,
        node_num=node.node_num,
        node_id=node.node_id,
        mac_address=node.mac_address,
        short_name=node.short_name,
        long_name=node.long_name,
        hw_model=node.hw_model,
        is_licensed=node.is_licensed,
        role=node.role,
        public_key=node.public_key,
        is_low_entropy_public_key=node.is_low_entropy_public_key,
        has_private_key=node.has_private_key,
        private_key_fingerprint=node.private_key_fingerprint,
        is_unmessagable=node.is_unmessagable,
        is_virtual=node.is_virtual,
        latitude=_coerce(node.latitude),
        longitude=_coerce(node.longitude),
        altitude=_coerce(node.altitude),
        position_accuracy=_coerce(node.position_accuracy),
        location_source=node.location_source,
        battery_level=node.battery_level,
        voltage=_coerce(node.voltage),
        channel_utilization=_coerce(node.channel_utilization),
        air_util_tx=_coerce(node.air_util_tx),
        uptime_seconds=node.uptime_seconds,
        temperature=_coerce(node.temperature),
        relative_humidity=_coerce(node.relative_humidity),
        barometric_pressure=_coerce(node.barometric_pressure),
        gas_resistance=_coerce(node.gas_resistance),
        iaq=_coerce(node.iaq),
        interfaces=interface_names,
        private_key_updated_at=node.private_key_updated_at,
        latency_reachable=node.latency_reachable,
        latency_ms=node.latency_ms,
        first_seen=node.first_seen,
        last_seen=node.last_seen,
    )
