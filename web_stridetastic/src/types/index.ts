// Auth types
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface TokenResponse {
  access: string;
  refresh: string;
}

export interface User {
  id: number;
  username: string;
  email?: string;
}

// API Response types
export interface MessageResponse {
  message: string;
}

// Node types based on backend schema
export interface Node {
  id: number;
  node_num: number;
  node_id: string;
  mac_address: string;
  short_name?: string;
  long_name?: string;
  hw_model?: string;
  is_licensed: boolean;
  role?: string;
  public_key?: string;
  is_low_entropy_public_key: boolean;
  has_private_key: boolean;
  private_key_fingerprint?: string | null;
  is_unmessagable?: boolean;
  is_virtual: boolean;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  position_accuracy?: number;
  location_source?: string | null;
  battery_level?: number;
  voltage?: number;
  channel_utilization?: number;
  air_util_tx?: number;
  uptime_seconds?: number;
  temperature?: number;
  relative_humidity?: number;
  barometric_pressure?: number;
  gas_resistance?: number;
  iaq?: number;
  latency_reachable?: boolean | null;
  latency_ms?: number | null;
  first_seen: string;
  last_seen: string;
  private_key_updated_at?: string | null;
  interfaces?: string[];
}

export interface NodeKeyHealthEntry {
  node_id: string;
  node_num: number;
  short_name?: string | null;
  long_name?: string | null;
  mac_address: string;
  public_key?: string | null;
  is_virtual: boolean;
  is_low_entropy_public_key: boolean;
  duplicate_count: number;
  duplicate_node_ids: string[];
  first_seen: string;
  last_seen: string;
}

export interface NodePositionHistoryEntry {
  timestamp: string;
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  sequence_number?: number | null;
  location_source?: string | null;
  packet_id?: number | null;
}

export interface NodeTelemetryHistoryEntry {
  timestamp: string;
  battery_level?: number | null;
  voltage?: number | null;
  channel_utilization?: number | null;
  air_util_tx?: number | null;
  uptime_seconds?: number | null;
  temperature?: number | null;
  relative_humidity?: number | null;
  barometric_pressure?: number | null;
  gas_resistance?: number | null;
  iaq?: number | null;
}

export interface NodeLatencyHistoryEntry {
  timestamp: string;
  probe_message_id?: number | null;
  reachable?: boolean | null;
  latency_ms?: number | null;
  responded_at?: string | null;
}

export interface PortActivityEntry {
  port: string;
  display_name: string;
  total_packets: number;
  last_seen?: string | null;
}

export interface NodePortActivityEntry {
  port: string;
  display_name: string;
  sent_count: number;
  received_count: number;
  last_sent?: string | null;
  last_received?: string | null;
}

export interface PacketPayload {
  payload_type: string;
  fields: Record<string, unknown>;
}

export interface NodePortPacketEntry {
  packet_id?: number | null;
  timestamp: string;
  direction: 'sent' | 'received';
  port: string;
  display_name: string;
  portnum?: number | null;
  from_node_id?: string | null;
  to_node_id?: string | null;
  payload?: PacketPayload | null;
}

export interface PortNodeActivityEntry {
  node_id: string;
  node_num?: number | null;
  short_name?: string | null;
  long_name?: string | null;
  sent_count: number;
  received_count: number;
  total_packets: number;
  last_sent?: string | null;
  last_received?: string | null;
  last_activity?: string | null;
}

export interface LinkNodeSummary {
  id: number;
  node_id: string;
  node_num: number;
  short_name?: string | null;
  long_name?: string | null;
}

export interface LinkChannelSummary {
  channel_id: string;
  channel_num?: number | null;
}

export interface NodeLink {
  id: number;
  node_a: LinkNodeSummary;
  node_b: LinkNodeSummary;
  node_a_to_node_b_packets: number;
  node_b_to_node_a_packets: number;
  total_packets: number;
  is_bidirectional: boolean;
  first_seen: string;
  last_activity: string;
  last_packet_id?: number | null;
  last_packet_port?: string | null;
  last_packet_port_display?: string | null;
  last_packet_channel?: LinkChannelSummary | null;
  channels: LinkChannelSummary[];
}

export type LinkPacketDirection = 'node_a_to_node_b' | 'node_b_to_node_a' | 'unknown';

export interface NodeLinkPacket {
  packet_id?: number | null;
  timestamp: string;
  direction: LinkPacketDirection;
  from_node: LinkNodeSummary;
  to_node: LinkNodeSummary;
  port?: string | null;
  port_display?: string | null;
  channel?: LinkChannelSummary | null;
  payload?: PacketPayload | null;
}

