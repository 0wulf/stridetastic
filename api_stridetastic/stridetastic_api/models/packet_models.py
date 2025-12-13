# https://github.com/meshtastic/python/blob/master/meshtastic/protobuf/mesh_pb2.pyi

from django.db import models
from timescale.db.models.models import TimescaleModel


class Ports(models.TextChoices):
    TEXT_MESSAGE = 'TEXT_MESSAGE_APP', 'Text Message App'
    POSITION = 'POSITION_APP', 'Position'
    NODEINFO = 'NODEINFO_APP', 'Node Info'
    NEIGHBORINFO = 'NEIGHBORINFO_APP', 'Neighbor Info'
    TELEMETRY = 'TELEMETRY_APP', 'Telemetry'
    TRACEROUTE_APP = 'TRACEROUTE_APP', 'Traceroute'
    ROUTING_APP = 'ROUTING_APP', 'Routing'
    

class Packet(TimescaleModel):
    """
    Represents a Meshtastic packet.
    """
    time = models.DateTimeField(auto_now_add=True, help_text="Timestamp when the packet was received.")

    from_node = models.ForeignKey(
        'Node', 
        on_delete=models.CASCADE, 
        related_name='packets_sent', 
        help_text="The node that sent the packet."
    )
    gateway_nodes = models.ManyToManyField(
        'Node',
        related_name='packets_gatewayed',
        blank=True,
        help_text="The nodes that acted as gateways for the packet, if applicable."
    )
    to_node = models.ForeignKey(
        'Node', 
        on_delete=models.CASCADE, 
        related_name='packets_received',
        help_text="The node that received the packet."
    )
    channels = models.ManyToManyField(
        'Channel',
        related_name='packets',
        help_text="The channels through which the packet was sent."
    )

    # Packet
    raw_data = models.CharField(max_length=512, blank=True, null=True, help_text="Raw data of the packet not saved in a specific field.")
    packet_id = models.BigIntegerField(blank=True, null=True, help_text="Identifier for the packet.")
    rx_time = models.BigIntegerField(blank=True, null=True, help_text="Time when the packet was received (secs since 1970).")
    rx_rssi = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, help_text="Received Signal Strength Indicator (RSSI) of the packet.")
    rx_snr = models.DecimalField(max_digits=4, decimal_places=2, blank=True, null=True, help_text="Signal-to-Noise Ratio (SNR) of the packet.")
    hop_limit = models.IntegerField(blank=True, null=True, help_text="Hop limit for the packet.")
    hop_start = models.IntegerField(blank=True, null=True, help_text="Hop start for the packet.")
    first_hop = models.IntegerField(blank=True, null=True, help_text="First hop for the packet.")
    next_hop = models.IntegerField(blank=True, null=True, help_text="Next hop for the packet.")
    relay_node = models.IntegerField(blank=True, null=True, help_text="Node that relayed the packet, if applicable.")
    want_ack = models.BooleanField(blank=True, null=True,  help_text="Indicates if an acknowledgment is requested for the packet.")
    ackd = models.BooleanField(blank=True, null=True, help_text="Indicates if the packet has been acknowledged.")
    priority = models.CharField(max_length=32, blank=True, null=True, help_text="Priority of the packet (e.g., 'BACKGROUND', 'ACK').")
    delayed = models.BooleanField(blank=True, null=True, help_text="Indicates if the packet is delayed.")
    via_mqtt = models.BooleanField(blank=True, null=True, help_text="Indicates if the packet was sent via MQTT.")
    pki_encrypted = models.BooleanField(blank=True, null=True, help_text="Indicates if the packet is encrypted using PKI.")
    public_key = models.CharField(max_length=255, blank=True, null=True, help_text="Public key used for encrypting the packet, if applicable.")

    interfaces = models.ManyToManyField(
        'stridetastic_api.Interface',
        related_name='packets_listened',
        blank=True,
        help_text="Interfaces where this packet has been listened to."
    )

    class Meta:
        verbose_name = "Packet"
        verbose_name_plural = "Packets"
        ordering = ['time',]

