'use client';

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  Send,
  Radio,
  MapPin,
  User,
  MessageSquare,
  Play,
  Settings,
  Activity,
  Target,
  Clock,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Loader2,
  Signal,
  PlusCircle,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api';
import type {
  Node,
  Channel,
  PublisherReactiveStatus,
  PublisherPeriodicJob,
  PublisherPeriodicJobCreatePayload,
  PublisherPeriodicJobUpdatePayload,
  PeriodicPayloadType,
} from '@/types';
import type { Interface } from '@/types/interface';

const PUBLISHING_DEFAULTS_STORAGE_KEY = 'stridetastic:publishing-defaults';

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString();
};

// Patch: extend publish payload type to allow new backend fields
type PublishTextMessagePayloadCompat = {
  from_node: string;
  to_node: string;
  message_text: string;
  channel_name: string;
  gateway_node?: string;
  channel_key?: string;
  hop_limit?: number;
  hop_start?: number;
  want_ack?: boolean;
  interface_id?: number;
  // new fields
  pki_encrypted?: boolean;
};

// Full Hardware Model list derived from meshtastic protobuf
const HW_MODELS: { value: number; label: string }[] = [
  { value: 0, label: 'UNSET' },
  { value: 1, label: 'TLORA_V2' },
  { value: 2, label: 'TLORA_V1' },
  { value: 3, label: 'TLORA_V2_1_1P6' },
  { value: 4, label: 'TBEAM' },
  { value: 5, label: 'HELTEC_V2_0' },
  { value: 6, label: 'TBEAM_V0P7' },
  { value: 7, label: 'T_ECHO' },
  { value: 8, label: 'TLORA_V1_1P3' },
  { value: 9, label: 'RAK4631' },
  { value: 10, label: 'HELTEC_V2_1' },
  { value: 11, label: 'HELTEC_V1' },
  { value: 12, label: 'LILYGO_TBEAM_S3_CORE' },
  { value: 13, label: 'RAK11200' },
  { value: 14, label: 'NANO_G1' },
  { value: 15, label: 'TLORA_V2_1_1P8' },
  { value: 16, label: 'TLORA_T3_S3' },
  { value: 17, label: 'NANO_G1_EXPLORER' },
  { value: 18, label: 'NANO_G2_ULTRA' },
  { value: 19, label: 'LORA_TYPE' },
  { value: 20, label: 'WIPHONE' },
  { value: 21, label: 'WIO_WM1110' },
  { value: 22, label: 'RAK2560' },
  { value: 23, label: 'HELTEC_HRU_3601' },
  { value: 24, label: 'HELTEC_WIRELESS_BRIDGE' },
  { value: 25, label: 'STATION_G1' },
  { value: 26, label: 'RAK11310' },
  { value: 27, label: 'SENSELORA_RP2040' },
  { value: 28, label: 'SENSELORA_S3' },
  { value: 29, label: 'CANARYONE' },
  { value: 30, label: 'RP2040_LORA' },
  { value: 31, label: 'STATION_G2' },
  { value: 32, label: 'LORA_RELAY_V1' },
  { value: 33, label: 'NRF52840DK' },
  { value: 34, label: 'PPR' },
  { value: 35, label: 'GENIEBLOCKS' },
  { value: 36, label: 'NRF52_UNKNOWN' },
  { value: 37, label: 'PORTDUINO' },
  { value: 38, label: 'ANDROID_SIM' },
  { value: 39, label: 'DIY_V1' },
  { value: 40, label: 'NRF52840_PCA10059' },
  { value: 41, label: 'DR_DEV' },
  { value: 42, label: 'M5STACK' },
  { value: 43, label: 'HELTEC_V3' },
  { value: 44, label: 'HELTEC_WSL_V3' },
  { value: 45, label: 'BETAFPV_2400_TX' },
  { value: 46, label: 'BETAFPV_900_NANO_TX' },
  { value: 47, label: 'RPI_PICO' },
  { value: 48, label: 'HELTEC_WIRELESS_TRACKER' },
  { value: 49, label: 'HELTEC_WIRELESS_PAPER' },
  { value: 50, label: 'T_DECK' },
  { value: 51, label: 'T_WATCH_S3' },
  { value: 52, label: 'PICOMPUTER_S3' },
  { value: 53, label: 'HELTEC_HT62' },
  { value: 54, label: 'EBYTE_ESP32_S3' },
  { value: 55, label: 'ESP32_S3_PICO' },
  { value: 56, label: 'CHATTER_2' },
  { value: 57, label: 'HELTEC_WIRELESS_PAPER_V1_0' },
  { value: 58, label: 'HELTEC_WIRELESS_TRACKER_V1_0' },
  { value: 59, label: 'UNPHONE' },
  { value: 60, label: 'TD_LORAC' },
  { value: 61, label: 'CDEBYTE_EORA_S3' },
  { value: 62, label: 'TWC_MESH_V4' },
  { value: 63, label: 'NRF52_PROMICRO_DIY' },
  { value: 64, label: 'RADIOMASTER_900_BANDIT_NANO' },
  { value: 65, label: 'HELTEC_CAPSULE_SENSOR_V3' },
  { value: 66, label: 'HELTEC_VISION_MASTER_T190' },
  { value: 67, label: 'HELTEC_VISION_MASTER_E213' },
  { value: 68, label: 'HELTEC_VISION_MASTER_E290' },
  { value: 69, label: 'HELTEC_MESH_NODE_T114' },
  { value: 70, label: 'SENSECAP_INDICATOR' },
  { value: 71, label: 'TRACKER_T1000_E' },
  { value: 72, label: 'RAK3172' },
  { value: 73, label: 'WIO_E5' },
  { value: 74, label: 'RADIOMASTER_900_BANDIT' },
  { value: 75, label: 'ME25LS01_4Y10TD' },
  { value: 76, label: 'RP2040_FEATHER_RFM95' },
  { value: 77, label: 'M5STACK_COREBASIC' },
  { value: 78, label: 'M5STACK_CORE2' },
  { value: 79, label: 'RPI_PICO2' },
  { value: 80, label: 'M5STACK_CORES3' },
  { value: 81, label: 'SEEED_XIAO_S3' },
  { value: 82, label: 'MS24SF1' },
  { value: 83, label: 'TLORA_C6' },
  { value: 84, label: 'WISMESH_TAP' },
  { value: 85, label: 'ROUTASTIC' },
  { value: 86, label: 'MESH_TAB' },
  { value: 87, label: 'MESHLINK' },
  { value: 88, label: 'XIAO_NRF52_KIT' },
  { value: 89, label: 'THINKNODE_M1' },
  { value: 90, label: 'THINKNODE_M2' },
  { value: 91, label: 'T_ETH_ELITE' },
  { value: 92, label: 'HELTEC_SENSOR_HUB' },
  { value: 93, label: 'RESERVED_FRIED_CHICKEN' },
  { value: 94, label: 'HELTEC_MESH_POCKET' },
  { value: 95, label: 'SEEED_SOLAR_NODE' },
  { value: 96, label: 'NOMADSTAR_METEOR_PRO' },
  { value: 97, label: 'CROWPANEL' },
  { value: 98, label: 'LINK_32' },
  { value: 99, label: 'SEEED_WIO_TRACKER_L1' },
  { value: 100, label: 'SEEED_WIO_TRACKER_L1_EINK' },
  { value: 101, label: 'QWANTZ_TINY_ARMS' },
  { value: 102, label: 'T_DECK_PRO' },
  { value: 103, label: 'T_LORA_PAGER' },
  { value: 104, label: 'GAT562_MESH_TRIAL_TRACKER' },
  { value: 255, label: 'PRIVATE_HW' },
];

interface PublishingActionsProps {
  className?: string;
}

interface ActionCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  category: string;
  onClick: () => void;
  isActive?: boolean;
}

type ReactiveFormState = {
  enabled: boolean;
  from_node: string;
  gateway_node: string;
  channel_key: string;
  hop_limit: number;
  hop_start: number;
  want_ack: boolean;
  listen_interface_ids: number[];
  max_tries: number;
  trigger_ports: string[];
};

const INITIAL_REACTIVE_FORM: ReactiveFormState = {
  enabled: false,
  from_node: '',
  gateway_node: '',
  channel_key: '',
  hop_limit: 3,
  hop_start: 3,
  want_ack: false,
  listen_interface_ids: [],
  max_tries: 0,
  trigger_ports: ['NODEINFO_APP', 'POSITION_APP'],
};

type PeriodicPayloadOptionsForm = {
  message_text: string;
  short_name: string;
  long_name: string;
  hw_model: number | '';
  public_key: string;
  lat: number | '';
  lon: number | '';
  alt: number | '';
  // Telemetry fields
  telemetry_type?: 'device' | 'environment';
  battery_level?: number | '';
  voltage?: number | '';
  uptime_seconds?: number | '';
  channel_utilization?: number | '';
  air_util_tx?: number | '';
  temperature?: number | '';
  relative_humidity?: number | '';
  barometric_pressure?: number | '';
  gas_resistance?: number | '';
  iaq?: number | '';
  // Whether to request a response from the recipient device
  want_response?: boolean;
};

type PeriodicFormState = {
  id: number | null;
  name: string;
  description: string;
  enabled: boolean;
  payload_type: PeriodicPayloadType;
  from_node: string;
  to_node: string;
  channel_name: string;
  gateway_node: string;
  channel_key: string;
  hop_limit: number;
  hop_start: number;
  want_ack: boolean;
  pki_encrypted: boolean;
  period_seconds: number;
  interface_id: number | null;
  payload_options: PeriodicPayloadOptionsForm;
};

const INITIAL_PERIODIC_FORM: PeriodicFormState = {
  id: null,
  name: '',
  description: '',
  enabled: true,
  payload_type: 'text',
  from_node: '',
  to_node: '',
  channel_name: '',
  gateway_node: '',
  channel_key: '',
  hop_limit: 3,
  hop_start: 3,
  want_ack: false,
  pki_encrypted: false,
  period_seconds: 300,
  interface_id: null,
  payload_options: {
    message_text: '',
    short_name: '',
    long_name: '',
    hw_model: '',
    public_key: '',
    lat: '',
    lon: '',
    alt: '',
    telemetry_type: 'device',
    battery_level: '',
    voltage: '',
    uptime_seconds: '',
    channel_utilization: '',
    air_util_tx: '',
    temperature: '',
    relative_humidity: '',
    barometric_pressure: '',
    gas_resistance: '',
    iaq: '',
    want_response: false,
  },
};

const REACTIVE_TRIGGER_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: 'NODEINFO_APP', label: 'Node Info', description: 'Publish traceroute probes when node information broadcasts are observed.' },
  { value: 'POSITION_APP', label: 'Position', description: 'React to GPS/location packets emitted by the target node.' },
  { value: 'TELEMETRY_APP', label: 'Telemetry', description: 'Trigger on device telemetry updates such as battery or environment metrics.' },
];

const FORM_INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900';
const FORM_TEXTAREA_CLASS = `${FORM_INPUT_CLASS} align-top`;
const FORM_SELECT_CLASS = FORM_INPUT_CLASS;

type NodeAutocompleteInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  nodes: Node[];
  filterNodes: (query: string, candidateList?: Node[]) => Node[];
  placeholder?: string;
  onSelectNode?: (node: Node) => void;
  helperText?: string;
  required?: boolean;
};

function NodeAutocompleteInput({
  id,
  label,
  value,
  onChange,
  nodes,
  filterNodes,
  placeholder,
  onSelectNode,
  helperText,
  required,
}: NodeAutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);

  const suggestions = useMemo(() => {
    if (!isOpen) return [] as Node[];
    return filterNodes(value, nodes);
  }, [isOpen, value, nodes, filterNodes]);

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-sm font-medium text-gray-900 mb-2">
        {label}{required ? ' *' : ''}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 120)}
        type="text"
        placeholder={placeholder}
        className={FORM_INPUT_CLASS}
        autoComplete="off"
        required={required}
      />
      {helperText && <p className="mt-1 text-xs text-gray-500">{helperText}</p>}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 w-full max-h-60 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {suggestions.map((node) => (
            <div
              key={node.id ?? node.node_id}
              role="button"
              tabIndex={-1}
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(node.node_id);
                onSelectNode?.(node);
                setIsOpen(false);
              }}
              className="w-full cursor-pointer px-3 py-2 text-left hover:bg-blue-50"
            >
              <div className="text-sm font-medium text-gray-900">{node.short_name || node.long_name || node.node_id}</div>
              <div className="text-xs text-gray-600">{node.long_name || node.short_name} • {node.node_id} • #{node.node_num}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type ChannelAutocompleteInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  channels: Channel[];
  sortedChannels: Channel[];
  placeholder?: string;
  onSelectChannel?: (channel: Channel) => void | Promise<void>;
  helperText?: string;
};