export interface OverviewMetricSnapshot {
  timestamp: string;
  total_nodes: number;
  active_nodes: number;
  reachable_nodes: number;
  active_connections: number;
  channels: number;
  avg_battery?: number | null;
  avg_rssi?: number | null;
  avg_snr?: number | null;
}

export interface OverviewMetricsPayload {
  total_nodes: number;
  active_nodes: number;
  reachable_nodes: number;
  active_connections: number;
  channels: number;
  avg_battery?: number | null;
  avg_rssi?: number | null;
  avg_snr?: number | null;
}

export interface OverviewMetricsResponse {
  current: OverviewMetricsPayload;
  history: OverviewMetricSnapshot[];
}

// Edge types based on backend schema
export interface Edge {
  source_node_id: number;
  target_node_id: number;
  first_seen: string;
  last_seen: string;
  last_packet_id: number;
  last_rx_rssi: number;
  last_rx_snr: number;
  last_hops: number;
  edge_type: string;
  interfaces_names: string[];
}

// Graph data for ForceGraph
export interface ForceGraphNode {
  id: string;
  name: string;
  node_num: number;
  node_id: string;
  battery_level?: number;
  hw_model?: string;
  role?: string;
  last_seen: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  position_accuracy?: number;
  location_source?: string | null;
  short_name?: string;
  long_name?: string;
  color?: string;
  size?: number;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  isHidden?: boolean; // For intermediate nodes in multi-hop paths
  isMqttBroker?: boolean; // Flag to identify MQTT Client node
  isInterfaceNode?: boolean; // Flag for interface nodes rendered in graph
  
  // Additional node information from schema
  mac_address?: string;
  is_licensed?: boolean;
  public_key?: string;
  is_unmessagable?: boolean;
  voltage?: number;
  channel_utilization?: number;
  air_util_tx?: number;
  uptime_seconds?: number;
  temperature?: number;
  relative_humidity?: number;
  barometric_pressure?: number;
  gas_resistance?: number;
  iaq?: number;
  latency_reachable?: boolean | null;
  latency_ms?: number | null;
  first_seen?: string;
  isVirtual?: boolean;
}

export interface ForceGraphLink {
  source: string;
  target: string;
  rssi: number;
  snr: number;
  hops: number;
  last_seen: string;
  color?: string;
  width?: number;
  value?: number;
  isMqtt?: boolean; // Flag to identify MQTT links
  distance?: number; // Link distance for force simulation
  isMultiHopSegment?: boolean; // Mark as part of multi-hop path
  originalHops?: number; // Store original hop count for multi-hop segments
  isLastHop?: boolean; // Mark if this is the last hop with actual signal data
  isMqttBrokerLink?: boolean; // Flag to identify links to/from MQTT Client
  isDirectMultiHop?: boolean; // Flag to identify direct multi-hop links (for map view)
}

// Channel types based on backend schema
export interface Channel {
  channel_id: string;
  channel_num: number;
  total_messages: number;
  first_seen: string;
  last_seen: string;
  members_count: number;
  members: Node[];
  interface_ids?: number[];
}

export interface ChannelDetail {
  channel_id: string;
  channel_num: number;
  psk?: string;
  first_seen: string;
  last_seen: string;
  members: Node[];
}

export interface ChannelStatistics {
  channels: Channel[];
}

export interface CaptureSession {
  id: string;
  name: string;
  status: string;
  source_type: string;
  interface_id?: number | null;
  interface_name?: string | null;
  started_at: string;
  ended_at?: string | null;
  last_packet_at?: string | null;
  packet_count: number;
  byte_count: number;
  file_size: number;
  filename: string;
  file_path: string;
  is_active: boolean;
}

// Publishing payloads (align with backend schemas)
export interface PublishGenericPayload {
  from_node: string;
  to_node: string;
  channel_name: string;
  gateway_node?: string | null;
  channel_key?: string; // leave empty string "" for no encryption
  hop_limit?: number; // default 3
  hop_start?: number; // default 3
  want_ack?: boolean; // default false
  // When set, instructs the recipient device to send a response packet
  // (useful for requesting telemetry/position/etc). Optional boolean.
  want_response?: boolean;
}

export interface PublishTextMessagePayload extends PublishGenericPayload {
  message_text: string;
  interface_id?: number;
  pki_encrypted?: boolean;
}

export interface PublishNodeInfoPayload extends PublishGenericPayload {
  short_name: string;
  long_name: string;
  hw_model: number; // backend expects integer identifier
  public_key: string;
  interface_id?: number;
}

