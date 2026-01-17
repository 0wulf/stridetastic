from __future__ import annotations

from typing import Optional, Tuple

from meshtastic.protobuf import portnums_pb2  # type: ignore[attr-defined]

from ..models.packet_models import PacketData

_PORT_LABEL_OVERRIDES = {
    "TEXT_MESSAGE_APP": "Text Message",
    "POSITION_APP": "Position",
    "NODEINFO_APP": "Node Info",
    "TELEMETRY_APP": "Telemetry",
    "TRACEROUTE_APP": "Traceroute",
    "ROUTING_APP": "Routing",
}

_PORT_CHOICE_LABELS = dict(PacketData._meta.get_field("port").choices)


def _humanize_port_name(port_name: str) -> str:
    pretty = port_name.replace("_", " ").title()
    if pretty.endswith(" App"):
        pretty = pretty[:-4]
    return pretty


def resolve_port_identity(
    port: Optional[str], portnum: Optional[int]
) -> Tuple[str, str]:
    """Return a canonical port key and display label for the given values."""
    if port:
        label = _PORT_CHOICE_LABELS.get(port) or _PORT_LABEL_OVERRIDES.get(port)
        if not label:
            label = _humanize_port_name(port)
        return port, label

    if portnum is not None:
        try:
            name = portnums_pb2.PortNum.Name(portnum)
        except ValueError:
            name = f"UNKNOWN_{portnum}"
        label = _PORT_CHOICE_LABELS.get(name) or _PORT_LABEL_OVERRIDES.get(name)
        if not label:
            label = _humanize_port_name(name)
        return name, label

    return "UNKNOWN", "Unknown"
