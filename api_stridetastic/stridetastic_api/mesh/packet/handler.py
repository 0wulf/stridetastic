import logging
import base64
from datetime import datetime, timezone as dt_timezone
from decimal import Decimal, InvalidOperation
from typing import Optional, Any, cast
from json import dumps

from meshtastic.protobuf import mesh_pb2, portnums_pb2, telemetry_pb2

from ..encryption.aes import decrypt_packet

from ...models import (
    Node,
    NodeLatencyHistory,
    Channel,
    Interface,
    Edge,
    NodeLink,
)
from ...models.packet_models import (
    Packet,
    PacketData,
    NodeInfoPayload,
    PositionPayload,
    TelemetryPayload,
    RouteDiscoveryPayload,
    RouteDiscoveryRoute,
    RoutingPayload,
    NeighborInfoPayload,
    NeighborInfoNeighbor,
)

from ..utils import (
    num_to_id,
    num_to_mac,
    id_to_num,
    hw_num_to_model,
    role_num_ro_role, 
    error_reason_num_to_str,
)

from django.utils import timezone

BROADCAST_NODE_ID = "!ffffffff"
BROADCAST_NODE_NUM = int("ffffffff", 16)


def _get_or_update_node(
    *,
    node_num: int,
    node_id: Optional[str],
    mac_address: Optional[str],
) -> Node:
    """Fetch an existing node by number or create one with normalized identity fields."""
    normalized_mac = mac_address.upper() if mac_address else None
    defaults: dict[str, str] = {}
    if node_id is not None:
        defaults["node_id"] = node_id
    if normalized_mac is not None:
        defaults["mac_address"] = normalized_mac

    node, created = Node.objects.get_or_create(
        node_num=node_num,
        defaults=defaults,
    )
    if not created:
        update_fields: list[str] = []
        if node_id is not None and node.node_id != node_id:
            node.node_id = node_id
            update_fields.append("node_id")
        if normalized_mac is not None and node.mac_address != normalized_mac:
            node.mac_address = normalized_mac
            update_fields.append("mac_address")
        if update_fields:
            node.save(update_fields=update_fields)
    return node


def _decimal_from(value: Optional[float | int], *, places: Optional[int] = None) -> Optional[Decimal]:
    if value is None:
        return None
    try:
        decimal_value = Decimal(str(value))
        if places is not None:
            quantizer = Decimal("1").scaleb(-places)
            decimal_value = decimal_value.quantize(quantizer)
        return decimal_value
    except (InvalidOperation, ValueError, TypeError):
        return None