class PacketData(TimescaleModel):
    """
    Represents the data contained in a Meshtastic packet.
    This model is linked to one and only one Packet entity and contains specific fields for the packet data.
    A Packet entity may exist without a PacketData entity, but a PacketData entity must always be linked to a Packet.
    """
    time = models.DateTimeField(auto_now_add=True, help_text="Timestamp when the packet data was received.")
    
    packet = models.OneToOneField(
        Packet,
        on_delete=models.CASCADE,
        related_name='data',
        help_text="The packet to which this data protobuf representation belongs. This field is required and must be unique."
    )

    # Data
    portnum = models.IntegerField(blank=True, null=True, help_text="Port number of the packet data.")
    port = models.CharField(
        max_length=32,
        choices=Ports.choices,
        blank=True,
        null=True,
        help_text="Port type of the packet data, indicating the type of data contained in the packet."
    )
    raw_payload = models.CharField(max_length=255, blank=True, null=True, help_text="Raw payload of the packet data not saved in a specific field.")
    source = models.BigIntegerField(blank=True, null=True, help_text="The address of the original sender for this message. This field should _only_ be populated for reliable multihop packets (to keep packets small).")
    dest = models.BigIntegerField(blank=True, null=True, help_text="The address of the destination node. This field is is filled in by the mesh radio device software, application layer software should never need it. RouteDiscovery messages _must_ populate this. Other message types might need to if they are doing multihop routing.")
    request_id = models.BigIntegerField(blank=True, null=True, help_text="Request ID for the packet data. Indicates the original message ID that this message is reporting failure on.")
    reply_id = models.BigIntegerField(blank=True, null=True, help_text="Reply ID for the packet data. Indicates the original message ID that this message is replying to.")
    want_response = models.BooleanField(blank=True, null=True, help_text="Indicates if a response is requested for the packet data.")
    got_response = models.BooleanField(blank=True, null=True, help_text="Indicates if a response has been received for the packet data.")

    class Meta:
        verbose_name = "Packet Data"
        verbose_name_plural = "Packets Data"
        ordering = ['time',]

class NodeInfoPayload(TimescaleModel):
    """
    Represents the payload of a Node Info protobuf.
    This model is linked to one and only one PacketData entity and contains specific fields for the node info data.
    A PacketData entity may exist without a NodeInfoPayload entity, but a NodeInfoPayload entity must always be linked to a PacketData.
    """
    time = models.DateTimeField(auto_now_add=True, help_text="Timestamp when the node info payload was received.")

    packet_data = models.OneToOneField(
        PacketData,
        on_delete=models.CASCADE,
        related_name='node_info_payload',
        help_text="The packet data to which this Node Info payload belongs. This field is required and must be unique."
    )

    # Node Info
    short_name = models.CharField(max_length=4, blank=True, null=True, help_text="Short name of the node.")
    long_name = models.CharField(max_length=32, blank=True, null=True, help_text="Long name of the node.")
    hw_model = models.CharField(max_length=32, blank=True, null=True, help_text="Hardware model of the node.")
    is_licensed = models.BooleanField(default=False, help_text="Indicates if the node is set as licensed operator.")
    role = models.CharField(max_length=32, default='CLIENT', help_text="Role of the node in the network (e.g., 'router', 'client').")
    public_key = models.CharField(max_length=255, blank=True, null=True, help_text="Public key of the node for encryption.")
    is_unmessagable = models.BooleanField(default=False, help_text="Indicates if the node is set as unmessagable.")

    class Meta:
        verbose_name = "Node Info Payload"
        verbose_name_plural = "Node Info Payloads"
    ordering = ['time']