function ChannelAutocompleteInput({
  id,
  label,
  value,
  onChange,
  channels,
  sortedChannels,
  placeholder,
  onSelectChannel,
  helperText,
}: ChannelAutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);

  const suggestions = useMemo(() => {
    if (!isOpen) return [] as Channel[];
    const base = sortedChannels.length > 0 ? sortedChannels : channels;
    const query = value.trim().toLowerCase();
    const filtered = query
      ? base.filter((channel) => channel.channel_id.toLowerCase().includes(query))
      : base;
    return filtered.slice(0, 10);
  }, [isOpen, value, channels, sortedChannels]);

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-sm font-medium text-gray-900 mb-2">{label}</label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 120)}
        type="text"
        placeholder={placeholder}
        className={FORM_INPUT_CLASS}
        autoComplete="off"
      />
      {helperText && <p className="mt-1 text-xs text-gray-500">{helperText}</p>}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 w-full max-h-60 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {suggestions.map((channel) => (
            <div
              key={`${channel.channel_id}-${channel.channel_num}`}
              role="button"
              tabIndex={-1}
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(channel.channel_id);
                Promise.resolve(onSelectChannel?.(channel)).finally(() => {
                  setIsOpen(false);
                });
              }}
              className="w-full cursor-pointer px-3 py-2 text-left hover:bg-blue-50"
            >
              <div className="text-sm font-medium text-gray-900">{channel.channel_id}</div>
              <div className="text-xs text-gray-600">Channel #{channel.channel_num} • msgs: {channel.total_messages}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function ActionCard({ title, description, icon: Icon, category, onClick, isActive }: ActionCardProps) {
  return (
    <div 
      onClick={onClick}
      className={`
        relative bg-white rounded-lg border border-gray-200 shadow-sm p-6 cursor-pointer 
        transition-all duration-200 hover:shadow-md hover:border-blue-300
        ${isActive ? 'border-blue-500 bg-blue-50' : ''}
      `}
    >
      <div className="flex items-start space-x-4">
        <div className={`
          h-12 w-12 rounded-lg flex items-center justify-center
          ${isActive ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-600'}
        `}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`
            text-lg font-semibold mb-2
            ${isActive ? 'text-blue-900' : 'text-gray-900'}
          `}>
            {title}
          </h3>
          <p className="text-sm text-gray-800 mb-3">{description}</p>
          <span className={`
            inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
            ${isActive ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-900'}
          `}>
            {category}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PublishingActions({ className = '' }: PublishingActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [isConfiguring, setIsConfiguring] = useState(false);

  // Toast state
  const [toast, setToast] = useState<null | { message: string; type: 'success' | 'error' }>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast({ message, type });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  // Reactive publication state
  const [reactiveStatus, setReactiveStatus] = useState<PublisherReactiveStatus | null>(null);
  const [reactiveForm, setReactiveForm] = useState<ReactiveFormState>(INITIAL_REACTIVE_FORM);
  const [reactiveLoading, setReactiveLoading] = useState(false);
  const [reactiveSaving, setReactiveSaving] = useState(false);
  const [showReactiveSourceSuggestions, setShowReactiveSourceSuggestions] = useState(false);
  const [showReactiveGatewaySuggestions, setShowReactiveGatewaySuggestions] = useState(false);
  const [reactiveInterfaceQuery, setReactiveInterfaceQuery] = useState('');

  // Periodic publication state
  const [periodicJobs, setPeriodicJobs] = useState<PublisherPeriodicJob[]>([]);
  const [periodicForm, setPeriodicForm] = useState<PeriodicFormState>(() => ({
    ...INITIAL_PERIODIC_FORM,
    payload_options: { ...INITIAL_PERIODIC_FORM.payload_options },
  }));
  // Remember previous periodic channel values to restore on uncheck
  const prevPeriodicChannelNameRef = useRef<string | null>(null);
  const prevPeriodicChannelKeyRef = useRef<string | null>(null);
  const [periodicLoading, setPeriodicLoading] = useState(false);
  const [periodicSaving, setPeriodicSaving] = useState(false);
  const [periodicDeletingId, setPeriodicDeletingId] = useState<number | null>(null);
  const [periodicTogglingId, setPeriodicTogglingId] = useState<number | null>(null);

  // Form state
  const [targetNode, setTargetNode] = useState('');
  const [sourceNode, setSourceNode] = useState('');
  const [channelName, setChannelName] = useState('');
  const [gatewayNode, setGatewayNode] = useState('');
  const [channelKey, setChannelKey] = useState('');
  const [hopLimit, setHopLimit] = useState(3);
  const [hopStart, setHopStart] = useState(3);
  const [wantAck, setWantAck] = useState(false);
  // Whether the Data protobuf should request a response from recipient
  const [wantResponse, setWantResponse] = useState(false);

  // Text message
  const [messageText, setMessageText] = useState('');
  // PKI encryption for published messages
  const [pkiEncrypted, setPkiEncrypted] = useState(false);
  // Remember previous channel values so we can restore them when PKI is unchecked
  const prevChannelNameRef = useRef<string | null>(null);
  const prevChannelKeyRef = useRef<string | null>(null);

  // Nodeinfo
  const [shortName, setShortName] = useState('');
  const [longName, setLongName] = useState('');
  const [hwModel, setHwModel] = useState<number | ''>('');
  const [publicKey, setPublicKey] = useState('');

  // Position
  const [lat, setLat] = useState<number | ''>('');
  const [lon, setLon] = useState<number | ''>('');
  const [alt, setAlt] = useState<number | ''>('');
  // Telemetry publication state: choose category and set telemetry field values
  const [telemetryCategory, setTelemetryCategory] = useState<'device' | 'environment'>('device');
  const [telemetryValues, setTelemetryValues] = useState<Record<string, number | ''>>(() => ({
    battery_level: '',
    voltage: '',
    uptime_seconds: '',
    channel_utilization: '',
    air_util_tx: '',
    temperature: '',
    relative_humidity: '',
    barometric_pressure: '',
    gas_resistance: '',
    iaq: '',
  }));
  // Telemetry request configuration

  // Data lists
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectableNodes, setSelectableNodes] = useState<Node[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [interfaces, setInterfaces] = useState<Interface[]>([]);
  const [selectedInterfaceId, setSelectedInterfaceId] = useState<number | null>(null);
  const defaultsHydratedRef = useRef(false);

  const isVirtualRestrictionActive = selectableNodes.length > 0 && selectableNodes.length < nodes.length;

  // Channels sorted by activity (most recent last_seen, then by total_messages)
  const sortedChannels = useMemo(() => {
    return [...channels].sort((a, b) => {
      const lb = b.last_seen ? new Date(b.last_seen).getTime() : 0;
      const la = a.last_seen ? new Date(a.last_seen).getTime() : 0;
      if (lb !== la) return lb - la;
      const tb = typeof b.total_messages === 'number' ? b.total_messages : 0;
      const ta = typeof a.total_messages === 'number' ? a.total_messages : 0;
      return tb - ta;
    });
  }, [channels]);

  // Selected objects (optional)
  const [selectedSourceNodeObj, setSelectedSourceNodeObj] = useState<Node | null>(null);
  const [selectedTargetNodeObj, setSelectedTargetNodeObj] = useState<Node | null>(null);
  const [selectedGatewayNodeObj, setSelectedGatewayNodeObj] = useState<Node | null>(null);
  const [selectedChannelObj, setSelectedChannelObj] = useState<Channel | null>(null);

  // Suggestion visibility flags
  const [showHwSuggestions, setShowHwSuggestions] = useState(false);

  // Hardware model search query (display text)
  const [hwModelQuery, setHwModelQuery] = useState('');
  useEffect(() => {
    if (!sourceNode) return;
    if (selectedSourceNodeObj?.node_id === sourceNode) return;
    const match = nodes.find((n) => n.node_id === sourceNode);
    if (match) {
      setSelectedSourceNodeObj(match);
    }
  }, [sourceNode, nodes, selectedSourceNodeObj]);

  useEffect(() => {
    if (!gatewayNode) return;
    if (selectedGatewayNodeObj?.node_id === gatewayNode) return;
    const match = nodes.find((n) => n.node_id === gatewayNode);
    if (match) {
      setSelectedGatewayNodeObj(match);
    }
  }, [gatewayNode, nodes, selectedGatewayNodeObj]);

  useEffect(() => {
    if (!channelName) {
      setSelectedChannelObj(null);
      return;
    }
    if (selectedChannelObj?.channel_id === channelName) return;
    const match = channels.find((c) => c.channel_id === channelName);
    if (match) {
      setSelectedChannelObj(match);
    }
  }, [channelName, channels, selectedChannelObj]);

  useEffect(() => {
    if (!isVirtualRestrictionActive) return;
    const allowedIds = new Set(selectableNodes.map((n) => n.node_id));
    setPeriodicForm((prev) => {
      let changed = false;
      let nextFrom = prev.from_node;
      let nextGateway = prev.gateway_node;

      if (nextFrom && !allowedIds.has(nextFrom)) {
        nextFrom = '';
        changed = true;
      }

      if (nextGateway && !allowedIds.has(nextGateway)) {
        nextGateway = '';
        changed = true;
      }

      if (!changed) {
        return prev;
      }

      return {
        ...prev,
        from_node: nextFrom,
        gateway_node: nextGateway,
      };
    });
  }, [isVirtualRestrictionActive, selectableNodes]);

  useEffect(() => {
    if (!isVirtualRestrictionActive) return;
    const allowedIds = new Set(selectableNodes.map((n) => n.node_id));
    if (sourceNode && !allowedIds.has(sourceNode)) {
      setSourceNode('');
      setSelectedSourceNodeObj(null);
    }
    if (gatewayNode && !allowedIds.has(gatewayNode)) {
      setGatewayNode('');
      setSelectedGatewayNodeObj(null);
    }
  }, [isVirtualRestrictionActive, selectableNodes, sourceNode, gatewayNode]);

  useEffect(() => {
    if (!isVirtualRestrictionActive) return;
    const allowedIds = new Set(selectableNodes.map((n) => n.node_id));
    setReactiveForm((prev) => {
      let nextFrom = prev.from_node;
      let nextGateway = prev.gateway_node;
      let changed = false;

      if (nextFrom && !allowedIds.has(nextFrom)) {
        nextFrom = '';
        changed = true;
      }

      if (nextGateway && !allowedIds.has(nextGateway)) {
        nextGateway = '';
        changed = true;
      }

      if (!changed) {
        return prev;
      }

      return {
        ...prev,
        from_node: nextFrom,
        gateway_node: nextGateway,
      };
    });
  }, [isVirtualRestrictionActive, selectableNodes]);


  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(PUBLISHING_DEFAULTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        sourceNode: string;
        gatewayNode: string;
        channelName: string;
        channelKey: string;
        hopLimit: number;
        hopStart: number;
        wantAck: boolean;
        interfaceId: number | null;
      }>;

      if (typeof parsed.sourceNode === 'string') setSourceNode(parsed.sourceNode);
      if (typeof parsed.gatewayNode === 'string') setGatewayNode(parsed.gatewayNode);
      if (typeof parsed.channelName === 'string') setChannelName(parsed.channelName);
      if (typeof parsed.channelKey === 'string') setChannelKey(parsed.channelKey);
      if (typeof parsed.hopLimit === 'number' && Number.isFinite(parsed.hopLimit)) setHopLimit(parsed.hopLimit);
      if (typeof parsed.hopStart === 'number' && Number.isFinite(parsed.hopStart)) setHopStart(parsed.hopStart);
      if (typeof parsed.wantAck === 'boolean') setWantAck(parsed.wantAck);
      if (parsed.interfaceId === null || typeof parsed.interfaceId === 'number') {
        setSelectedInterfaceId(parsed.interfaceId ?? null);
      }
    } catch (error) {
      console.warn('Failed to load publishing defaults', error);
    } finally {
      defaultsHydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!defaultsHydratedRef.current) return;

    const payload = {
      sourceNode,
      gatewayNode,
      channelName,
      channelKey,
      hopLimit,
      hopStart,
      wantAck,
      interfaceId: selectedInterfaceId,
    };

    try {
      window.localStorage.setItem(PUBLISHING_DEFAULTS_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to persist publishing defaults', error);
    }
  }, [sourceNode, gatewayNode, channelName, channelKey, hopLimit, hopStart, wantAck, selectedInterfaceId]);

  const publicationActions = useMemo(() => ([
    {
      id: 'text-message',
      title: 'Publish Text Message',
      description: 'Publish a one-shot text message to a destination node',
      icon: MessageSquare,
      category: 'One-Shot',
    },
    {
      id: 'traceroute',
      title: 'Traceroute Publication',
      description: 'Publish a traceroute request to discover network topology',
      icon: Target,
      category: 'One-Shot',
    },
    {
      id: 'telemetry-publish',
      title: 'Telemetry Publication',
      description: 'Publish a telemetry packet (device or environmental metrics) to a target node',
      icon: Activity,
      category: 'One-Shot',
    },
    {
      id: 'reachability-test',
      title: 'Test Reachability',
      description: 'Request an ACK via routing to measure latency and reachability for a node',
      icon: Signal,
      category: 'One-Shot'
    },
    {
      id: 'nodeinfo',
      title: 'Node Info Publication',
      description: 'Publish node information (name, hardware model, etc.)',
      icon: User,
      category: 'One-Shot'
    },
    {
      id: 'position',
      title: 'Position Publication',
      description: 'Publish GPS coordinates to a target node',
      icon: MapPin,
      category: 'One-Shot'
    }
  ]), []);

  const publicationServiceActions = [
    {
      id: 'reactive-publish',
      title: 'Reactive Network Discovery',
      description: 'Automatically publish responses when target nodes transmit',
      icon: Activity,
      category: 'Service'
    },
    {
      id: 'periodic-publish',
      title: 'Periodic Publication Jobs',
      description: 'Continuously publish packets and payloads at regular intervals',
      icon: Clock,
      category: 'Service'
    }
  ];

  // Fetch nodes, channels, and interfaces
  useEffect(() => {
    (async () => {
      try {
        // Prefer backend-controlled selectable nodes (may be filtered to virtual nodes when configured)
        let selectableList: Node[] = [];
        try {
          const selectableResp = await apiClient.getSelectablePublishNodes();
          selectableList = selectableResp.data || [];
        } catch (err) {
          selectableList = [];
        }

        const [nodesResp, channelsResp, interfacesResp] = await Promise.all([
          apiClient.getNodes(),
          apiClient.getChannelStatistics(),
          apiClient.getInterfaces(),
        ]);

        const allNodes = nodesResp.data || [];
        setNodes(allNodes);
        setSelectableNodes(selectableList.length > 0 ? selectableList : allNodes);
        setChannels(channelsResp.data?.channels || []);
        const fetchedInterfaces = interfacesResp.data || [];
        setInterfaces(fetchedInterfaces);
        const firstMqtt = fetchedInterfaces.find((i: Interface) => i.status === 'RUNNING' && i.name === 'MQTT');
        if (firstMqtt) {
          setSelectedInterfaceId((prev) => {
            if (prev != null && fetchedInterfaces.some((iface) => iface.id === prev)) {
              return prev;
            }
            return firstMqtt.id;
          });
        } else {
          setSelectedInterfaceId((prev) => {
            if (prev != null && fetchedInterfaces.some((iface) => iface.id === prev)) {
              return prev;
            }
            return null;
          });
        }
      } catch (e) {
        // ignore silently for now
      }
    })();
  }, []);

  useEffect(() => {
    if (!(selectedAction === 'reactive-publish' && isConfiguring)) {
      setShowReactiveSourceSuggestions(false);
      setShowReactiveGatewaySuggestions(false);
      return;
    }

    setReactiveLoading(true);
    (async () => {
      try {
        const response = await apiClient.getPublisherReactiveStatus();
        const payload = response.data;
        setReactiveStatus(payload);
        const cfg = payload.config || ({} as PublisherReactiveStatus['config']);
        setReactiveForm({
          enabled: Boolean(payload.enabled),
          from_node: cfg.from_node ?? '',
          gateway_node: cfg.gateway_node ?? '',
          channel_key: cfg.channel_key ?? '',
          hop_limit: cfg.hop_limit ?? 3,
          hop_start: cfg.hop_start ?? 3,
          want_ack: Boolean(cfg.want_ack ?? false),
          listen_interface_ids: Array.isArray(cfg.listen_interface_ids) ? cfg.listen_interface_ids : [],
          max_tries: typeof cfg.max_tries === 'number' ? cfg.max_tries : 0,
          trigger_ports: Array.isArray(cfg.trigger_ports) && cfg.trigger_ports.length > 0
            ? cfg.trigger_ports
            : INITIAL_REACTIVE_FORM.trigger_ports,
        });
      } catch (error: any) {
        showToast(error?.response?.data?.message || 'Failed to load reactive status', 'error');
      } finally {
        setReactiveLoading(false);
      }
    })();
  }, [selectedAction, isConfiguring]);

  

  // Helper: filter nodes by query across fields
  const filterNodes = (q: string, candidateList?: Node[]) => {
    const query = q.trim().toLowerCase();
    const list = candidateList && candidateList.length > 0 ? candidateList : nodes;
    if (!query) return list.slice(0, 10);
    return list.filter(n => {
      const fields = [
        n.short_name || '',
        n.long_name || '',
        n.node_id || '',
        String(n.node_num || ''),
        n.mac_address || '',
      ].map(s => s.toLowerCase());
      return fields.some(f => f.includes(query));
    }).slice(0, 10);
  };

  const resetPeriodicForm = useCallback(() => {
    setPeriodicForm({
      ...INITIAL_PERIODIC_FORM,
      payload_options: { ...INITIAL_PERIODIC_FORM.payload_options },
    });
  }, []);

  const updatePeriodicForm = useCallback(<K extends keyof PeriodicFormState>(key: K, value: PeriodicFormState[K]) => {
    setPeriodicForm((prev) => {
      if (key === 'pki_encrypted') {
        const checked = value as unknown as boolean;
        if (checked) {
          // store previous periodic channel values only once
          if (prevPeriodicChannelNameRef.current == null) prevPeriodicChannelNameRef.current = prev.channel_name;
          if (prevPeriodicChannelKeyRef.current == null) prevPeriodicChannelKeyRef.current = prev.channel_key;
          return { ...prev, [key]: value, channel_name: 'PKI', channel_key: '' } as PeriodicFormState;
        }
        // on uncheck: restore previous values if available
        const restoredName = prevPeriodicChannelNameRef.current ?? prev.channel_name;
        const restoredKey = prevPeriodicChannelKeyRef.current ?? prev.channel_key;
        prevPeriodicChannelNameRef.current = null;
        prevPeriodicChannelKeyRef.current = null;
        return { ...prev, [key]: value, channel_name: restoredName, channel_key: restoredKey } as PeriodicFormState;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  const updatePeriodicPayloadOption = useCallback(<K extends keyof PeriodicPayloadOptionsForm>(key: K, value: PeriodicPayloadOptionsForm[K]) => {
    setPeriodicForm((prev) => ({
      ...prev,
      payload_options: {
        ...prev.payload_options,
        [key]: value,
      },
    }));
  }, []);

  const buildPayloadOptionsForSubmit = useCallback(
    (payloadType: PeriodicPayloadType, options: PeriodicPayloadOptionsForm): Record<string, unknown> => {
      if (payloadType === 'text') {
        return {
          message_text: options.message_text.trim(),
        };
      }
      if (payloadType === 'position') {
        const latRaw = options.lat;
        const lonRaw = options.lon;
        const altRaw = options.alt;
        const latNumber = latRaw === '' ? null : Number(latRaw);
        const lonNumber = lonRaw === '' ? null : Number(lonRaw);
        const altNumber = altRaw === '' ? 0 : Number(altRaw);
        return {
          lat: latNumber !== null && Number.isFinite(latNumber) ? latNumber : null,
          lon: lonNumber !== null && Number.isFinite(lonNumber) ? lonNumber : null,
          alt: Number.isFinite(altNumber) ? altNumber : 0,
          want_response: Boolean(options.want_response),
        };
      }
      if (payloadType === 'nodeinfo') {
        return {
          short_name: options.short_name.trim(),
          long_name: options.long_name.trim(),
          hw_model: options.hw_model === '' ? null : Number(options.hw_model),
          public_key: options.public_key.trim(),
        };
      }
      if (payloadType === 'telemetry') {
        const telemetry_type = options.telemetry_type || 'device';
        const raw: Record<string, unknown> = {};
        const fieldNames = [
          'battery_level', 'voltage', 'uptime_seconds', 'channel_utilization', 'air_util_tx',
          'temperature', 'relative_humidity', 'barometric_pressure', 'gas_resistance', 'iaq',
        ];
        for (const k of fieldNames) {
          const v = (options as any)[k];
          if (v !== undefined && v !== null && v !== '') {
            raw[k] = typeof v === 'string' ? Number(v) : v;
          }
        }
        return {
          telemetry_type,
          telemetry_options: raw,
          want_response: Boolean(options.want_response),
        };
      }
      return {};
    },
    [],
  );

  const handleEditPeriodicJob = useCallback((job: PublisherPeriodicJob) => {
    const opts = (job.payload_options || {}) as Record<string, unknown>;
    const messageText = typeof opts['message_text'] === 'string' ? (opts['message_text'] as string) : '';
    const shortName = typeof opts['short_name'] === 'string' ? (opts['short_name'] as string) : '';
    const longName = typeof opts['long_name'] === 'string' ? (opts['long_name'] as string) : '';
    const hwModelRaw = opts['hw_model'];
    const hwModelValue = typeof hwModelRaw === 'number'
      ? hwModelRaw
      : typeof hwModelRaw === 'string' && hwModelRaw !== ''
        ? Number(hwModelRaw)
        : '';
    const publicKey = typeof opts['public_key'] === 'string' ? (opts['public_key'] as string) : '';
    const latRaw = opts['lat'];
    const lonRaw = opts['lon'];
    const altRaw = opts['alt'];
    const latValue = typeof latRaw === 'number' ? latRaw : typeof latRaw === 'string' && latRaw !== '' ? Number(latRaw) : '';
    const lonValue = typeof lonRaw === 'number' ? lonRaw : typeof lonRaw === 'string' && lonRaw !== '' ? Number(lonRaw) : '';
    const altValue = typeof altRaw === 'number' ? altRaw : typeof altRaw === 'string' && altRaw !== '' ? Number(altRaw) : '';
    const telemetryOptions = typeof opts['telemetry_options'] === 'object' && opts['telemetry_options'] ? (opts['telemetry_options'] as Record<string, unknown>) : undefined;
    const extractedWantResponse = typeof opts['want_response'] !== 'undefined'
      ? Boolean(opts['want_response'])
      : Boolean(telemetryOptions && telemetryOptions['want_response']);

    setPeriodicForm({
      id: job.id,
      name: job.name,
      description: job.description || '',
      enabled: job.enabled,
      payload_type: job.payload_type,
      from_node: job.from_node,
      to_node: job.to_node,
      channel_name: job.channel_name,
      gateway_node: job.gateway_node || '',
      channel_key: job.channel_key || '',
      hop_limit: job.hop_limit,
      hop_start: job.hop_start,
      want_ack: job.want_ack,
      pki_encrypted: job.payload_type === 'text' || job.payload_type === 'position' || job.payload_type === 'telemetry' ? job.pki_encrypted : false,
      period_seconds: job.period_seconds,
      interface_id: job.interface_id ?? null,
      payload_options: {
        message_text: messageText,
        short_name: shortName,
        long_name: longName,
        hw_model: hwModelValue,
        public_key: publicKey,
        lat: latValue,
        lon: lonValue,
        alt: altValue,
        telemetry_type: (opts['telemetry_type'] as any) || 'device',
        battery_level: typeof opts['telemetry_options'] === 'object' && opts['telemetry_options'] ? (opts['telemetry_options'] as any)['battery_level'] ?? '' : '',
        voltage: typeof opts['telemetry_options'] === 'object' && opts['telemetry_options'] ? (opts['telemetry_options'] as any)['voltage'] ?? '' : '',
        uptime_seconds: typeof opts['telemetry_options'] === 'object' && opts['telemetry_options'] ? (opts['telemetry_options'] as any)['uptime_seconds'] ?? '' : '',
        channel_utilization: typeof opts['telemetry_options'] === 'object' && opts['telemetry_options'] ? (opts['telemetry_options'] as any)['channel_utilization'] ?? '' : '',
        air_util_tx: typeof opts['telemetry_options'] === 'object' && opts['telemetry_options'] ? (opts['telemetry_options'] as any)['air_util_tx'] ?? '' : '',
        temperature: typeof opts['telemetry_options'] === 'object' && opts['telemetry_options'] ? (opts['telemetry_options'] as any)['temperature'] ?? '' : '',
        relative_humidity: typeof opts['telemetry_options'] === 'object' && opts['telemetry_options'] ? (opts['telemetry_options'] as any)['relative_humidity'] ?? '' : '',
        barometric_pressure: typeof opts['telemetry_options'] === 'object' && opts['telemetry_options'] ? (opts['telemetry_options'] as any)['barometric_pressure'] ?? '' : '',
        gas_resistance: typeof opts['telemetry_options'] === 'object' && opts['telemetry_options'] ? (opts['telemetry_options'] as any)['gas_resistance'] ?? '' : '',
        iaq: typeof telemetryOptions === 'object' && telemetryOptions ? (telemetryOptions as any)['iaq'] ?? '' : '',
        want_response: extractedWantResponse,
      },
    });
  }, []);

  const fetchPeriodicJobs = useCallback(async () => {
    setPeriodicLoading(true);
    try {
      const response = await apiClient.getPublisherPeriodicJobs();
      setPeriodicJobs(response.data || []);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to load periodic jobs', 'error');
    } finally {
      setPeriodicLoading(false);
    }
  }, [showToast]);

  const handlePeriodicSubmit = useCallback(async () => {
    if (periodicSaving) return;
    if (!periodicForm.name.trim()) {
      showToast('Please provide a job name.', 'error');
      return;
    }
    if (!periodicForm.from_node || !periodicForm.to_node || !periodicForm.channel_name) {
      showToast('Source node, target node, and channel are required.', 'error');
      return;
    }

    const sourceCandidates = isVirtualRestrictionActive ? selectableNodes : nodes;
    const validSource = sourceCandidates.some((node) => node.node_id === periodicForm.from_node);
    if (!validSource) {
      showToast('Please choose a valid source node from the list.', 'error');
      return;
    }

    const validTarget = nodes.some((node) => node.node_id === periodicForm.to_node);
    if (!validTarget) {
      showToast('Please choose a valid target node from the list.', 'error');
      return;
    }

    if (periodicForm.gateway_node) {
      const gatewayCandidates = isVirtualRestrictionActive ? selectableNodes : nodes;
      const validGateway = gatewayCandidates.some((node) => node.node_id === periodicForm.gateway_node);
      if (!validGateway) {
        showToast('Select a valid gateway node or leave blank to auto select.', 'error');
        return;
      }
    }

    const payloadOptions = buildPayloadOptionsForSubmit(periodicForm.payload_type, periodicForm.payload_options);

    if (periodicForm.payload_type === 'text') {
      const messageText = (payloadOptions as { message_text?: string }).message_text?.trim() ?? '';
      if (!messageText) {
        showToast('Message text is required for text payloads.', 'error');
        return;
      }
    }

    if (periodicForm.payload_type === 'position') {
      const positionOpts = payloadOptions as { lat?: number | null; lon?: number | null };
      if (positionOpts.lat == null || positionOpts.lon == null) {
        showToast('Latitude and longitude are required for position payloads.', 'error');
        return;
      }
    }

    if (periodicForm.payload_type === 'nodeinfo') {
      const nodeinfoOpts = payloadOptions as {
        short_name?: string;
        long_name?: string;
        hw_model?: number | null;
        public_key?: string;
      };
      if (!nodeinfoOpts.short_name || !nodeinfoOpts.long_name || nodeinfoOpts.hw_model == null || !nodeinfoOpts.public_key) {
        showToast('Node info payload requires short name, long name, hardware model, and public key.', 'error');
        return;
      }
    }

    setPeriodicSaving(true);

    const effectivePeriodicChannelName = periodicForm.pki_encrypted ? 'PKI' : periodicForm.channel_name;
    const effectivePeriodicChannelKey = periodicForm.pki_encrypted ? '' : periodicForm.channel_key.trim() || null;

    const basePayload: PublisherPeriodicJobCreatePayload = {
      name: periodicForm.name.trim(),
      description: periodicForm.description.trim() || undefined,
      enabled: periodicForm.enabled,
      payload_type: periodicForm.payload_type,
      from_node: periodicForm.from_node,
      to_node: periodicForm.to_node,
      channel_name: effectivePeriodicChannelName,
      gateway_node: periodicForm.gateway_node.trim() || null,
      channel_key: effectivePeriodicChannelKey,
      hop_limit: periodicForm.hop_limit,
      hop_start: periodicForm.hop_start,
      want_ack: periodicForm.want_ack,
      pki_encrypted: periodicForm.pki_encrypted,
      period_seconds: Math.max(30, periodicForm.period_seconds),
      interface_id: periodicForm.interface_id ?? null,
  payload_options: payloadOptions,
    };

    try {
      if (periodicForm.id) {
        const response = await apiClient.updatePublisherPeriodicJob(periodicForm.id, basePayload as PublisherPeriodicJobUpdatePayload);
        showToast('Periodic job updated', 'success');
        handleEditPeriodicJob(response.data);
      } else {
        const response = await apiClient.createPublisherPeriodicJob(basePayload);
        showToast('Periodic job created', 'success');
        handleEditPeriodicJob(response.data);
      }
      await fetchPeriodicJobs();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to save periodic job', 'error');
    } finally {
      setPeriodicSaving(false);
    }
  }, [periodicForm, periodicSaving, buildPayloadOptionsForSubmit, showToast, fetchPeriodicJobs, handleEditPeriodicJob, isVirtualRestrictionActive, selectableNodes, nodes]);

  const handlePeriodicDelete = useCallback(async (jobId: number) => {
    setPeriodicDeletingId(jobId);
    try {
      await apiClient.deletePublisherPeriodicJob(jobId);
      showToast('Periodic job deleted', 'success');
      if (periodicForm.id === jobId) {
        resetPeriodicForm();
      }
      await fetchPeriodicJobs();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to delete periodic job', 'error');
    } finally {
      setPeriodicDeletingId(null);
    }
  }, [periodicForm.id, fetchPeriodicJobs, resetPeriodicForm, showToast]);

  const handlePeriodicToggle = useCallback(async (job: PublisherPeriodicJob) => {
    setPeriodicTogglingId(job.id);
    try {
      await apiClient.updatePublisherPeriodicJob(job.id, { enabled: !job.enabled });
      showToast(`Job ${!job.enabled ? 'enabled' : 'disabled'}`, 'success');
      if (periodicForm.id === job.id) {
        updatePeriodicForm('enabled', !job.enabled);
      }
      await fetchPeriodicJobs();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to update job state', 'error');
    } finally {
      setPeriodicTogglingId(null);
    }
  }, [fetchPeriodicJobs, periodicForm.id, showToast, updatePeriodicForm]);

  useEffect(() => {
    if (selectedAction === 'periodic-publish' && isConfiguring) {
      fetchPeriodicJobs();
    }
  }, [selectedAction, isConfiguring, fetchPeriodicJobs]);

  useEffect(() => {
    if (selectedAction !== 'periodic-publish') {
      resetPeriodicForm();
    }
  }, [selectedAction, resetPeriodicForm]);

  // When source node selected and action requires details, populate fields
  useEffect(() => {
    if (!selectedSourceNodeObj) return;
    if (selectedAction === 'nodeinfo') {
      setShortName(selectedSourceNodeObj.short_name || '');
      setLongName(selectedSourceNodeObj.long_name || '');
      const raw = selectedSourceNodeObj.hw_model as any;
      // Support either string enum name or numeric enum value from backend
      if (raw !== undefined && raw !== null) {
        let found = undefined as { value: number; label: string } | undefined;
        if (typeof raw === 'number') {
          found = HW_MODELS.find(m => m.value === raw);
        } else {
          const txt = String(raw).toUpperCase();
          // If numeric string, match by value; otherwise match by label
          const maybeNum = Number(txt);
          if (!Number.isNaN(maybeNum)) {
            found = HW_MODELS.find(m => m.value === maybeNum);
          }
          if (!found) {
            found = HW_MODELS.find(m => m.label.toUpperCase() === txt);
          }
        }
        if (found) {
          setHwModel(found.value);
          setHwModelQuery(found.label);
        }
      }
      setPublicKey(selectedSourceNodeObj.public_key || '');
    }
    if (selectedAction === 'position') {
      if (selectedSourceNodeObj.latitude != null) setLat(Number(selectedSourceNodeObj.latitude));
      if (selectedSourceNodeObj.longitude != null) setLon(Number(selectedSourceNodeObj.longitude));
      if (selectedSourceNodeObj.altitude != null) setAlt(Number(selectedSourceNodeObj.altitude));
    }
    if (selectedAction === 'telemetry-publish') {
      // Prefill telemetry values from the selected node if available
      setTelemetryValues((prev) => ({
        ...prev,
        battery_level: selectedSourceNodeObj.battery_level ?? prev.battery_level,
        voltage: selectedSourceNodeObj.voltage ?? prev.voltage,
        uptime_seconds: selectedSourceNodeObj.uptime_seconds ?? prev.uptime_seconds,
        channel_utilization: selectedSourceNodeObj.channel_utilization ?? prev.channel_utilization,
        air_util_tx: selectedSourceNodeObj.air_util_tx ?? prev.air_util_tx,
        temperature: selectedSourceNodeObj.temperature ?? prev.temperature,
        relative_humidity: selectedSourceNodeObj.relative_humidity ?? prev.relative_humidity,
        barometric_pressure: selectedSourceNodeObj.barometric_pressure ?? prev.barometric_pressure,
        gas_resistance: selectedSourceNodeObj.gas_resistance ?? prev.gas_resistance,
        iaq: selectedSourceNodeObj.iaq ?? prev.iaq,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSourceNodeObj, selectedAction]);

  // Handlers to choose nodes and channels
  const handleChooseNode = (which: 'source'|'target'|'gateway', n: Node) => {
    const id = n.node_id;
    if (which === 'source') {
      setSourceNode(id);
      setSelectedSourceNodeObj(n);
    } else if (which === 'target') {
      setTargetNode(id);
      setSelectedTargetNodeObj(n);
    } else {
      setGatewayNode(id);
      setSelectedGatewayNodeObj(n);
    }
  };

  const applyChannelSelection = useCallback(async (
    channel: Channel,
    options: {
      setName: (value: string) => void;
      setKey?: (value: string) => void;
      setSelected?: (chan: Channel | null) => void;
    },
  ) => {
    options.setName(channel.channel_id);
    options.setSelected?.(channel);
    if (!options.setKey) {
      return;
    }
    try {
      const detail = await apiClient.getChannel(channel.channel_id, channel.channel_num);
      const psk = detail.data?.psk;
      if (psk) {
        options.setKey(psk);
      }
    } catch (error) {
      // Best-effort lookup; ignore failures and preserve typed channel key
    }
  }, []);

  const handleChooseChannel = useCallback(async (ch: Channel) => {
    await applyChannelSelection(ch, {
      setName: (next) => setChannelName(next),
      setKey: (next) => setChannelKey(next),
      setSelected: (channel) => setSelectedChannelObj(channel),
    });
  }, [applyChannelSelection]);

  const handlePeriodicNodeSelect = useCallback((field: 'from_node' | 'to_node' | 'gateway_node', node: Node) => {
    updatePeriodicForm(field, node.node_id);
  }, [updatePeriodicForm]);

  const handlePeriodicChannelSelect = useCallback(async (channel: Channel) => {
    await applyChannelSelection(channel, {
      setName: (next) => updatePeriodicForm('channel_name', next),
      setKey: (next) => updatePeriodicForm('channel_key', next),
    });
  }, [applyChannelSelection, updatePeriodicForm]);

  const oneShotActionIds = useMemo(() => publicationActions.map((action) => action.id), [publicationActions]);

  const clearActionParams = useCallback((options?: { goBack?: boolean }) => {
    if (!searchParams) return;
    const goBack = options?.goBack ?? true;
    const params = new URLSearchParams(searchParams.toString());
    const returnTab = params.get('returnTab');
    params.delete('action');
    params.delete('targetNode');
    params.delete('sourceNode');
    params.delete('returnTab');

    if (goBack && returnTab && returnTab !== 'actions') {
      if (returnTab === 'overview') {
        params.delete('tab');
      } else {
        params.set('tab', returnTab);
      }
    }

    const queryString = params.toString();
    router.replace(queryString ? `?${queryString}` : '?', { scroll: false });
  }, [router, searchParams]);

  const handleActionClick = (actionId: string) => {
    setSelectedAction(actionId);
    setIsConfiguring(true);
    if (actionId === 'reachability-test') {
      setWantAck(true);
    }
  };

  const updateReactiveForm = <K extends keyof ReactiveFormState>(key: K, value: ReactiveFormState[K]) => {
    setReactiveForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleReactiveChooseNode = (which: 'source' | 'gateway', node: Node) => {
    if (which === 'source') {
      updateReactiveForm('from_node', node.node_id);
      setShowReactiveSourceSuggestions(false);
    } else {
      updateReactiveForm('gateway_node', node.node_id);
      setShowReactiveGatewaySuggestions(false);
    }
  };

  const toggleReactiveTriggerPort = (portName: string) => {
    setReactiveForm(prev => {
      const exists = prev.trigger_ports.includes(portName);
      const trigger_ports = exists
        ? prev.trigger_ports.filter((value) => value !== portName)
        : [...prev.trigger_ports, portName];
      return { ...prev, trigger_ports };
    });
  };

  const toggleReactiveInterface = (interfaceId: number) => {
    setReactiveForm((prev) => {
      const exists = prev.listen_interface_ids.includes(interfaceId);
      const listen_interface_ids = exists
        ? prev.listen_interface_ids.filter((value) => value !== interfaceId)
        : [...prev.listen_interface_ids, interfaceId];
      return { ...prev, listen_interface_ids };
    });
  };

  const clearReactiveInterfaces = () => {
    updateReactiveForm('listen_interface_ids', []);
  };

  const handleSaveReactiveConfig = async () => {
    setReactiveSaving(true);
    try {
      const payload = {
        enabled: reactiveForm.enabled,
        from_node: reactiveForm.from_node || null,
        gateway_node: reactiveForm.gateway_node || null,
        channel_key: reactiveForm.channel_key || null,
        hop_limit: Number.isFinite(reactiveForm.hop_limit) ? reactiveForm.hop_limit : null,
        hop_start: Number.isFinite(reactiveForm.hop_start) ? reactiveForm.hop_start : null,
        want_ack: reactiveForm.want_ack,
        max_tries: Math.max(0, reactiveForm.max_tries),
        trigger_ports: reactiveForm.trigger_ports,
        listen_interface_ids: reactiveForm.listen_interface_ids,
      };

      const response = await apiClient.updatePublisherReactiveConfig(payload);
      const status = response.data;
      setReactiveStatus(status);
      const cfg = status.config;
      setReactiveForm({
        enabled: Boolean(status.enabled),
        from_node: cfg.from_node ?? '',
        gateway_node: cfg.gateway_node ?? '',
        channel_key: cfg.channel_key ?? '',
        hop_limit: cfg.hop_limit ?? 3,
        hop_start: cfg.hop_start ?? 3,
        want_ack: Boolean(cfg.want_ack ?? false),
        listen_interface_ids: Array.isArray(cfg.listen_interface_ids) ? cfg.listen_interface_ids : [],
        max_tries: typeof cfg.max_tries === 'number' ? cfg.max_tries : 0,
        trigger_ports: Array.isArray(cfg.trigger_ports) && cfg.trigger_ports.length > 0
          ? cfg.trigger_ports
          : INITIAL_REACTIVE_FORM.trigger_ports,
      });
      showToast('Reactive publication settings updated', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to update reactive publication settings', 'error');
    } finally {
      setReactiveSaving(false);
    }
  };

  const handleStartAction = async () => {
    try {
      if (!selectedAction) return;

      const interfaceId = selectedInterfaceId ?? undefined;
      const effectiveChannelName = pkiEncrypted ? 'PKI' : channelName;
      const effectiveChannelKey = pkiEncrypted ? '' : channelKey;

      if (selectedAction === 'text-message') {
        const payload: PublishTextMessagePayloadCompat = {
          from_node: sourceNode,
          to_node: targetNode,
          message_text: messageText,
          channel_name: effectiveChannelName,
          gateway_node: gatewayNode || undefined,
          channel_key: effectiveChannelKey,
          hop_limit: hopLimit,
          hop_start: hopStart,
          want_ack: wantAck,
          interface_id: interfaceId,
          pki_encrypted: pkiEncrypted,
        };
        await apiClient.publishTextMessage(payload as any);
      } else if (selectedAction === 'nodeinfo') {
        if (hwModel === '' || shortName === '' || longName === '') {
          showToast('Please fill short name, long name and hardware model', 'error');
          return;
        }
        await apiClient.publishNodeInfo({
          from_node: sourceNode,
          to_node: targetNode,
          short_name: shortName,
          long_name: longName,
          hw_model: Number(hwModel),
          public_key: publicKey,
          channel_name: effectiveChannelName,
          gateway_node: gatewayNode || undefined,
          channel_key: effectiveChannelKey,
          hop_limit: hopLimit,
          hop_start: hopStart,
          want_ack: wantAck,
          interface_id: interfaceId,
        });
      } else if (selectedAction === 'position') {
        if (lat === '' || lon === '') {
          showToast('Please provide latitude and longitude', 'error');
          return;
        }
        await apiClient.publishPosition({
          from_node: sourceNode,
          to_node: targetNode,
          lat: Number(lat),
          lon: Number(lon),
          alt: alt === '' ? 0 : Number(alt),
          channel_name: effectiveChannelName,
          gateway_node: gatewayNode || undefined,
          channel_key: effectiveChannelKey,
          hop_limit: hopLimit,
          hop_start: hopStart,
          want_ack: wantAck,
          want_response: wantResponse,
          pki_encrypted: pkiEncrypted,
          interface_id: interfaceId,
        });
      } else if (selectedAction === 'telemetry-publish') {
        // Telemetry publication: build telemetry fields payload and publish
        const fields: Record<string, number> = {};
        Object.entries(telemetryValues).forEach(([k, v]) => {
          if (v !== '' && typeof v === 'number' && Number.isFinite(v)) {
            fields[k] = v as number;
          }
        });

        if (Object.keys(fields).length === 0) {
          showToast('Please provide at least one telemetry field value to publish', 'error');
          return;
        }

        await apiClient.publishTelemetry({
          from_node: sourceNode,
          to_node: targetNode,
          channel_name: effectiveChannelName,
          gateway_node: gatewayNode || undefined,
          channel_key: effectiveChannelKey,
          hop_limit: hopLimit,
          hop_start: hopStart,
          want_ack: wantAck,
          // Allow the user to request a response via the 'Request response' checkbox
          want_response: wantResponse,
          telemetry_type: telemetryCategory,
          telemetry_options: fields,
          pki_encrypted: pkiEncrypted,
          interface_id: interfaceId,
        });
      } else if (selectedAction === 'reachability-test') {
        await apiClient.publishReachability({
          from_node: sourceNode,
          to_node: targetNode,
          channel_name: effectiveChannelName,
          gateway_node: gatewayNode || undefined,
          channel_key: effectiveChannelKey,
          hop_limit: hopLimit,
          hop_start: hopStart,
          want_ack: true,
          interface_id: interfaceId,
        });
      } else if (selectedAction === 'traceroute') {
        // Traceroute uses the generic payload only
        await apiClient.publishTraceroute({
          from_node: sourceNode,
          to_node: targetNode,
          channel_name: effectiveChannelName,
          gateway_node: gatewayNode || undefined,
          channel_key: effectiveChannelKey,
          hop_limit: hopLimit,
          hop_start: hopStart,
          want_ack: wantAck,
          interface_id: interfaceId,
        });
      }

      // Show success toast instead of alert
      showToast('Action sent successfully', 'success');
  clearActionParams();
      setIsConfiguring(false);
      setSelectedAction(null);
    } catch (e: any) {
      // Show error toast
      showToast(e?.response?.data?.message || 'Failed to start action', 'error');
    }
  };

  useEffect(() => {
    apiClient.getInterfaces().then(res => {
      const fetched = res.data || [];
      setInterfaces(fetched);
      const first = fetched.find(i => i.status === 'RUNNING' && i.name === 'MQTT');
      if (first) {
        setSelectedInterfaceId((prev) => {
          if (prev != null && fetched.some((iface) => iface.id === prev)) {
            return prev;
          }
          return first.id;
        });
      } else {
        setSelectedInterfaceId((prev) => {
          if (prev != null && fetched.some((iface) => iface.id === prev)) {
            return prev;
          }
          return null;
        });
      }
    }).catch((error) => {
      console.warn('Failed to refresh interfaces', error);
    });
  }, []);

  useEffect(() => {
    if (!searchParams) {
      return;
    }
    const actionParam = searchParams.get('action');
    if (!actionParam || !oneShotActionIds.includes(actionParam)) {
      return;
    }
    if (selectedAction !== actionParam || !isConfiguring) {
      setSelectedAction(actionParam);
      setIsConfiguring(true);
    }
    if (actionParam === 'reachability-test' && !wantAck) {
      setWantAck(true);
    }

    const targetParam = searchParams.get('targetNode');
    if (targetParam) {
      setTargetNode(targetParam);
      const match = nodes.find((n) => n.node_id === targetParam);
      if (match) {
        setSelectedTargetNodeObj(match);
      }
    }

    const sourceParam = searchParams.get('sourceNode');
    if (sourceParam) {
      setSourceNode(sourceParam);
      const match = nodes.find((n) => n.node_id === sourceParam);
      if (match) {
        setSelectedSourceNodeObj(match);
      }
    }
  }, [searchParams, oneShotActionIds, nodes, selectedAction, isConfiguring, wantAck]);

  if (isConfiguring && selectedAction) {
    const action = [...publicationActions, ...publicationServiceActions].find(a => a.id === selectedAction);
    if (!action) return null;
    
    const ActionIcon = action.icon;

    if (selectedAction === 'periodic-publish') {
      const availableNodes = isVirtualRestrictionActive ? selectableNodes : nodes;
      const mqttInterfaces = interfaces.filter((iface) => iface.name === 'MQTT');
      const currentJob = periodicForm.id ? periodicJobs.find((job) => job.id === periodicForm.id) : null;
      const nextRunText = currentJob ? formatDateTime(currentJob.next_run_at) : '—';
      const lastRunText = currentJob ? formatDateTime(currentJob.last_run_at) : '—';
      const lastStatus = currentJob ? currentJob.last_status : 'idle';

      const renderPayloadFields = () => {
        if (periodicForm.payload_type === 'text') {
          return (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Message Text</label>
              <textarea
                className={FORM_TEXTAREA_CLASS}
                rows={3}
                value={periodicForm.payload_options.message_text}
                onChange={(e) => updatePeriodicPayloadOption('message_text', e.target.value)}
                placeholder="Enter the message content"
              />
            </div>
          );
        }
        if (periodicForm.payload_type === 'position') {
          return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Latitude</label>
                <input
                  type="number"
                  step="any"
                  className={`${FORM_INPUT_CLASS} mt-1`}
                  value={periodicForm.payload_options.lat === '' ? '' : periodicForm.payload_options.lat}
                  onChange={(e) => updatePeriodicPayloadOption('lat', e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Longitude</label>
                <input
                  type="number"
                  step="any"
                  className={`${FORM_INPUT_CLASS} mt-1`}
                  value={periodicForm.payload_options.lon === '' ? '' : periodicForm.payload_options.lon}
                  onChange={(e) => updatePeriodicPayloadOption('lon', e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Altitude (m)</label>
                <input
                  type="number"
                  step="any"
                  className={`${FORM_INPUT_CLASS} mt-1`}
                  value={periodicForm.payload_options.alt === '' ? '' : periodicForm.payload_options.alt}
                  onChange={(e) => updatePeriodicPayloadOption('alt', e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div className="md:col-span-3 mt-2">
                <label className="inline-flex items-center">
                  <input type="checkbox" className="mr-2" checked={Boolean(periodicForm.payload_options.want_response)} onChange={(e) => updatePeriodicPayloadOption('want_response', e.target.checked)} />
                  <span className="text-sm text-gray-700">Request response from recipient</span>
                </label>
              </div>
            </div>
          );
        }
        if (periodicForm.payload_type === 'nodeinfo') {
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Short Name</label>
                  <input
                    type="text"
                    className={`${FORM_INPUT_CLASS} mt-1`}
                    value={periodicForm.payload_options.short_name}
                    onChange={(e) => updatePeriodicPayloadOption('short_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Long Name</label>
                  <input
                    type="text"
                    className={`${FORM_INPUT_CLASS} mt-1`}
                    value={periodicForm.payload_options.long_name}
                    onChange={(e) => updatePeriodicPayloadOption('long_name', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Hardware Model</label>
                  <select
                    className={`${FORM_SELECT_CLASS} mt-1`}
                    value={periodicForm.payload_options.hw_model === '' ? '' : periodicForm.payload_options.hw_model}
                    onChange={(e) => updatePeriodicPayloadOption('hw_model', e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">Select model</option>
                    {HW_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Public Key</label>
                  <textarea
                    className={`${FORM_TEXTAREA_CLASS} mt-1`}
                    rows={3}
                    value={periodicForm.payload_options.public_key}
                    onChange={(e) => updatePeriodicPayloadOption('public_key', e.target.value)}
                    placeholder="Paste the node public key"
                  />
                </div>
              </div>
            </div>
          );
        }
          if (periodicForm.payload_type === 'telemetry') {
            return (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Telemetry Category</label>
                  <select
                    className={`${FORM_SELECT_CLASS} mt-1`}
                    value={periodicForm.payload_options.telemetry_type}
                    onChange={(e) => updatePeriodicPayloadOption('telemetry_type', e.target.value as 'device' | 'environment')}
                  >
                    <option value="device">Device</option>
                    <option value="environment">Environment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Telemetry Fields (leave blank to omit)</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <input type="number" step="any" placeholder="battery_level" value={periodicForm.payload_options.battery_level as any} onChange={(e) => updatePeriodicPayloadOption('battery_level', e.target.value === '' ? '' : Number(e.target.value))} className={FORM_INPUT_CLASS} />
                    <input type="number" step="any" placeholder="voltage" value={periodicForm.payload_options.voltage as any} onChange={(e) => updatePeriodicPayloadOption('voltage', e.target.value === '' ? '' : Number(e.target.value))} className={FORM_INPUT_CLASS} />
                    <input type="number" step="1" placeholder="uptime_seconds" value={periodicForm.payload_options.uptime_seconds as any} onChange={(e) => updatePeriodicPayloadOption('uptime_seconds', e.target.value === '' ? '' : Number(e.target.value))} className={FORM_INPUT_CLASS} />
                    <input type="number" step="any" placeholder="channel_utilization" value={periodicForm.payload_options.channel_utilization as any} onChange={(e) => updatePeriodicPayloadOption('channel_utilization', e.target.value === '' ? '' : Number(e.target.value))} className={FORM_INPUT_CLASS} />
                    <input type="number" step="any" placeholder="air_util_tx" value={periodicForm.payload_options.air_util_tx as any} onChange={(e) => updatePeriodicPayloadOption('air_util_tx', e.target.value === '' ? '' : Number(e.target.value))} className={FORM_INPUT_CLASS} />
                    <input type="number" step="any" placeholder="temperature" value={periodicForm.payload_options.temperature as any} onChange={(e) => updatePeriodicPayloadOption('temperature', e.target.value === '' ? '' : Number(e.target.value))} className={FORM_INPUT_CLASS} />
                    <input type="number" step="any" placeholder="relative_humidity" value={periodicForm.payload_options.relative_humidity as any} onChange={(e) => updatePeriodicPayloadOption('relative_humidity', e.target.value === '' ? '' : Number(e.target.value))} className={FORM_INPUT_CLASS} />
                    <input type="number" step="any" placeholder="barometric_pressure" value={periodicForm.payload_options.barometric_pressure as any} onChange={(e) => updatePeriodicPayloadOption('barometric_pressure', e.target.value === '' ? '' : Number(e.target.value))} className={FORM_INPUT_CLASS} />
                    <input type="number" step="any" placeholder="gas_resistance" value={periodicForm.payload_options.gas_resistance as any} onChange={(e) => updatePeriodicPayloadOption('gas_resistance', e.target.value === '' ? '' : Number(e.target.value))} className={FORM_INPUT_CLASS} />
                    <input type="number" step="any" placeholder="iaq" value={periodicForm.payload_options.iaq as any} onChange={(e) => updatePeriodicPayloadOption('iaq', e.target.value === '' ? '' : Number(e.target.value))} className={FORM_INPUT_CLASS} />
                  </div>
                  <div className="mt-3">
                    <label className="inline-flex items-center">
                      <input type="checkbox" className="mr-2" checked={Boolean(periodicForm.payload_options.want_response)} onChange={(e) => updatePeriodicPayloadOption('want_response', e.target.checked)} />
                      <span className="text-sm text-gray-700">Request response from recipient</span>
                    </label>
                  </div>
                </div>
              </div>
            );
          }
        return (
          <p className="text-sm text-gray-600">Traceroute payload does not require additional configuration.</p>
        );
      };

      return (
        <div className="space-y-6">
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ActionIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{action.title}</h2>
                  <p className="text-sm text-gray-600">{action.description}</p>
                </div>
              </div>
              <button
                type="button"
                className="text-sm text-gray-600 hover:text-gray-900"
                onClick={() => {
                  clearActionParams();
                  setIsConfiguring(false);
                  setSelectedAction(null);
                }}
              >
                Close
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Configured Jobs</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fetchPeriodicJobs()}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-blue-400"
                      >
                        {periodicLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Refresh
                      </button>
                      <button
                        type="button"
                        onClick={resetPeriodicForm}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                      >
                        <PlusCircle className="h-4 w-4" />
                        New
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {periodicLoading ? (
                      <div className="flex items-center justify-center py-6 text-gray-500 text-sm">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="ml-2">Loading jobs…</span>
                      </div>
                    ) : periodicJobs.length === 0 ? (
                      <p className="text-sm text-gray-600">No periodic jobs configured yet.</p>
                    ) : (
                      periodicJobs.map((job) => {
                        const isActive = periodicForm.id === job.id;
                        return (
                          <div key={job.id} className="rounded-lg border border-gray-200 p-3 bg-white shadow-sm">
                            <button
                              type="button"
                              onClick={() => handleEditPeriodicJob(job)}
                              className={`w-full text-left rounded-md border px-3 py-2 transition ${isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{job.name}</p>
                                  <p className="text-xs text-gray-600 uppercase tracking-wide">{job.payload_type}</p>
                                </div>
                                <div className="text-right text-xs text-gray-600 space-y-1">
                                  <div className={`font-medium ${job.enabled ? 'text-green-600' : 'text-gray-500'}`}>
                                    {job.enabled ? 'Enabled' : 'Disabled'}
                                  </div>
                                  <div>Next: {formatDateTime(job.next_run_at)}</div>
                                  <div>Last: {formatDateTime(job.last_run_at)}</div>
                                </div>
                              </div>
                              <div className="mt-2 text-xs text-gray-500">
                                Status: {job.last_status || 'idle'}
                                {job.last_error_message ? ` · ${job.last_error_message}` : ''}
                              </div>
                            </button>
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handlePeriodicToggle(job);
                                }}
                                disabled={periodicTogglingId === job.id}
                                className={`flex-1 inline-flex items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-sm ${job.enabled ? 'border-yellow-500 text-yellow-700 hover:bg-yellow-50' : 'border-green-500 text-green-700 hover:bg-green-50'}`}
                              >
                                {periodicTogglingId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                {job.enabled ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handlePeriodicDelete(job.id);
                                }}
                                disabled={periodicDeletingId === job.id}
                                className="inline-flex items-center justify-center gap-1 rounded-md border border-red-500 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                              >
                                {periodicDeletingId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                <div className="xl:col-span-2">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 space-y-5">
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                      <span>
                        <strong>Status:</strong> {lastStatus}
                      </span>
                      <span>
                        <strong>Next run:</strong> {nextRunText}
                      </span>
                      <span>
                        <strong>Last run:</strong> {lastRunText}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Job Name</label>
                        <input
                          type="text"
                          className={`${FORM_INPUT_CLASS} mt-1`}
                          value={periodicForm.name}
                          onChange={(e) => updatePeriodicForm('name', e.target.value)}
                          placeholder="Periodic publication job name"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="block text-sm font-medium text-gray-700">Enabled</span>
                          <p className="text-xs text-gray-500">Job participates in scheduling when enabled.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => updatePeriodicForm('enabled', !periodicForm.enabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${periodicForm.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${periodicForm.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                          <span className="sr-only">Toggle job enabled</span>
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Description</label>
                      <textarea
                        className={`${FORM_TEXTAREA_CLASS} mt-1`}
                        rows={2}
                        value={periodicForm.description}
                        onChange={(e) => updatePeriodicForm('description', e.target.value)}
                        placeholder="Optional job description"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Payload Type</label>
                        <select
                          className={`${FORM_SELECT_CLASS} mt-1`}
                          value={periodicForm.payload_type}
                          onChange={(e) => updatePeriodicForm('payload_type', e.target.value as PeriodicPayloadType)}
                        >
                          <option value="text">Text message</option>
                          <option value="position">Position</option>
                          <option value="nodeinfo">Node info</option>
                          <option value="traceroute">Traceroute</option>
                          <option value="telemetry">Telemetry</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Period (seconds)</label>
                        <input
                          type="number"
                          min={30}
                          className={`${FORM_INPUT_CLASS} mt-1`}
                          value={periodicForm.period_seconds}
                          onChange={(e) => updatePeriodicForm('period_seconds', Number(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <NodeAutocompleteInput
                        id="periodic-from-node"
                        label="From Node"
                        value={periodicForm.from_node}
                        onChange={(next) => updatePeriodicForm('from_node', next)}
                        nodes={availableNodes}
                        filterNodes={filterNodes}
                        placeholder="Select source node"
                        onSelectNode={(node) => handlePeriodicNodeSelect('from_node', node)}
                        helperText={isVirtualRestrictionActive ? 'Source restricted to approved virtual nodes.' : undefined}
                        required
                      />
                      <NodeAutocompleteInput
                        id="periodic-to-node"
                        label="Target Node"
                        value={periodicForm.to_node}
                        onChange={(next) => updatePeriodicForm('to_node', next)}
                        nodes={nodes}
                        filterNodes={filterNodes}
                        placeholder="Select destination node"
                        onSelectNode={(node) => handlePeriodicNodeSelect('to_node', node)}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <NodeAutocompleteInput
                        id="periodic-gateway-node"
                        label="Gateway Node (optional)"
                        value={periodicForm.gateway_node}
                        onChange={(next) => updatePeriodicForm('gateway_node', next)}
                        nodes={isVirtualRestrictionActive ? selectableNodes : nodes}
                        filterNodes={filterNodes}
                        placeholder="Leave blank for default gateway"
                        onSelectNode={(node) => handlePeriodicNodeSelect('gateway_node', node)}
                        helperText={isVirtualRestrictionActive ? 'Optional override when routing through approved virtual nodes.' : 'Optional override when routing through a specific node'}
                      />
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Publish Interface</label>
                        <select
                          className={`${FORM_SELECT_CLASS} mt-1`}
                          value={periodicForm.interface_id ?? ''}
                          onChange={(e) => updatePeriodicForm('interface_id', e.target.value === '' ? null : Number(e.target.value))}
                        >
                          <option value="">Auto select</option>
                          {mqttInterfaces.map((iface) => (
                            <option key={iface.id} value={iface.id}>
                              {iface.display_name || `Interface ${iface.id}`} ({iface.status})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ChannelAutocompleteInput
                        id="periodic-channel-name"
                        label="Channel Name"
                        value={periodicForm.channel_name}
                        onChange={(next) => updatePeriodicForm('channel_name', next)}
                        channels={channels}
                        sortedChannels={sortedChannels}
                        placeholder="Enter or select channel"
                        onSelectChannel={handlePeriodicChannelSelect}
                        helperText="We will fetch the channel key when possible."
                      />
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Channel Key (optional)</label>
                        <input
                          type="text"
                          className={`${FORM_INPUT_CLASS} mt-1`}
                          value={periodicForm.channel_key}
                          onChange={(e) => updatePeriodicForm('channel_key', e.target.value)}
                          placeholder="AES channel key"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Hop Limit</label>
                        <input
                          type="number"
                          className={`${FORM_INPUT_CLASS} mt-1`}
                          value={periodicForm.hop_limit}
                          onChange={(e) => updatePeriodicForm('hop_limit', Number(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Hop Start</label>
                        <input
                          type="number"
                          className={`${FORM_INPUT_CLASS} mt-1`}
                          value={periodicForm.hop_start}
                          onChange={(e) => updatePeriodicForm('hop_start', Number(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="block text-sm font-medium text-gray-700">Request ACK</span>
                          <p className="text-xs text-gray-500">Set whether published packets should request acknowledgements.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => updatePeriodicForm('want_ack', !periodicForm.want_ack)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${periodicForm.want_ack ? 'bg-blue-600' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${periodicForm.want_ack ? 'translate-x-5' : 'translate-x-1'}`} />
                          <span className="sr-only">Toggle ACK requirement</span>
                        </button>
                      </div>
                      {(periodicForm.payload_type === 'text' || periodicForm.payload_type === 'position' || periodicForm.payload_type === 'telemetry') && (
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="block text-sm font-medium text-gray-700">PKI Encryption</span>
                            <p className="text-xs text-gray-500">Encrypt published packets using the PKI keys on record.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => updatePeriodicForm('pki_encrypted', !periodicForm.pki_encrypted)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${periodicForm.pki_encrypted ? 'bg-blue-600' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${periodicForm.pki_encrypted ? 'translate-x-5' : 'translate-x-1'}`} />
                            <span className="sr-only">Toggle PKI encryption</span>
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="border rounded-md border-dashed border-gray-300 bg-white p-4">
                      {renderPayloadFields()}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-200">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={resetPeriodicForm}
                          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:border-blue-400"
                        >
                          Reset
                        </button>
                        {periodicForm.id && (
                          <button
                            type="button"
                            onClick={() => periodicForm.id && handlePeriodicDelete(periodicForm.id)}
                            disabled={periodicDeletingId === periodicForm.id}
                            className="inline-flex items-center gap-1 rounded-md border border-red-500 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            {periodicDeletingId === periodicForm.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Delete
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handlePeriodicSubmit}
                        disabled={periodicSaving}
                        className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm text-white ${periodicSaving ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                      >
                        {periodicSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Save Job
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (selectedAction === 'reactive-publish') {
      const attemptEntries = reactiveStatus ? Object.entries(reactiveStatus.attempts || {}) : [];
      const attemptWindowMinutes = reactiveStatus ? Math.round(reactiveStatus.attempt_window_seconds / 60) : null;
      const listenerDetails = reactiveStatus?.config.listen_interfaces ?? [];
      const listeningOnAll = reactiveForm.listen_interface_ids.length === 0;
      const selectedListenerIds = new Set(reactiveForm.listen_interface_ids);
      const statusRank = (status?: string | null) => {
        if (status === 'RUNNING') return 0;
        if (status === 'CONNECTING') return 1;
        if (status === 'INIT') return 2;
        if (status === 'STOPPED') return 3;
        return 4;
      };
      const interfaceQuery = reactiveInterfaceQuery.trim().toLowerCase();
      const filteredInterfaces = interfaces
        .filter((iface) => {
          if (!interfaceQuery) return true;
          const label = `${iface.display_name || iface.name} ${iface.mqtt_topic || ''}`.toLowerCase();
          return label.includes(interfaceQuery);
        })
        .sort((a, b) => {
          const rankDiff = statusRank(a.status) - statusRank(b.status);
          if (rankDiff !== 0) return rankDiff;
          return (a.display_name || a.name).localeCompare(b.display_name || b.name);
        });

      return (
        <div className={`space-y-6 ${className}`}>
          {/* Toast */}
          {toast && (
            <div className="fixed bottom-4 right-4 z-50" role="status" aria-live="polite">
              <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
                {toast.type === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                <div className="text-sm font-medium">{toast.message}</div>
                <button aria-label="Close" onClick={() => setToast(null)} className="ml-2 text-current/60 hover:text-current">×</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <ActionIcon className="h-6 w-6 text-blue-600" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Reactive Network Discovery</h2>
                  <p className="text-sm text-gray-600">Configure automatic traceroute publications when target nodes transmit.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsConfiguring(false);
                  setSelectedAction(null);
                  clearActionParams();
                }}
                className="text-gray-700 hover:text-gray-900"
              >
                ×
              </button>
            </div>

            {reactiveLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-600">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                <span>Loading reactive settings…</span>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-blue-900">Service state</h3>
                      <p className="text-sm text-blue-800">
                        {attemptWindowMinutes ? `Nodes are limited to ${reactiveForm.max_tries} attempts every ~${attemptWindowMinutes} minutes.` : 'Set the maximum attempts per node within the rolling window.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-blue-900">
                        {reactiveForm.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={reactiveForm.enabled}
                        onClick={() => updateReactiveForm('enabled', !reactiveForm.enabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${reactiveForm.enabled ? 'bg-blue-600' : 'bg-blue-200'}`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${reactiveForm.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                        <span className="sr-only">Toggle reactive discovery</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-900 mb-2">Publish from node</label>
                    <input
                      value={reactiveForm.from_node}
                      onChange={(e) => updateReactiveForm('from_node', (e.target as HTMLInputElement).value)}
                      onFocus={() => setShowReactiveSourceSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowReactiveSourceSuggestions(false), 150)}
                      type="text"
                      placeholder="!abcdef01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                    {showReactiveSourceSuggestions && filterNodes(reactiveForm.from_node, selectableNodes).length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                        {filterNodes(reactiveForm.from_node, selectableNodes).map((nodeItem) => (
                          <div
                            key={nodeItem.id}
                            role="button"
                            tabIndex={-1}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleReactiveChooseNode('source', nodeItem);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 cursor-pointer"
                          >
                            <div className="text-sm text-gray-900 font-medium">{nodeItem.short_name || nodeItem.long_name || nodeItem.node_id}</div>
                            <div className="text-xs text-gray-600">{nodeItem.long_name || nodeItem.short_name} • {nodeItem.node_id} • #{nodeItem.node_num}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-900 mb-2">Gateway node (optional)</label>
                    <input
                      value={reactiveForm.gateway_node}
                      onChange={(e) => updateReactiveForm('gateway_node', (e.target as HTMLInputElement).value)}
                      onFocus={() => setShowReactiveGatewaySuggestions(true)}
                      onBlur={() => setTimeout(() => setShowReactiveGatewaySuggestions(false), 150)}
                      type="text"
                      placeholder="!deadbeef"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                    {showReactiveGatewaySuggestions && filterNodes(reactiveForm.gateway_node, selectableNodes).length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                        {filterNodes(reactiveForm.gateway_node, selectableNodes).map((nodeItem) => (
                          <div
                            key={nodeItem.id}
                            role="button"
                            tabIndex={-1}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleReactiveChooseNode('gateway', nodeItem);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 cursor-pointer"
                          >
                            <div className="text-sm text-gray-900 font-medium">{nodeItem.short_name || nodeItem.long_name || nodeItem.node_id}</div>
                            <div className="text-xs text-gray-600">{nodeItem.long_name || nodeItem.short_name} • {nodeItem.node_id} • #{nodeItem.node_num}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white/70 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Listener interfaces</h3>
                      <p className="text-xs text-gray-600">Select which interfaces should trigger reactive traceroutes. Leave empty to react to packets from any interface.</p>
                    </div>
                    <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto">
                      <input
                        type="text"
                        value={reactiveInterfaceQuery}
                        onChange={(e) => setReactiveInterfaceQuery((e.target as HTMLInputElement).value)}
                        placeholder="Search interfaces…"
                        className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex items-center gap-2 self-end">
                        <button
                          type="button"
                          onClick={() => updateReactiveForm('listen_interface_ids', filteredInterfaces.filter((iface) => iface.status === 'RUNNING').map((iface) => iface.id))}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          Select running
                        </button>
                        <button
                          type="button"
                          onClick={clearReactiveInterfaces}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          Listen on all
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredInterfaces.length > 0 ? (
                      filteredInterfaces.map((iface) => {
                        const selected = selectedListenerIds.has(iface.id);
                        const isRunning = iface.status === 'RUNNING';
                        return (
                          <label
                            key={iface.id}
                            className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleReactiveInterface(iface.id)}
                              className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900">{iface.display_name || iface.name}</div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 mt-1">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${isRunning ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {iface.status || 'UNKNOWN'}
                                </span>
                                <span>{iface.name}</span>
                                {iface.mqtt_topic && <span className="truncate max-w-[12rem]">{iface.mqtt_topic}</span>}
                              </div>
                            </div>
                          </label>
                        );
                      })
                    ) : (
                      <div className="col-span-full rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                        {interfaces.length === 0 ? 'No interfaces available from the backend.' : 'No interfaces match your search. Try a different query or clear the filter.'}
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    {listeningOnAll
                      ? 'Listening on all interfaces. Select specific interfaces to limit the trigger scope.'
                      : `Listening on ${reactiveForm.listen_interface_ids.length} interface${reactiveForm.listen_interface_ids.length === 1 ? '' : 's'}.`}
                  </p>
                  {listenerDetails.length > 0 && (
                    <p className="mt-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">Backend selection preview:</span>{' '}
                      {listenerDetails
                        .map((item) => `${item.display_name || item.name || `#${item.id}`}${item.status ? ` (${item.status})` : ''}`)
                        .join(', ')}
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-gray-200 bg-white/70 p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Trigger on packet types</h3>
                      <p className="text-xs text-gray-600">Select which packets should trigger reactive traceroute injections.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const allValues = REACTIVE_TRIGGER_OPTIONS.map((opt) => opt.value);
                        const hasAll = allValues.every((value) => reactiveForm.trigger_ports.includes(value));
                        updateReactiveForm('trigger_ports', hasAll ? [] : allValues);
                      }}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      {reactiveForm.trigger_ports.length === REACTIVE_TRIGGER_OPTIONS.length ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {REACTIVE_TRIGGER_OPTIONS.map((option) => {
                      const checked = reactiveForm.trigger_ports.includes(option.value);
                      return (
                        <label
                          key={option.value}
                          className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition ${checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleReactiveTriggerPort(option.value)}
                            className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{option.label}</div>
                            <p className="text-xs text-gray-600 mt-1">{option.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Hop limit</label>
                    <input
                      value={reactiveForm.hop_limit}
                      onChange={(e) => updateReactiveForm('hop_limit', Number((e.target as HTMLInputElement).value || 0))}
                      type="number"
                      min={0}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Hop start</label>
                    <input
                      value={reactiveForm.hop_start}
                      onChange={(e) => updateReactiveForm('hop_start', Number((e.target as HTMLInputElement).value || 0))}
                      type="number"
                      min={0}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Max attempts per node</label>
                    <input
                      value={reactiveForm.max_tries}
                      onChange={(e) => updateReactiveForm('max_tries', Math.max(0, Number((e.target as HTMLInputElement).value || 0)))}
                      type="number"
                      min={0}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">Request ACK</label>
                      <div className="h-10 flex items-center">
                        <input
                          type="checkbox"
                          checked={reactiveForm.want_ack}
                          onChange={(e) => updateReactiveForm('want_ack', (e.target as HTMLInputElement).checked)}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setIsConfiguring(false);
                      setSelectedAction(null);
                      clearActionParams();
                    }}
                    className="px-4 py-2 text-gray-900 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveReactiveConfig}
                    disabled={reactiveSaving}
                    className={`px-4 py-2 rounded-md text-white flex items-center gap-2 ${reactiveSaving ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    {reactiveSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                    <span>Save settings</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
    
    return (
      <div className={`space-y-6 ${className}`}>
        {/* Toast */}
        {toast && (
          <div className="fixed bottom-4 right-4 z-50" role="status" aria-live="polite">
            <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
              {toast.type === 'success' ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              <div className="text-sm font-medium">{toast.message}</div>
              <button aria-label="Close" onClick={() => setToast(null)} className="ml-2 text-current/60 hover:text-current">×</button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <ActionIcon className="h-6 w-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Configure {action.title}</h2>
            </div>
            <button
              onClick={() => {
                setIsConfiguring(false);
                setSelectedAction(null);
                clearActionParams();
              }}
              className="text-gray-700 hover:text-gray-900"
            >
              ×
            </button>
          </div>

          {/* Configuration form */}
          <div className="space-y-4">
            {/* Interface selection dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Interface</label>
              <select
                value={selectedInterfaceId ?? ''}
                onChange={e => {
                  const value = (e.target as HTMLSelectElement).value;
                  setSelectedInterfaceId(value ? Number(value) : null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              >
                <option value="">Select interface…</option>
                {interfaces
                  .filter(i => i.status === 'RUNNING' && i.name === 'MQTT')
                  .map(i => (
                    <option key={i.id} value={i.id}>
                      {i.display_name} ({i.mqtt_topic})
                    </option>
                  ))}
              </select>
              {interfaces.length === 0 && (
                <div className="text-xs text-red-600 mt-1">No interfaces available. Please check backend status.</div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NodeAutocompleteInput
                id="publish-source-node"
                label="Source address"
                value={sourceNode}
                onChange={(next) => {
                  setSourceNode(next);
                  setSelectedSourceNodeObj(null);
                }}
                nodes={selectableNodes}
                filterNodes={filterNodes}
                placeholder="Source node ID"
                required
                helperText={isVirtualRestrictionActive ? 'Only virtual nodes can be used as publication sources.' : undefined}
                onSelectNode={(node) => handleChooseNode('source', node)}
              />
              <NodeAutocompleteInput
                id="publish-target-node"
                label="Destination address"
                value={targetNode}
                onChange={(next) => {
                  setTargetNode(next);
                  setSelectedTargetNodeObj(null);
                }}
                nodes={nodes}
                filterNodes={filterNodes}
                placeholder="Node ID or broadcast (!ffffffff)"
                required
                onSelectNode={(node) => handleChooseNode('target', node)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ChannelAutocompleteInput
                id="publish-channel"
                label="Channel Name"
                value={channelName}
                onChange={(next) => {
                  setChannelName(next);
                  setSelectedChannelObj(null);
                }}
                channels={channels}
                sortedChannels={sortedChannels}
                placeholder="LongFast"
                onSelectChannel={(channel) => handleChooseChannel(channel)}
              />
              <NodeAutocompleteInput
                id="publish-gateway-node"
                label="Gateway Node (optional)"
                value={gatewayNode}
                onChange={(next) => {
                  setGatewayNode(next);
                  setSelectedGatewayNodeObj(null);
                }}
                nodes={selectableNodes}
                filterNodes={filterNodes}
                placeholder="!deadbeef"
                helperText="Leave blank to publish without a fixed gateway."
                onSelectNode={(node) => handleChooseNode('gateway', node)}
              />
            </div>

            {/* Message field for text publication */}
            {selectedAction === 'text-message' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Message</label>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText((e.target as HTMLTextAreaElement).value)}
                    rows={3}
                    placeholder="Hello mesh…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
                {/* PKI Encrypted checkbox removed here to avoid duplication with Transmission Options */}
              </>
            )}

            {/* Transmission Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Channel Key (base64)</label>
                <input
                  value={channelKey}
                  onChange={(e) => setChannelKey((e.target as HTMLInputElement).value)}
                  type="text"
                  placeholder="Leave blank for no encryption"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Want ACK</label>
                <div className="h-10 flex items-center">
                  <input
                    id="wantAck"
                    checked={selectedAction === 'reachability-test' ? true : wantAck}
                    onChange={(e) => setWantAck((e.target as HTMLInputElement).checked)}
                    type="checkbox"
                    disabled={selectedAction === 'reachability-test'}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-60"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">PKI Encrypted</label>
                <div className="h-10 flex items-center">
                  <input
                    id="transmitPkiEncrypted"
                    checked={pkiEncrypted}
                    onChange={(e) => {
                      const checked = (e.target as HTMLInputElement).checked;
                      setPkiEncrypted(checked);
                      if (checked) {
                        if (prevChannelNameRef.current == null) prevChannelNameRef.current = channelName;
                        if (prevChannelKeyRef.current == null) prevChannelKeyRef.current = channelKey;
                        setChannelName('PKI');
                        setSelectedChannelObj(null);
                        setChannelKey('');
                      } else {
                        if (prevChannelNameRef.current != null) {
                          setChannelName(prevChannelNameRef.current);
                          setSelectedChannelObj(null);
                          prevChannelNameRef.current = null;
                        }
                        if (prevChannelKeyRef.current != null) {
                          setChannelKey(prevChannelKeyRef.current);
                          prevChannelKeyRef.current = null;
                        }
                      }
                    }}
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Hop Limit</label>
                <input
                  value={hopLimit}
                  onChange={(e) => setHopLimit(Number((e.target as HTMLInputElement).value || 0))}
                  type="number"
                  min={0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Hop Start</label>
                <input
                  value={hopStart}
                  onChange={(e) => setHopStart(Number((e.target as HTMLInputElement).value || 0))}
                  type="number"
                  min={0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
            </div>

            {selectedAction === 'nodeinfo' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Short Name
                    </label>
                    <input
                      value={shortName}
                      onChange={(e) => setShortName((e.target as HTMLInputElement).value)}
                      type="text"
                      placeholder="Node short name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Long Name
                    </label>
                    <input
                      value={longName}
                      onChange={(e) => setLongName((e.target as HTMLInputElement).value)}
                      type="text"
                      placeholder="Node long name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Hardware Model
                    </label>
                    <input
                      value={hwModelQuery}
                      onChange={(e) => { setHwModelQuery((e.target as HTMLInputElement).value); }}
                      onFocus={() => setShowHwSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowHwSuggestions(false), 150)}
                      type="text"
                      placeholder="Search model (e.g., HELTEC_V3)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                    {showHwSuggestions && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                        {HW_MODELS
                          .filter(m => {
                            const q = hwModelQuery.trim().toLowerCase();
                            if (!q) return true;
                            return m.label.toLowerCase().includes(q) || String(m.value).includes(q);
                          })
                          .slice(0, 20)
                          .map((m) => (
                            <div
                              key={m.value}
                              role="button"
                              tabIndex={-1}
                              onMouseDown={(e) => { e.preventDefault(); setHwModel(m.value); setHwModelQuery(m.label); setShowHwSuggestions(false); }}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 cursor-pointer"
                            >
                              <div className="text-sm text-gray-900 font-medium">{m.label}</div>
                              <div className="text-xs text-gray-600">Value: {m.value}</div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Public Key (base64)
                    </label>
                    <input
                      value={publicKey}
                      onChange={(e) => setPublicKey((e.target as HTMLInputElement).value)}
                      type="text"
                      placeholder="Optional public key"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                </div>
              </>
            )}

            {selectedAction === 'position' && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Latitude
                  </label>
                  <input
                    value={lat}
                    onChange={(e) => setLat(e.target.value === '' ? '' : Number(e.target.value))}
                    type="number"
                    step="any"
                    placeholder="0.000000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Longitude
                  </label>
                  <input
                    value={lon}
                    onChange={(e) => setLon(e.target.value === '' ? '' : Number(e.target.value))}
                    type="number"
                    step="any"
                    placeholder="0.000000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Altitude (m)
                  </label>
                  <input
                    value={alt}
                    onChange={(e) => setAlt(e.target.value === '' ? '' : Number(e.target.value))}
                    type="number"
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                  <div className="mt-3">
                    <label className="inline-flex items-center space-x-2">
                      <input type="checkbox" checked={wantResponse} onChange={(e) => setWantResponse(e.target.checked)} />
                      <span className="text-sm text-gray-700">Want response</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {selectedAction === 'telemetry-publish' && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 mt-1">Publish a telemetry packet containing the values below. Leave a field blank to omit it.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Telemetry Category</label>
                  <select
                    value={telemetryCategory}
                    onChange={(e) => setTelemetryCategory(e.target.value as 'device' | 'environment')}
                    className={FORM_SELECT_CLASS}
                  >
                    <option value="device">Device Metrics</option>
                    <option value="environment">Environmental Metrics</option>
                  </select>
                </div>

                <div>
                  <label className="inline-flex items-center space-x-2">
                    <input type="checkbox" checked={wantResponse} onChange={(e) => setWantResponse(e.target.checked)} />
                    <span className="text-sm text-gray-700">Want response</span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Telemetry Fields</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {telemetryCategory === 'device' ? (
                      <>
                        <div>
                          <label className="block text-xs text-gray-700">Battery Level (%)</label>
                          <input type="number" step="any" value={telemetryValues.battery_level} onChange={(e) => setTelemetryValues(s => ({ ...s, battery_level: e.target.value === '' ? '' : Number(e.target.value) }))} className={FORM_INPUT_CLASS + ' mt-1'} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700">Voltage (V)</label>
                          <input type="number" step="any" value={telemetryValues.voltage} onChange={(e) => setTelemetryValues(s => ({ ...s, voltage: e.target.value === '' ? '' : Number(e.target.value) }))} className={FORM_INPUT_CLASS + ' mt-1'} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700">Uptime (s)</label>
                          <input type="number" step="1" value={telemetryValues.uptime_seconds} onChange={(e) => setTelemetryValues(s => ({ ...s, uptime_seconds: e.target.value === '' ? '' : Number(e.target.value) }))} className={FORM_INPUT_CLASS + ' mt-1'} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700">Channel Utilization (%)</label>
                          <input type="number" step="any" value={telemetryValues.channel_utilization} onChange={(e) => setTelemetryValues(s => ({ ...s, channel_utilization: e.target.value === '' ? '' : Number(e.target.value) }))} className={FORM_INPUT_CLASS + ' mt-1'} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700">Air Util TX (%)</label>
                          <input type="number" step="any" value={telemetryValues.air_util_tx} onChange={(e) => setTelemetryValues(s => ({ ...s, air_util_tx: e.target.value === '' ? '' : Number(e.target.value) }))} className={FORM_INPUT_CLASS + ' mt-1'} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs text-gray-700">Temperature (°C)</label>
                          <input type="number" step="any" value={telemetryValues.temperature} onChange={(e) => setTelemetryValues(s => ({ ...s, temperature: e.target.value === '' ? '' : Number(e.target.value) }))} className={FORM_INPUT_CLASS + ' mt-1'} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700">Relative Humidity (%)</label>
                          <input type="number" step="any" value={telemetryValues.relative_humidity} onChange={(e) => setTelemetryValues(s => ({ ...s, relative_humidity: e.target.value === '' ? '' : Number(e.target.value) }))} className={FORM_INPUT_CLASS + ' mt-1'} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700">Barometric Pressure (hPa)</label>
                          <input type="number" step="any" value={telemetryValues.barometric_pressure} onChange={(e) => setTelemetryValues(s => ({ ...s, barometric_pressure: e.target.value === '' ? '' : Number(e.target.value) }))} className={FORM_INPUT_CLASS + ' mt-1'} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700">Gas Resistance (Ω)</label>
                          <input type="number" step="any" value={telemetryValues.gas_resistance} onChange={(e) => setTelemetryValues(s => ({ ...s, gas_resistance: e.target.value === '' ? '' : Number(e.target.value) }))} className={FORM_INPUT_CLASS + ' mt-1'} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-700">IAQ</label>
                          <input type="number" step="any" value={telemetryValues.iaq} onChange={(e) => setTelemetryValues(s => ({ ...s, iaq: e.target.value === '' ? '' : Number(e.target.value) }))} className={FORM_INPUT_CLASS + ' mt-1'} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={() => {
                  setIsConfiguring(false);
                  setSelectedAction(null);
                  clearActionParams();
                }}
                className="px-4 py-2 text-gray-900 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartAction}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Play className="h-4 w-4" />
                <span>Start Action</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50" role="status" aria-live="polite">
          <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
            {toast.type === 'success' ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600" />
            )}
            <div className="text-sm font-medium">{toast.message}</div>
            <button aria-label="Close" onClick={() => setToast(null)} className="ml-2 text-current/60 hover:text-current">×</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="h-8 w-8 bg-orange-100 rounded-lg flex items-center justify-center">
            <Radio className="h-5 w-5 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Publication Actions</h1>
        </div>
        <p className="text-gray-800">
          Coordinate publication workflows for observability and resiliency testing. Use responsibly.
        </p>
      </div>

      {/* One-Shot Publications */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">One-Shot Publications</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {publicationActions.map((action) => (
            <ActionCard
              key={action.id}
              {...action}
              onClick={() => handleActionClick(action.id)}
              isActive={selectedAction === action.id}
            />
          ))}
        </div>
      </div>

      {/* Publication Services */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Publication Services</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {publicationServiceActions.map((action) => (
            <ActionCard
              key={action.id}
              {...action}
              onClick={() => handleActionClick(action.id)}
              isActive={selectedAction === action.id}
            />
          ))}
        </div>
      </div>

    </div>
  );
}