def _epoch_to_datetime(epoch: Optional[int | float]) -> Optional[datetime]:
    if epoch in (None, 0):
        return None
    try:
        return datetime.fromtimestamp(epoch, tz=dt_timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None


def _resolve_location_source(position: mesh_pb2.Position) -> Optional[str]:
    raw_value = getattr(position, "location_source", None)
    if raw_value is None:
        return None
    try:
        enum_value = int(raw_value)
        return mesh_pb2.Position.LocSource.Name(enum_value)  # type: ignore[arg-type]
    except (ValueError, TypeError):
        logging.debug("[Position] Unknown location source enum: %s", raw_value)
        return None
    except AttributeError:
        return None


def _update_latency_history(
    *,
    node: Node,
    probe_message_id: Optional[int],
    latency_ms: Optional[int],
    responded_at: Optional[datetime],
    request_time: Optional[datetime],
) -> None:
    """Persist the latency outcome, preferring to update the original pending probe row."""
    history_qs = NodeLatencyHistory.objects.filter(node=node)

    pending_entry: Optional[NodeLatencyHistory] = None
    if probe_message_id is not None:
        pending_entry = history_qs.filter(probe_message_id=probe_message_id).first()

    if pending_entry is None:
        pending_entry = (
            history_qs
            .filter(reachable=False, latency_ms__isnull=True, responded_at__isnull=True)
            .order_by("time")
            .first()
        )

    if pending_entry is not None:
        update_fields = ["reachable", "latency_ms", "responded_at"]
        pending_entry.reachable = True
        pending_entry.latency_ms = latency_ms
        pending_entry.responded_at = responded_at
        if pending_entry.probe_message_id is None and probe_message_id is not None:
            pending_entry.probe_message_id = probe_message_id
            update_fields.append("probe_message_id")
        pending_entry.save(update_fields=update_fields)
        return

    create_kwargs: dict[str, Any] = {
        "node": node,
        "reachable": True,
        "latency_ms": latency_ms,
        "probe_message_id": probe_message_id,
        "responded_at": responded_at,
    }
    if request_time is not None:
        create_kwargs["time"] = request_time
    NodeLatencyHistory.objects.create(**create_kwargs)


def _process_probe_response(packet_data: PacketData) -> None:
    """When an incoming packet is a response to a previously-sent probe/request,
    compute latency and persist history. This is a best-effort helper that will
    skip if the original request has already been marked as responded.
    """
    try:
        # print(f"[_process_probe_response] Processing packet_data={packet_data}")
        request_id = getattr(packet_data, 'request_id', None)
        if request_id is None:
            # print(f"[_process_probe_response] No request_id in packet_data={packet_data}")
            return

        # Find the original packet (the request) that this packet is responding to.
        ackd_packet = Packet.objects.filter(
            packet_id=request_id,
            to_node=packet_data.packet.from_node,
        ).select_related('to_node', 'data').first()

        if not ackd_packet:
            # print(f"[_process_probe_response] No original packet found for request_id={request_id}")
            return

        # If the original packet already marked as having got a response, skip.
        orig_data = getattr(ackd_packet, 'data', None)
        # if orig_data is not None and getattr(orig_data, 'got_response', False):
        #     print(f"[_process_probe_response] Original packet with request_id={request_id} already marked as responded")
        #     return

        # Mark original as responded
        if orig_data is not None:
            orig_data.got_response = True
            orig_data.save(update_fields=['got_response'])

        # Mark ack flag on original packet where appropriate
        try:
            ackd_packet.ackd = True
            ackd_packet.save(update_fields=['ackd'])
        except Exception:
            # non-fatal
            pass

        # Compute latency if possible and persist
        target_node = ackd_packet.to_node
        if target_node:
            request_time = getattr(ackd_packet, 'time', None)
            response_time = getattr(packet_data.packet, 'time', None)
            latency_ms = None
            if request_time and response_time:
                latency_delta = response_time - request_time
                latency_ms = max(0, int(latency_delta.total_seconds() * 1000))
            responded_at = response_time or timezone.now()
            Node.objects.filter(pk=target_node.pk).update(
                latency_reachable=True,
                latency_ms=latency_ms,
            )
            packet_id = getattr(ackd_packet, 'packet_id', None)
            _update_latency_history(
                node=target_node,
                probe_message_id=packet_id,
                latency_ms=latency_ms,
                responded_at=responded_at,
                request_time=request_time,
            )
    except Exception:
        logging.exception("Failed to process probe response latency")


def handle_nodeinfo(payload: bytes, packet_data: PacketData) -> None:
    user = mesh_pb2.User()
    user.ParseFromString(payload)
    hw_model_n = getattr(user, 'hw_model', None)
    hw_model = hw_num_to_model(hw_model_n)
    user_role_n = getattr(user, 'role', 0)
    role = role_num_ro_role(user_role_n)
    role = role if role else "CLIENT"
    node_num = id_to_num(user.id)
    macaddr = num_to_mac(node_num).upper()
    pubkey = base64.b64encode(user.public_key).decode('utf-8') if user.public_key else None
    logging.info(f"[NodeInfo]\n{user}")
    logging.info(f"[NodeInfo] node_num={node_num}, mac_address={macaddr}, hw_model={hw_model}, role={role}, public_key={pubkey}")
    node_info_payload, _ = NodeInfoPayload.objects.get_or_create(
        packet_data=packet_data,
    )
    node_info_payload.long_name = user.long_name if user.long_name else None
    node_info_payload.short_name = user.short_name if user.short_name else None
    node_info_payload.role = role
    node_info_payload.hw_model = hw_model if hw_model else None
    node_info_payload.public_key = pubkey if pubkey else None
    node_info_payload.save()
    node = Node.objects.filter(node_num=node_num).first()
    if node:
        node.long_name = user.long_name if user.long_name else None
        node.short_name = user.short_name if user.short_name else None
        node.hw_model = hw_model if hw_model else None
        node.role = role
        node.mac_address = str(macaddr) if macaddr else node.mac_address
        node.public_key = pubkey if pubkey else None
        node.save()

        if packet_data.request_id is not None:
            responded_packet = Packet.objects.filter(
                packet_id=packet_data.request_id,
                to_node=packet_data.packet.from_node,
            ).first()
            if responded_packet:
                responded_packet.data.got_response = True
                responded_packet.data.save()
                logging.info(f"[Routing] Acknowledged packet with request_id={packet_data.request_id} for node {packet_data.packet.from_node.node_num} ({packet_data.packet.from_node.node_id})")


def handle_neighborinfo(payload: bytes, packet_data: PacketData) -> None:
    neighbor_info = mesh_pb2.NeighborInfo()
    try:
        neighbor_info.ParseFromString(payload)
    except Exception as exc:
        logging.warning(f"[NeighborInfo] failed to decode: {exc}")
        return

    logging.info(f"[NeighborInfo] {neighbor_info}")

    packet_obj: Optional[Packet] = getattr(packet_data, "packet", None)
    reporting_node: Optional[Node] = getattr(packet_obj, "from_node", None)

    reporting_node_num: Optional[int] = neighbor_info.node_id or None
    reporting_node_id: Optional[str] = None
    if reporting_node_num:
        try:
            reporting_node_id = num_to_id(reporting_node_num)
        except ValueError:
            reporting_node_num = None

    if reporting_node_id and reporting_node_num is not None and not reporting_node:
        mac_address = num_to_mac(reporting_node_num)
        reporting_node = _get_or_update_node(
            node_num=reporting_node_num,
            node_id=reporting_node_id,
            mac_address=mac_address,
        )
    elif reporting_node:
        reporting_node_id = reporting_node.node_id

    if reporting_node:
        reporting_node.update_last_seen()

    last_sent_by_node: Optional[Node] = None
    last_sent_by_node_num: Optional[int] = None
    if neighbor_info.last_sent_by_id:
        last_sent_by_node_num = neighbor_info.last_sent_by_id
        try:
            last_sent_by_node_id = num_to_id(last_sent_by_node_num)
            mac_address = num_to_mac(last_sent_by_node_num)
            last_sent_by_node = _get_or_update_node(
                node_num=last_sent_by_node_num,
                node_id=last_sent_by_node_id,
                mac_address=mac_address,
            )
            last_sent_by_node.update_last_seen()
        except ValueError:
            logging.debug(f"[NeighborInfo] Invalid last_sent_by_id {neighbor_info.last_sent_by_id}")

    neighbor_payload, _ = NeighborInfoPayload.objects.get_or_create(packet_data=packet_data)
    neighbor_payload.reporting_node = reporting_node
    neighbor_payload.reporting_node_id_text = reporting_node_id
    neighbor_payload.last_sent_by_node = last_sent_by_node
    neighbor_payload.last_sent_by_node_num = last_sent_by_node_num
    neighbor_payload.node_broadcast_interval_secs = (
        neighbor_info.node_broadcast_interval_secs if neighbor_info.node_broadcast_interval_secs else None
    )
    neighbor_payload.save()

    # Refresh neighbor entries with latest report
    neighbor_payload.neighbors.all().delete()

    interfaces = list(packet_obj.interfaces.all()) if packet_obj else []

    for advertised in neighbor_info.neighbors:
        neighbor_node: Optional[Node] = None
        neighbor_node_num: Optional[int] = advertised.node_id or None
        neighbor_node_id: Optional[str] = None
        if neighbor_node_num is not None:
            try:
                neighbor_node_id = num_to_id(neighbor_node_num)
            except ValueError:
                neighbor_node_num = None

        if neighbor_node_num is not None:
            try:
                mac_address = num_to_mac(neighbor_node_num)
                neighbor_node = _get_or_update_node(
                    node_num=neighbor_node_num,
                    node_id=neighbor_node_id,
                    mac_address=mac_address,
                )
            except ValueError:
                logging.debug(f"[NeighborInfo] Invalid neighbor node num {neighbor_node_num}")
                neighbor_node_id = None
                neighbor_node_num = None

        if neighbor_node:
            neighbor_node.update_last_seen()

        snr_value = _decimal_from(advertised.snr, places=2)
        last_rx_time_raw = advertised.last_rx_time if advertised.last_rx_time else None
        last_rx_time_dt = _epoch_to_datetime(last_rx_time_raw)
        broadcast_interval = advertised.node_broadcast_interval_secs if advertised.node_broadcast_interval_secs else None

        NeighborInfoNeighbor.objects.create(
            payload=neighbor_payload,
            node=neighbor_node,
            advertised_node_id=neighbor_node_id,
            advertised_node_num=neighbor_node_num,
            snr=snr_value,
            last_rx_time=last_rx_time_dt,
            last_rx_time_raw=last_rx_time_raw,
            node_broadcast_interval_secs=broadcast_interval,
        )

        if reporting_node and neighbor_node:
            link_edge, _ = Edge.objects.get_or_create(
                source_node=neighbor_node,
                target_node=reporting_node,
            )
            if packet_obj:
                link_edge.last_packet = packet_obj  # type: ignore[assignment]
            link_edge.last_rx_snr = snr_value
            link_edge.last_hops = 0
            link_edge.save()
            if interfaces:
                link_edge.interfaces.add(*interfaces)

def handle_position(payload: bytes, packet_data: PacketData) -> None:
    pos = mesh_pb2.Position()
    pos.ParseFromString(payload)
    logging.info(f"[Position]\n{pos}")
    logging.info(f"[Position] lat={pos.latitude_i/1e7}, lon={pos.longitude_i/1e7}, alt={pos.altitude}, time={pos.time}")
    latitude_value = Decimal(pos.latitude_i).scaleb(-7) if pos.latitude_i else None
    longitude_value = Decimal(pos.longitude_i).scaleb(-7) if pos.longitude_i else None
    altitude_value = pos.altitude if pos.altitude else None
    accuracy_value = pos.precision_bits if pos.precision_bits else None
    seq_number_value = getattr(pos, "seq_number", None) or None
    location_source_value = _resolve_location_source(pos)
    position_payload, _ = PositionPayload.objects.get_or_create(
        packet_data=packet_data,
    )
    position_payload.latitude = latitude_value
    position_payload.longitude = longitude_value
    position_payload.altitude = altitude_value
    position_payload.accuracy = accuracy_value
    position_payload.seq_number = seq_number_value
    position_payload.location_source = location_source_value
    position_payload.save(update_fields=[
        "latitude",
        "longitude",
        "altitude",
        "accuracy",
        "seq_number",
        "location_source",
    ])
    node = Node.objects.filter(node_num=packet_data.packet.from_node.node_num).first()
    if node:
        update_fields: list[str] = []
        if latitude_value is not None:
            node.latitude = latitude_value
            update_fields.append("latitude")
        if longitude_value is not None:
            node.longitude = longitude_value
            update_fields.append("longitude")
        if altitude_value is not None:
            node.altitude = Decimal(str(altitude_value))
            update_fields.append("altitude")
        if accuracy_value is not None:
            node.position_accuracy = Decimal(str(accuracy_value))
            update_fields.append("position_accuracy")
        if location_source_value is not None:
            node.location_source = location_source_value
            update_fields.append("location_source")
        if update_fields:
            node.save(update_fields=update_fields)


def handle_range_test(payload: bytes, packet_data: PacketData) -> None:
    logging.info(f"[RangeTest] payload={payload}")
    

def handle_telemetry(payload: bytes, packet_data: PacketData) -> None:
    telemetry = telemetry_pb2.Telemetry()
    try:
        telemetry.ParseFromString(payload)
        logging.info(f"[Telemetry]\n{telemetry}")
        if telemetry.HasField('device_metrics'):
            device_metrics = telemetry.device_metrics
            voltage = round(device_metrics.voltage, 2) if device_metrics.voltage else None
            channel_utilization = round(device_metrics.channel_utilization, 2) if device_metrics.channel_utilization else None
            air_util_tx = round(device_metrics.air_util_tx, 2) if device_metrics.air_util_tx else None
            logging.info(f"[Telemetry] device_metrics: battery_level={device_metrics.battery_level}, voltage={voltage}, channel_utilization={channel_utilization}, air_util_tx={air_util_tx}, uptime_seconds={device_metrics.uptime_seconds}")
            telemetry_payload, _ = TelemetryPayload.objects.get_or_create(
                packet_data=packet_data,
            )
            telemetry_payload.battery_level = device_metrics.battery_level if device_metrics.battery_level else None
            telemetry_payload.voltage = voltage
            telemetry_payload.channel_utilization = channel_utilization
            telemetry_payload.air_util_tx = air_util_tx
            telemetry_payload.uptime_seconds = device_metrics.uptime_seconds if device_metrics.uptime_seconds else None
            telemetry_payload.save()
            from_node = packet_data.packet.from_node
            if from_node:
                from_node.battery_level = device_metrics.battery_level if device_metrics.battery_level else None
                from_node.voltage = voltage
                from_node.channel_utilization = channel_utilization
                from_node.air_util_tx = air_util_tx
                from_node.uptime_seconds = device_metrics.uptime_seconds if device_metrics.uptime_seconds else None
                from_node.save()
    
        if telemetry.HasField('environment_metrics'):
            env_metrics = telemetry.environment_metrics
            temperature = round(env_metrics.temperature, 2) if env_metrics.temperature else None
            relative_humidity = round(env_metrics.relative_humidity, 2) if env_metrics.relative_humidity else None
            barometric_pressure = round(env_metrics.barometric_pressure, 2) if env_metrics.barometric_pressure else None
            gas_resistance = round(env_metrics.gas_resistance, 2) if env_metrics.gas_resistance else None
            iaq = round(env_metrics.iaq, 2) if env_metrics.iaq else None
            logging.info(f"[Telemetry] environment_metrics: temperature={temperature}, relative_humidity={relative_humidity}, barometric_pressure={barometric_pressure}, gas_resistance={gas_resistance}, iaq={iaq}")
            telemetry_payload, _ = TelemetryPayload.objects.get_or_create(
                packet_data=packet_data,
            )
            telemetry_payload.temperature = temperature
            telemetry_payload.relative_humidity = relative_humidity
            telemetry_payload.barometric_pressure = barometric_pressure
            telemetry_payload.gas_resistance = gas_resistance
            telemetry_payload.iaq = iaq
            telemetry_payload.save()
            from_node = packet_data.packet.from_node
            if from_node:
                from_node.temperature = temperature
                from_node.relative_humidity = relative_humidity
                from_node.barometric_pressure = barometric_pressure
                from_node.gas_resistance = gas_resistance
                from_node.iaq = iaq
                from_node.save()
        return 
    except Exception as e:
        logging.warning(f"[Telemetry] failed to decode: {e}")


# This one needs a rework, as 
def handle_route_discovery(payload: bytes, packet_data: PacketData) -> None:
    route_discovery = mesh_pb2.RouteDiscovery()
    try:
        route_discovery.ParseFromString(payload)
        logging.info(f"[RouteDiscovery] route={route_discovery.route}")
        logging.info(f"[RouteDiscovery] {route_discovery}")
    except Exception as e:
        logging.warning(f"[RouteDiscovery] failed to decode: {e}")

    route_nums = list(route_discovery.route)
    route_back_nums = list(route_discovery.route_back)
    broadcast_present = any(node_num == BROADCAST_NODE_NUM for node_num in route_nums)
    broadcast_present = broadcast_present or any(node_num == BROADCAST_NODE_NUM for node_num in route_back_nums)

    if broadcast_present:
        logging.warning(
            f"[RouteDiscovery] Broadcast address {BROADCAST_NODE_ID} detected in traceroute; "
            "ignoring only broadcast-specific nodes/edges"
        )

    
    if packet_data.request_id == 0:
        route_towards_nodes = []
        route_node_towards_list = [packet_data.packet.from_node.node_id] + [
            num_to_id(node_num) for node_num in route_discovery.route
        ]
        sanitized_route_node_list = [
            node_id for node_id in route_node_towards_list if node_id != BROADCAST_NODE_ID
        ]
        route_towards_hops = 0
        snr_towards = [i/4 for i in route_discovery.snr_towards]

        route_discovery_route_towards, _ = RouteDiscoveryRoute.objects.get_or_create(
            node_list=dumps(sanitized_route_node_list),
        )
        for node_id in route_node_towards_list:
            if node_id == BROADCAST_NODE_ID:
                continue
            node_num = id_to_num(node_id)
            node_id = num_to_id(node_num)
            node_mac = num_to_mac(node_num)
            node = _get_or_update_node(
                node_num=node_num,
                node_id=node_id,
                mac_address=node_mac,
            )
            node.update_last_seen()
            route_towards_nodes.append(node)
            route_towards_hops += 1
        route_discovery_route_towards.nodes.add(*route_towards_nodes)
        route_discovery_route_towards.hops = route_towards_hops
        route_discovery_route_towards.save()
            
        route_discovery_payload, _ = RouteDiscoveryPayload.objects.get_or_create(
            packet_data=packet_data,
        )
        route_discovery_payload.route_towards = route_discovery_route_towards
        route_discovery_payload.snr_towards = snr_towards
        route_discovery_payload.save()

        # # Create edges
        # logging.info(f"[Routing] Creating edges for route towards: {route_node_towards_list}, {route_towards_nodes}, SNR: {snr_towards}")
        # for i in range(len(route_towards_nodes) - 1):
        #     source_node = route_towards_nodes[i]
        #     target_node = route_towards_nodes[i + 1]
        #     link_edge, _ = Edge.objects.get_or_create(
        #         source_node=source_node,
        #         target_node=target_node,
        #     )
        #     link_edge.last_packet = packet_data.packet
        #     link_edge.last_rx_rssi = 0
        #     link_edge.last_rx_snr = snr_towards[i]
        #     link_edge.last_hops = 0
        #     link_edge.save()
            
    else:
        ackd_packet = Packet.objects.filter(
            packet_id=packet_data.request_id,
            to_node=packet_data.packet.from_node,
        ).first()
        if ackd_packet:
            ackd_packet.ackd = True
            ackd_packet.save()
            ackd_packet.data.got_response = True
            ackd_packet.data.save()

            if packet_data.request_id is not None:
                ackd_packet.data.got_response = True
                ackd_packet.data.save()
            logging.info(f"[Routing] Acknowledged packet with request_id={packet_data.request_id} for node {packet_data.packet.from_node.node_num} ({packet_data.packet.from_node.node_id})")

            target_node = ackd_packet.to_node
            if target_node:
                request_time = getattr(ackd_packet, "time", None)
                response_time = getattr(packet_data.packet, "time", None)
                latency_ms: Optional[int] = None
                if request_time and response_time:
                    latency_delta = response_time - request_time
                    latency_ms = max(0, int(latency_delta.total_seconds() * 1000))
                responded_at = response_time or timezone.now()
                Node.objects.filter(pk=target_node.pk).update(
                    latency_reachable=True,
                    latency_ms=latency_ms,
                )
                packet_id = getattr(ackd_packet, "packet_id", None)
                _update_latency_history(
                    node=target_node,
                    probe_message_id=packet_id,
                    latency_ms=latency_ms,
                    responded_at=responded_at,
                    request_time=request_time,
                )


            route_node_list = [ackd_packet.from_node.node_id] + [
                num_to_id(node_num) for node_num in route_discovery.route
            ] + [packet_data.packet.from_node.node_id]
            route_snr_list = [i/4 for i in route_discovery.snr_towards]
            route_node_back_list = [packet_data.packet.from_node.node_id] + [
                num_to_id(node_num) for node_num in route_discovery.route_back
            ]
            snr_back_list = [i/4 for i in route_discovery.snr_back]

            route_nodes = []
            route_back_nodes = []

            for node_id in route_node_list:
                if node_id == BROADCAST_NODE_ID:
                    route_nodes.append(None)
                    continue
                node_num = id_to_num(node_id)
                node_id = num_to_id(node_num)
                node_mac = num_to_mac(node_num)
                node = _get_or_update_node(
                    node_num=node_num,
                    node_id=node_id,
                    mac_address=node_mac,
                )
                node.update_last_seen()
                route_nodes.append(node)

            for node_id in route_node_back_list:
                if node_id == BROADCAST_NODE_ID:
                    route_back_nodes.append(None)
                    continue
                node_num = id_to_num(node_id)
                node_id = num_to_id(node_num)
                node_mac = num_to_mac(node_num)
                node = _get_or_update_node(
                    node_num=node_num,
                    node_id=node_id,
                    mac_address=node_mac,
                )
                node.update_last_seen()
                route_back_nodes.append(node)

            # Collapse broadcast placeholders into synthetic hop segments so we can
            # persist edges between known nodes while tracking how many unknown hops
            # occurred in between.
            def build_edge_segments(nodes: list[Optional[Node]], snr_values: list[float]) -> list[tuple[Node, Node, Optional[float], int]]:
                segments: list[tuple[Node, Node, Optional[float], int]] = []
                last_known_index: Optional[int] = None
                unknown_between = 0
                total_nodes = len(nodes)

                for index, node in enumerate(nodes):
                    if node is None:
                        if last_known_index is not None and index < total_nodes - 1:
                            unknown_between += 1
                        continue

                    if last_known_index is None:
                        last_known_index = index
                        unknown_between = 0
                        continue

                    source_index = last_known_index
                    hop_count = unknown_between

                    if hop_count == 0 and source_index >= len(snr_values):
                        last_known_index = index
                        unknown_between = 0
                        continue

                    snr_value: Optional[float] = None
                    if hop_count == 0 and source_index < len(snr_values):
                        snr_value = snr_values[source_index]

                    source_node = nodes[source_index]
                    target_node = node
                    if source_node is not None and target_node is not None:
                        segments.append((source_node, target_node, snr_value, hop_count))

                    last_known_index = index
                    unknown_between = 0

                return segments

            def persist_edge_segments(segments: list[tuple[Node, Node, Optional[float], int]]) -> None:
                for source_node, target_node, snr_value, hop_count in segments:
                    link_edge, _ = Edge.objects.get_or_create(
                        source_node=source_node,
                        target_node=target_node,
                    )
                    link_edge.last_packet = ackd_packet
                    link_edge.last_rx_rssi = 0
                    link_edge.last_rx_snr = _decimal_from(snr_value, places=2)
                    link_edge.last_hops = hop_count
                    link_edge.save()

            logging.info(f"[Routing] Creating edges for route: {route_node_list}, {route_nodes}, SNR: {route_snr_list}")
            forward_segments = build_edge_segments(route_nodes, route_snr_list)
            persist_edge_segments(forward_segments)

            logging.info(f"[Routing] Creating edges for route back: {route_node_back_list}, {route_back_nodes}, SNR: {snr_back_list}")
            backward_segments = build_edge_segments(route_back_nodes, snr_back_list)
            persist_edge_segments(backward_segments)
                


            # route_discovery_route_back, _ = RouteDiscoveryRoute.objects.get_or_create(
            #     node_list=dumps(route_node_back_list),
            # )
            # for node_id in route_node_back_list:
            #     node_num = id_to_num(node_id)
            #     node_id = num_to_id(node_num)
            #     node_mac = num_to_mac(node_num)
            #     node, _ = Node.objects.get_or_create(
            #         node_num=node_num,
            #         node_id=node_id,
            #         mac_address=node_mac,
            #     )
            #     route_back_nodes.append(node)
            #     route_back_hops += 1
            # route_discovery_route_back.nodes.add(*route_back_nodes)
            # route_discovery_route_back.hops = route_back_hops
            # route_discovery_route_back.save()

            # route_discovery_payload, _ = RouteDiscoveryPayload.objects.get_or_create(
            #     packet_data=ackd_packet.data,
            # )
            # route_discovery_payload.route_back = route_discovery_route_back
            # route_discovery_payload.snr_back = snr_back
            # route_discovery_payload.save()





def handle_routing(payload: bytes, packet_data: PacketData) -> None:
    routing = mesh_pb2.Routing()
    try:
        routing.ParseFromString(payload)
        logging.info(f"[Routing] routing={routing}")
    except Exception as e:
        logging.warning(f"[Routing] failed to decode: {e}")

    routing_payload, _ = RoutingPayload.objects.get_or_create(
        packet_data=packet_data,
    )
    try:
        error_reason_num = getattr(routing, 'error_reason', None)
        error_reason = error_reason_num_to_str(error_reason_num)
        routing_payload.error_reason = error_reason
        routing_payload.save()
    except Exception as e:
        logging.warning(f"[Routing] failed to decode error_reason: {e}")
        routing_payload.error_reason = None
    # routing_payload.request_id = getattr(routing, 'request_id', None)
    # routing_payload.reply_id = getattr(routing, 'reply_id', None)

    if packet_data.request_id is not None and not error_reason:
        ackd_packet = Packet.objects.filter(
            packet_id=packet_data.request_id,
            to_node=packet_data.packet.from_node,
        ).select_related("to_node").first()
        if ackd_packet:
            ackd_packet.ackd = True
            ackd_packet.save(update_fields=["ackd"])
            if hasattr(ackd_packet, "data") and ackd_packet.data is not None:
                ackd_packet.data.got_response = True
                ackd_packet.data.save(update_fields=["got_response"])

            packet_data.got_response = True
            packet_data.save(update_fields=["got_response"])

            logging.info(
                f"[Routing] Acknowledged packet with request_id={packet_data.request_id} for node {packet_data.packet.from_node.node_num} ({packet_data.packet.from_node.node_id})"
            )

            target_node = ackd_packet.to_node
            if target_node:
                request_time = getattr(ackd_packet, "time", None)
                response_time = getattr(packet_data.packet, "time", None)
                latency_ms: Optional[int] = None
                if request_time and response_time:
                    latency_delta = response_time - request_time
                    latency_ms = max(0, int(latency_delta.total_seconds() * 1000))
                responded_at = response_time or timezone.now()
                Node.objects.filter(pk=target_node.pk).update(
                    latency_reachable=True,
                    latency_ms=latency_ms,
                )
                packet_id = getattr(ackd_packet, "packet_id", None)
                _update_latency_history(
                    node=target_node,
                    probe_message_id=packet_id,
                    latency_ms=latency_ms,
                    responded_at=responded_at,
                    request_time=request_time,
                )
        

def handle_text_message(payload: bytes, packet_data: PacketData) -> None:
    text_message = payload.decode('utf-8', errors='ignore')
    logging.info(f"[TextMessage] {text_message}")
    packet_data.raw_payload = text_message
    packet_data.save()


def handle_other(portnum: int, payload: bytes) -> None:
    logging.info(f"[Other] portnum={portnum} payload={payload}")


def handle_decoded_packet(
    from_node: Node,
    to_node: Node,
    packet: mesh_pb2.MeshPacket,
    decoded_data: mesh_pb2.Data,
    packet_obj: Packet,
):
    from_node_number = from_node.node_num
    from_node_id = from_node.node_id
    from_node_shortname = from_node.short_name
    from_node_longname = from_node.long_name

    to_node_number = to_node.node_num
    to_node_id = to_node.node_id
    to_node_shortname = to_node.short_name
    to_node_longname = to_node.long_name

    portnum = decoded_data.portnum
    port = portnums_pb2.PortNum.Name(decoded_data.portnum) if decoded_data.portnum in portnums_pb2.PortNum.values() else None
    want_response = decoded_data.want_response if hasattr(decoded_data, 'want_response') else None
    got_response = False if want_response is True else None
    data_obj, _ = PacketData.objects.get_or_create(
        packet=packet_obj,
    )
    request_id = getattr(decoded_data, 'request_id', None)
    data_obj.portnum = portnum
    data_obj.port = port
    data_obj.source = decoded_data.source if hasattr(decoded_data, 'source') else None
    data_obj.dest = decoded_data.dest if hasattr(decoded_data, 'dest') else None
    data_obj.request_id = request_id
    data_obj.reply_id = decoded_data.reply_id if hasattr(decoded_data, 'reply_id') else None
    data_obj.want_response = want_response
    data_obj.got_response = got_response
    data_obj.save()
        

    logging.info(f"[Packet] from: {from_node_number} ({from_node_id}, {from_node_shortname}, {from_node_longname}) >-- port:{port} --> to: {to_node_number} ({to_node_id}, {to_node_shortname}, {to_node_longname})")
    logging.info(f"[Packet] decoded={decoded_data}")

    match decoded_data.portnum:
        case portnums_pb2.NODEINFO_APP:
            handle_nodeinfo(decoded_data.payload, data_obj)
        case portnums_pb2.NEIGHBORINFO_APP:
            handle_neighborinfo(decoded_data.payload, data_obj)
        case portnums_pb2.POSITION_APP:
            handle_position(decoded_data.payload, data_obj)
        case portnums_pb2.RANGE_TEST_APP:
            handle_range_test(decoded_data.payload, data_obj)
        case portnums_pb2.TELEMETRY_APP:
            handle_telemetry(decoded_data.payload, data_obj)
        case portnums_pb2.TRACEROUTE_APP:
            handle_route_discovery(decoded_data.payload, data_obj)
        case portnums_pb2.ROUTING_APP:
            handle_routing(decoded_data.payload, data_obj)
        case portnums_pb2.TEXT_MESSAGE_APP:
            handle_text_message(decoded_data.payload, data_obj)
        case _:
            handle_other(decoded_data.portnum, data_obj)

    # After handlers run, perform generic processing of response-based latency
    # This will compute latency for packets that are replies to earlier
    # request-style packets (including ones with Data.want_response).
    try:
        _process_probe_response(data_obj)
        # Mark this incoming packet as having been a response
        data_obj.got_response = True
        data_obj.save(update_fields=['got_response'])
    except Exception:
        # _process_probe_response already logs failures; don't escalate here
        pass

    return (packet, decoded_data, portnum, from_node, to_node, packet_obj)


def handle_packet(
        packet: mesh_pb2.MeshPacket,
        from_node: Node,
        to_node: Node,
        packet_obj: Packet,
        key: Optional[str] = 'AQ==',
        pki_encrypted: bool = False,
):
    if packet.HasField('decoded'):
        packet, decoded_data, portnum, from_node, to_node, packet_obj = handle_decoded_packet(
            from_node=from_node,
            to_node=to_node,
            packet=packet,
            decoded_data=packet.decoded,
            packet_obj=packet_obj,
        )
    elif packet.HasField('encrypted'):
        if not pki_encrypted:
            if key is not None:
                payload = decrypt_packet(packet, key)
                if payload is not None:
                    packet, decoded_data, portnum, from_node, to_node, packet_obj = handle_decoded_packet(
                        from_node=from_node,
                        to_node=to_node,
                        packet=packet,
                        decoded_data=payload,
                        packet_obj=packet_obj,
                    )
                    # return
                else:
                    logging.info(f"[Encrypted] Could not decrypt packet")
            else:
                logging.info(f"[Encrypted] No key provided for decryption.")
        else:
            logging.info("[PKI] Attempting decryption via PKI service")
            packet_obj.pki_encrypted = True
            try:
                from ...services.service_manager import ServiceManager

                manager = ServiceManager.get_instance()
                pki_service = manager.get_pki_service() or manager.initialize_pki_service()
            except Exception as exc:  # pragma: no cover - defensive logging
                logging.warning(f"[PKI] Failed to resolve PKI service: {exc}")
                pki_service = None

            if pki_service is not None:
                result = pki_service.decrypt_packet(packet, to_node)
                if result.success and result.plaintext is not None:
                    data = mesh_pb2.Data()
                    data.ParseFromString(result.plaintext)
                    packet, decoded_data, portnum, from_node, to_node, packet_obj = handle_decoded_packet(
                        from_node=from_node,
                        to_node=to_node,
                        packet=packet,
                        decoded_data=data,
                        packet_obj=packet_obj,
                    )
                else:
                    logging.info(f"[PKI] Decryption skipped: {result.reason}")
            else:
                logging.info("[PKI] Service unavailable; packet left encrypted")
    else:
        logging.info(f"[Unknown] Packet has no decoded or encrypted payload.")
        logging.info(f"[Unknown] Packet:\n{packet}")
    packet_obj.raw_data = base64.b64encode(packet.encrypted).decode('utf-8') if packet.HasField('encrypted') else None
    packet_obj.save()

    return packet, decoded_data, portnum, from_node, to_node, packet_obj

# Internal helper extracted for easier testing of service dispatch logic
def _dispatch_to_publisher_service(packet, decoded_data, portnum, from_node, to_node, packet_obj):
    try:
        from ...services.service_manager import ServiceManager
        service_manager = ServiceManager.get_instance()
        publisher_service = service_manager.get_publisher_service()

        if publisher_service is None:
            publisher_service = service_manager.initialize_publisher_service()

        if publisher_service:
            publisher_service.on_packet_received(
                packet=packet,
                decoded_data=decoded_data,
                portnum=portnum,
                from_node=from_node,
                to_node=to_node,
                packet_obj=packet_obj
            )
    except Exception as e:
        logging.error(f"Error in publisher service reaction: {e}")


def on_message(client, userdata, normalized, iface="MQTT"):
    interface_id = normalized.get('interface_id') if isinstance(normalized, dict) else None
    if interface_id:
        interface = Interface.objects.filter(id=interface_id).first()
        if not interface:
            interface, _ = Interface.objects.get_or_create(name=iface, defaults={"display_name": f"{iface.lower()}-{interface_id}"})
    else:
        # Legacy path: create/reuse by type name
        interface, _ = Interface.objects.get_or_create(name=iface, defaults={"display_name": f"{iface.lower()}-default"})
    gateway_node_id = normalized['gateway_node_id']
    channel_id = normalized['channel_id']
    packet = normalized['packet']

    gateway_node = None  # ensure defined even if no gateway info
    if interface.name == "SERIAL":
        serial_node = interface.serial_node
        if serial_node:
            gateway_node_id = serial_node.node_id
    gateway_node_num = id_to_num(gateway_node_id) if gateway_node_id else 0
    gateway_node_mac = num_to_mac(gateway_node_num).upper()
    

    from_node_num = getattr(packet, 'from', 0)
    from_node_id = num_to_id(from_node_num)
    from_node_mac = num_to_mac(from_node_num).upper()
    to_node_num = getattr(packet, 'to', 0)
    to_node_id = num_to_id(to_node_num)
    to_node_mac = num_to_mac(to_node_num).upper()
    packet_id = getattr(packet, 'id', None)
    channel_num = getattr(packet, 'channel', None)
    rx_rssi_raw = getattr(packet, 'rx_rssi', None)
    rx_rssi = int(round(rx_rssi_raw)) if rx_rssi_raw is not None else None
    rx_snr_raw = getattr(packet, 'rx_snr', None)
    rx_snr = _decimal_from(rx_snr_raw, places=2) if rx_snr_raw is not None else None
    rx_time = getattr(packet, 'rx_time', None)
    hop_limit = getattr(packet, 'hop_limit', None)
    hop_start = getattr(packet, 'hop_start', None)
    hops = 0 if hop_limit is None else (hop_start - hop_limit) if hop_start is not None else 0
    first_hop = getattr(packet, 'first_hop', None)
    next_hop = getattr(packet, 'next_hop', None)
    pki_encrypted = getattr(packet, 'pki_encrypted', False) or channel_id == 'PKI'
    want_ack = getattr(packet, 'want_ack', None)
    ackd = False if want_ack is True else None
    relay_node = getattr(packet, 'relay_node', None)
    delayed = getattr(packet, 'delayed', False)
    via_mqtt = True if iface=='MQTT' else getattr(packet, 'via_mqtt', False)
    public_key = getattr(packet, 'public_key', None)
    priority = getattr(packet, 'priority', None)


    from_node = _get_or_update_node(
        node_num=from_node_num,
        node_id=from_node_id,
        mac_address=from_node_mac,
    )
    from_node.update_last_seen()
    from_node.interfaces.add(interface)
    from_node.save()
    if gateway_node_id is not None:
        gateway_node = _get_or_update_node(
            node_num=gateway_node_num,
            node_id=gateway_node_id,
            mac_address=gateway_node_mac,
        )
        gateway_node.update_last_seen()
        gateway_node.interfaces.add(interface)
        gateway_node.save()
    logging.info(f"[Packet] To node: {to_node_num} ({to_node_id}, {to_node_mac})")
    to_node = _get_or_update_node(
        node_num=to_node_num,
        node_id=to_node_id,
        mac_address=to_node_mac,
    )
    

    channel, _ = Channel.objects.get_or_create(
        channel_id=channel_id,
        channel_num=channel_num,
    )
    channel.interfaces.add(interface)
    channel.members.add(from_node)
    channel.members.add(to_node)
    channel.save()

    packet_obj, _ = Packet.objects.get_or_create(
        packet_id=packet_id,
        from_node=from_node,
        to_node=to_node,
    )
    packet_obj.interfaces.add(interface)
    packet_obj.save()

    def _set_field(field_name: str, value: Any):
        if hasattr(packet_obj, field_name):
            setattr(packet_obj, field_name, value)
    _set_field('rx_rssi', rx_rssi)
    _set_field('rx_snr', rx_snr)
    _set_field('rx_time', rx_time)
    _set_field('hop_limit', hop_limit)
    _set_field('hop_start', hop_start)
    _set_field('first_hop', first_hop)
    _set_field('next_hop', next_hop)
    _set_field('relay_node', relay_node)
    _set_field('want_ack', want_ack)
    _set_field('ackd', ackd)
    _set_field('priority', priority)
    _set_field('delayed', delayed)
    _set_field('via_mqtt', via_mqtt)
    _set_field('pki_encrypted', pki_encrypted)
    _set_field('public_key', public_key)

    packet_obj.channels.add(channel)
    packet_obj.gateway_nodes.add(gateway_node) if gateway_node_id else None
    packet_obj.save()

    NodeLink.objects.record_activity(
        from_node=from_node,
        to_node=to_node,
        packet=packet_obj,
        channel=channel,
    )

    # Replace edge creation to handle absence of gateway_node
    target_for_edge = gateway_node if gateway_node else None
    if target_for_edge is not None:
        link_edge, _ = Edge.objects.get_or_create(
            source_node=from_node,
            target_node=target_for_edge
        )
        link_edge.last_packet = packet_obj  # type: ignore[assignment]
        link_edge.last_rx_rssi = rx_rssi
        link_edge.last_rx_snr = rx_snr
        link_edge.last_hops = hops
        link_edge.save()


    logging.info(f"[Packet] from: {from_node_num} ({from_node_id}, {from_node_mac}) >----> to: {to_node_num} ({to_node_id}, {to_node_mac})")
    
    packet, decoded_data, portnum, from_node, to_node, packet_obj = handle_packet(
        packet=packet,
        from_node=from_node,
        to_node=to_node,
        packet_obj=packet_obj,
        key=channel.psk if channel.psk else "AQ==",
        pki_encrypted=pki_encrypted,
    )

    # After packet processing, check if publisher service should react
    _dispatch_to_publisher_service(
        packet=packet,
        decoded_data=decoded_data,
        portnum=portnum,
        from_node=from_node,
        to_node=to_node,
        packet_obj=packet_obj,
    )

    return packet, decoded_data, portnum, from_node, to_node, packet_obj