class PositionPayload(TimescaleModel):
    """
    Represents the payload of a Position protobuf.
    This model is linked to one and only one PacketData entity and contains specific fields for the position data.
    A PacketData entity may exist without a PositionPayload entity, but a PositionPayload entity must always be linked to a PacketData.
    """
    time = models.DateTimeField(auto_now_add=True, help_text="Timestamp when the position payload was received.")

    packet_data = models.OneToOneField(
        PacketData,
        on_delete=models.CASCADE,
        related_name='position_payload',
        help_text="The packet data to which this Position payload belongs. This field is required and must be unique."
    )

    # Position
    latitude = models.DecimalField(max_digits=10, decimal_places=7, blank=True, null=True, help_text="Latitude of the node's position.")
    longitude = models.DecimalField(max_digits=10, decimal_places=7, blank=True, null=True, help_text="Longitude of the node's position.")
    altitude = models.IntegerField(blank=True, null=True, help_text="Altitude of the node's position in meters.")
    accuracy = models.IntegerField(blank=True, null=True, help_text="Accuracy of the position data.")
    seq_number = models.IntegerField(blank=True, null=True, help_text="Sequence number of the position data.")
    location_source = models.CharField(
        max_length=32,
        blank=True,
        null=True,
        help_text="Source reported for the position fix (Meshtastic Position.location_source).",
    )

    class Meta:
        verbose_name = "Position Payload"
        verbose_name_plural = "Position Payloads"
    ordering = ['time']

class TelemetryPayload(TimescaleModel):
    """
    Represents the payload of a Telemetry protobuf.
    This model is linked to one and only one PacketData entity and contains specific fields for the telemetry data.
    A PacketData entity may exist without a TelemetryPayload entity, but a TelemetryPayload entity must always be linked to a PacketData.
    """
    time = models.DateTimeField(auto_now_add=True, help_text="Timestamp when the telemetry payload was received.")

    packet_data = models.OneToOneField(
        PacketData,
        on_delete=models.CASCADE,
        related_name='telemetry_payload',
        help_text="The packet data to which this Telemetry payload belongs. This field is required and must be unique."
    )

    # Device Telemetry
    battery_level = models.IntegerField(blank=True, null=True, help_text="Battery level of the device in percentage.")
    voltage = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, help_text="Voltage of the device in volts.")
    channel_utilization = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, help_text="Channel utilization of the device in percentage.")
    air_util_tx = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, help_text="Air utilization for transmission of the device in percentage.")
    uptime_seconds = models.IntegerField(blank=True, null=True, help_text="Uptime of the device in seconds.")
    
    # Environment Telemetry
    temperature = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, help_text="Temperature in degrees Celsius.")
    relative_humidity = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, help_text="Relative humidity in percentage.")
    barometric_pressure = models.DecimalField(max_digits=7, decimal_places=2, blank=True, null=True, help_text="Barometric pressure in hPa.")
    gas_resistance = models.DecimalField(max_digits=7, decimal_places=2, blank=True, null=True, help_text="Gas resistance in ohms.")
    iaq = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True, help_text="Indoor Air Quality (IAQ) index.")

    class Meta:
        verbose_name = "Telemetry Payload"
        verbose_name_plural = "Telemetry Payloads"
    ordering = ['time']


class NeighborInfoPayload(TimescaleModel):
    """
    Represents the payload of a Neighbor Info protobuf message.
    Stores high-level metadata for the reporting node and broadcast behaviour.
    """

    time = models.DateTimeField(auto_now_add=True, help_text="Timestamp when the neighbor info payload was received.")

    packet_data = models.OneToOneField(
        PacketData,
        on_delete=models.CASCADE,
        related_name='neighbor_info_payload',
        help_text="The packet data to which this Neighbor Info payload belongs. This field is required and must be unique.",
    )

    reporting_node = models.ForeignKey(
        'Node',
        on_delete=models.SET_NULL,
        related_name='neighbor_info_reports',
        blank=True,
        null=True,
        help_text="Database node that reported this neighbor information, if known.",
    )
    reporting_node_id_text = models.CharField(
        max_length=10,
        blank=True,
        null=True,
        help_text="Node ID string of the reporting node as provided in the payload.",
    )
    last_sent_by_node = models.ForeignKey(
        'Node',
        on_delete=models.SET_NULL,
        related_name='neighbor_info_last_sent_reports',
        blank=True,
        null=True,
        help_text="Node referenced in last_sent_by_id, if present and resolved.",
    )
    last_sent_by_node_num = models.BigIntegerField(
        blank=True,
        null=True,
        help_text="Numeric node identifier supplied in last_sent_by_id when resolvable.",
    )
    node_broadcast_interval_secs = models.IntegerField(
        blank=True,
        null=True,
        help_text="Broadcast interval for the reporting node, if provided (seconds).",
    )

    class Meta:
        verbose_name = "Neighbor Info Payload"
        verbose_name_plural = "Neighbor Info Payloads"
    ordering = ['time']