export interface PublishPositionPayload extends PublishGenericPayload {
  lat: number;
  lon: number;
  alt?: number; // default 0.0
  interface_id?: number;
  // Allow marking position publish/request as PKI encrypted from frontend
  pki_encrypted?: boolean;
}

// Payload used by the frontend to request telemetry/data from a node.
export interface PublishTelemetryPayload extends PublishGenericPayload {
  interface_id?: number;
  // Which telemetry category to request. 'device' -> device metrics (battery, uptime, etc),
  // 'environment' -> environmental metrics (temperature, humidity, pressure, etc).
  telemetry_type?: 'device' | 'environment';
  // Options specifying which fields to request or extra parameters (e.g. limit)
  telemetry_options?: Record<string, unknown>;
  // Whether to PKI-encrypt the request payload
  pki_encrypted?: boolean;
}

// New: Traceroute payload (no extra fields beyond generic payload)
export interface PublishTraceroutePayload extends PublishGenericPayload {
  interface_id?: number;
}

export interface PublishReachabilityPayload extends PublishGenericPayload {
  interface_id?: number;
}

export interface PublisherReactiveConfig {
  enabled: boolean;
  from_node?: string | null;
  gateway_node?: string | null;
  channel_key?: string | null;
  hop_limit?: number | null;
  hop_start?: number | null;
  want_ack?: boolean | null;
  max_tries: number;
  trigger_ports?: string[] | null;
  listen_interface_ids: number[];
  listen_interfaces: Array<{
    id: number;
    name?: string | null;
    display_name?: string | null;
    status?: string | null;
  }>;
}

export interface PublisherReactiveAttempt {
  count: number;
  first_attempt?: string | null;
  last_attempt?: string | null;
}

export interface PublisherReactiveStatus {
  enabled: boolean;
  config: PublisherReactiveConfig;
  attempts: Record<string, PublisherReactiveAttempt>;
  attempt_window_seconds: number;
}

export interface PublisherReactiveConfigUpdatePayload {
  enabled?: boolean;
  from_node?: string | null;
  gateway_node?: string | null;
  channel_key?: string | null;
  hop_limit?: number | null;
  hop_start?: number | null;
  want_ack?: boolean | null;
  max_tries?: number;
  trigger_ports?: string[] | null;
  listen_interface_ids?: number[];
}

export type PeriodicPayloadType = 'text' | 'position' | 'nodeinfo' | 'traceroute' | 'telemetry';

export interface PublisherPeriodicJob {
  id: number;
  name: string;
  description?: string | null;
  enabled: boolean;
  payload_type: PeriodicPayloadType;
  from_node: string;
  to_node: string;
  channel_name: string;
  gateway_node?: string | null;
  channel_key?: string | null;
  hop_limit: number;
  hop_start: number;
  want_ack: boolean;
  pki_encrypted: boolean;
  period_seconds: number;
  interface_id?: number | null;
  interface?: {
    id: number;
    name?: string | null;
    display_name?: string | null;
    status?: string | null;
  } | null;
  payload_options: Record<string, unknown>;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_status: string;
  last_error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublisherPeriodicJobCreatePayload {
  name: string;
  description?: string | null;
  enabled?: boolean;
  payload_type: PeriodicPayloadType;
  from_node: string;
  to_node: string;
  channel_name: string;
  gateway_node?: string | null;
  channel_key?: string | null;
  hop_limit?: number;
  hop_start?: number;
  want_ack?: boolean;
  pki_encrypted?: boolean;
  period_seconds: number;
  interface_id?: number | null;
  payload_options: Record<string, unknown>;
}

export interface PublisherPeriodicJobUpdatePayload extends Partial<PublisherPeriodicJobCreatePayload> {
  enabled?: boolean;
}

export interface VirtualNodePayload {
  short_name?: string | null;
  long_name?: string | null;
  hw_model?: string | null;
  role?: string | null;
  is_licensed?: boolean | null;
  is_unmessagable?: boolean | null;
  node_num?: number | null;
  node_id?: string | null;
  mac_address?: string | null;
}

export interface VirtualNodeUpdatePayload extends VirtualNodePayload {
  regenerate_keys?: boolean;
}

export interface VirtualNodeSecretResponse {
  node: Node;
  public_key?: string | null;
  private_key?: string | null;
}

export interface VirtualNodeEnumOption {
  value: string;
  label: string;
}

export interface VirtualNodeOptionsResponse {
  roles: VirtualNodeEnumOption[];
  hardware_models: VirtualNodeEnumOption[];
  default_role: string;
  default_hardware_model: string;
}

export interface VirtualNodePrefillResponse {
  short_name: string;
  long_name: string;
  node_id: string;
}