class NeighborInfoNeighbor(TimescaleModel):
    """
    Individual neighbor entry advertised within a Neighbor Info payload.
    """

    time = models.DateTimeField(auto_now_add=True, help_text="Timestamp when the neighbor entry was processed.")

    payload = models.ForeignKey(
        NeighborInfoPayload,
        on_delete=models.CASCADE,
        related_name='neighbors',
        help_text="Parent Neighbor Info payload that reported this neighbor.",
    )

    node = models.ForeignKey(
        'Node',
        on_delete=models.SET_NULL,
        related_name='advertised_neighbors',
        blank=True,
        null=True,
        help_text="Resolved node instance for the advertised neighbor, if known.",
    )
    advertised_node_id = models.CharField(
        max_length=10,
        blank=True,
        null=True,
        help_text="Node ID string of the advertised neighbor as provided in the payload.",
    )
    advertised_node_num = models.BigIntegerField(
        blank=True,
        null=True,
        help_text="Numeric node identifier for the neighbor when resolvable.",
    )
    snr = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        blank=True,
        null=True,
        help_text="Last reported SNR (in dB) for the neighbor link.",
    )
    last_rx_time = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Timestamp (UTC) corresponding to the neighbor's last_rx_time value, if provided.",
    )
    last_rx_time_raw = models.BigIntegerField(
        blank=True,
        null=True,
        help_text="Raw epoch seconds supplied for last_rx_time, preserved for reference.",
    )
    node_broadcast_interval_secs = models.IntegerField(
        blank=True,
        null=True,
        help_text="Broadcast interval advertised for this neighbor (seconds).",
    )

    class Meta:
        verbose_name = "Neighbor Info Neighbor"
        verbose_name_plural = "Neighbor Info Neighbors"
    ordering = ['time']


class RouteDiscoveryPayload(TimescaleModel):
    """
    Represents the payload of a Route Discovery protobuf.
    This model is linked to one and only one PacketData entity and contains specific fields for the route discovery data.
    A PacketData entity may exist without or with many RouteDiscoveryPayload entity, but a RouteDiscoveryPayload entity must always be linked to a PacketData.
    """
    time = models.DateTimeField(auto_now_add=True, help_text="Timestamp when the route discovery payload was received.")

    packet_data = models.OneToOneField(
        PacketData,
        on_delete=models.CASCADE,
        related_name='route_discovery_payload',
        help_text="The packet data to which this Route Discovery payload belongs. This field is required and must be unique."
    )
    # Route Discovery
    route_towards = models.ForeignKey(
        'RouteDiscoveryRoute',
        on_delete=models.CASCADE,
        related_name='route_discovery_payloads',
        blank=True,
        null=True,
        help_text="The route discovery route associated with this payload. This field is optional and can be used to store additional information about the route discovery."
    )
    snr_towards = models.JSONField(
        blank=True,
        null=True,
        help_text="Signal-to-Noise Ratio (SNR) of the route discovery packet towards the destination, represented as a JSON object. This field is optional and can be used to store additional information about the SNR."
    )
    route_back = models.ForeignKey(
        'RouteDiscoveryRoute',
        on_delete=models.CASCADE,
        related_name='route_discovery_payloads_back',
        blank=True,
        null=True,
        help_text="The route discovery route back associated with this payload. This field is optional and can be used to store additional information about the route discovery back."
    )
    snr_back = models.JSONField(
        blank=True,
        null=True,
        help_text="Signal-to-Noise Ratio (SNR) of the route discovery packet back towards the source, represented as a JSON object. This field is optional and can be used to store additional information about the SNR back."
    )

    class Meta:
        verbose_name = "Route Discovery Payload"
        verbose_name_plural = "Route Discovery Payloads"
        ordering = ['time',]

class RouteDiscoveryRoute(TimescaleModel):
    """
    Represents a route in a Route Discovery protobuf.
    This model is linked to one and only one RouteDiscoveryPayload entity and contains specific fields for the route data.
    A RouteDiscoveryPayload entity may exist without a RouteDiscoveryRoute entity, but a RouteDiscoveryRoute entity must always be linked to a RouteDiscoveryPayload.
    """
    time = models.DateTimeField(auto_now_add=True, help_text="Timestamp when the route discovery payload was received.")

    # Route Discovery Route
    nodes = models.ManyToManyField(
        'Node',
        related_name='route_discovery_routes',
        help_text="The nodes that are part of this route discovery route. This field is required and can be used to store multiple nodes in the route."
    )

    node_list = models.JSONField(
        blank=True,
        null=True,
        help_text="List of nodes in the route, represented as a JSON array. This field is optional and can be used to store additional information about the route."
    )
    hops = models.IntegerField(blank=True, null=True, help_text="Number of hops in the route.")
    class Meta:
        verbose_name = "Route Discovery Route"
        verbose_name_plural = "Route Discovery Routes"
        ordering = ['time',]

class RoutingPayload(TimescaleModel):
    """
    Represents the payload of a Routing protobuf.
    This model is linked to one and only one PacketData entity and contains specific fields for the routing data.
    A PacketData entity may exist without a RoutingPayload entity, but a RoutingPayload entity must always be linked to a PacketData.
    """
    time = models.DateTimeField(auto_now_add=True, help_text="Timestamp when the route discovery payload was received.")

    packet_data = models.OneToOneField(
        PacketData,
        on_delete=models.CASCADE,
        related_name='routing_payload',
        help_text="The packet data to which this Routing payload belongs. This field is required and must be unique."
    )

    class RoutingError(models.TextChoices):
        NONE = 'NONE', 'None'
        NO_ROUTE = 'NO_ROUTE', 'No Route'
        GOT_NAK = 'GOT_NAK', 'Got NAK'
        NO_INTERFACE = 'NO_INTERFACE', 'No Interface'
        MAX_RETRANSMIT = 'MAX_RETRANSMIT', 'Max Retransmit'
        NO_CHANNEL = 'NO_CHANNEL', 'No Channel'
        TOO_LARGE = 'TOO_LARGE', 'Too Large'
        NO_RESPONSE = 'NO_RESPONSE', 'No Response'
        DUTY_CYCLE_LIMIT = 'DUTY_CYCLE_LIMIT', 'Duty Cycle Limit'
        BAD_REQUEST = 'BAD_REQUEST', 'Bad Request'
        NOT_AUTHORIZED = 'NOT_AUTHORIZED', 'Not Authorized'
        PKI_FAILED = 'PKI_FAILED', 'PKI Failed'
        PKI_UNKNOWN_PUBKEY = 'PKI_UNKNOWN_PUBKEY', 'PKI Unknown Public Key'
        ADMIN_BAD_SESSION_KEY = 'ADMIN_BAD_SESSION_KEY', 'Admin Bad Session Key'
        ADMIN_PUBLIC_KEY_UNAUTHORIZED = 'ADMIN_PUBLIC_KEY_UNAUTHORIZED', 'Admin Public Key Unauthorized'

    # Routing
    route_request = models.OneToOneField(
        'RouteDiscoveryPayload',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='route_request',
        help_text="The route discovery payload associated with the route request. This field is required and must be unique."
    )
    route_reply = models.OneToOneField(
        'RouteDiscoveryPayload',
        on_delete=models.CASCADE,
        related_name='route_reply',
        blank=True,
        null=True,
        help_text="The route discovery payload associated with the route reply. This field is optional and can be used to store additional information about the route reply."
    )
    error_reason = models.CharField(
        max_length=32,
        choices=RoutingError.choices,
        blank=True,
        null=True,
        help_text="Reason for the routing error, if applicable. This field is optional and can be used to store additional information about the routing error."
    )
    class Meta:
        verbose_name = "Routing Payload"
        verbose_name_plural = "Routing Payloads"
        ordering = ['time',]