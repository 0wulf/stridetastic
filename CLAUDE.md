# CLAUDE.md - Stridetastic Server Complete Codebase Documentation

**Last Updated**: 2025-11-21  
**Version**: 1.0  
**Total Python LOC**: ~11,747  
**Total TypeScript Files**: 64  
**Architecture**: Django + Next.js + TimescaleDB + Celery + Redis

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Core Components](#core-components)
6. [Data Models](#data-models)
7. [Services & Business Logic](#services--business-logic)
8. [API Endpoints](#api-endpoints)
9. [Frontend Architecture](#frontend-architecture)
10. [Deployment](#deployment)
11. [Security Considerations](#security-considerations)
12. [Development Guide](#development-guide)
13. [Testing](#testing)
14. [Future Roadmap](#future-roadmap)

---

## Project Overview

**Stridetastic Server** is a comprehensive security research tool for analyzing and testing Meshtastic mesh radio networks. It provides both passive network monitoring (sniffing) and active security testing (publishing) capabilities.

### Purpose
- **Network Analysis**: Capture and analyze Meshtastic mesh network traffic
- **Security Research**: Test mesh network resilience through controlled publishing
- **Penetration Testing**: Identify vulnerabilities in mesh communications
- **Education**: Learn about mesh networking protocols and security

### Key Features
- Multi-interface support (MQTT, Serial/RF)
- Real-time packet capture with PCAP-NG export
- AES and PKI encryption/decryption
- Publishing: NodeInfo, Position, Text Messages, Traceroutes
- Reactive and periodic publishing modes
- Virtual node management
- Real-time network visualization
- TimescaleDB for time-series analysis
- Grafana dashboards for metrics

---

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        USER LAYER                            │
├─────────────────────────────────────────────────────────────┤
│  Web Frontend (Next.js)  │  Grafana Dashboards  │  Admin   │
│  Port 3000               │  Port 3001           │  Panel   │
└──────────────┬───────────┴──────────────────────┴──────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                     API LAYER (Django)                       │
│  Port 8000 - Django-Ninja REST API + JWT Auth               │
├─────────────────────────────────────────────────────────────┤
│  Controllers: Auth, Node, Channel, Publisher, Capture, etc.   │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                    SERVICE LAYER                             │
├─────────────────────────────────────────────────────────────┤
│  ServiceManager (Orchestration)                              │
│  ├── SnifferService    (Passive capture)                     │
│  ├── PublisherService    (Active injection)                    │
│  ├── CaptureService    (PCAP writing)                        │
│  ├── PKIService        (Encryption)                          │
│  └── VirtualNodeService (Node management)                    │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                  INTERFACE LAYER                             │
├─────────────────────────────────────────────────────────────┤
│  MqttInterface    SerialInterface    WebSocketInterface      │
│  (Multiple instances supported per type)                     │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                  INGESTION LAYER                             │
├─────────────────────────────────────────────────────────────┤
│  Dispatcher → PacketHandler → Payload Processors             │
│  ├── NodeInfo Handler                                        │
│  ├── Position Handler                                        │
│  ├── Telemetry Handler                                       │
│  ├── NeighborInfo Handler                                    │
│  ├── RouteDiscovery Handler                                  │
│  └── Routing Handler                                         │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                BACKGROUND TASKS (Celery)                     │
├─────────────────────────────────────────────────────────────┤
│  Workers:                                                     │
│  ├── Sniffer Tasks     (Long-running capture)                │
│  ├── Publisher Tasks     (Periodic injection)                  │
│  └── Capture Tasks     (PCAP management)                     │
│                                                              │
│  Beat Scheduler: process_periodic_publish_jobs (30s)          │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                   DATA LAYER                                 │
├─────────────────────────────────────────────────────────────┤
│  TimescaleDB (PostgreSQL + Time-Series Extensions)          │
│  ├── Nodes (node info, positions, telemetry)                │
│  ├── Packets (time-series packet data)                      │
│  ├── Links (bidirectional communication)                    │
│  ├── Channels (encryption keys)                             │
│  ├── Interfaces (MQTT/Serial config)                        │
│  └── Captures (PCAP sessions)                               │
│                                                              │
│  Redis (Celery broker + caching)                            │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Sniffing (Passive)
```
Meshtastic Network
    ↓ (MQTT/Serial)
Interface (MQTT/Serial)
    ↓
Dispatcher.ingest_packet()
    ↓
PacketHandler.handle_packet()
    ├→ Decrypt (if encrypted)
    ├→ Parse protobuf
    ├→ Update Node records
    ├→ Create Packet records
    ├→ Update Links/Edges
    ├→ Emit signals
    └→ Write to PCAP (if capture active)
```

#### Publishing (Active)
```
User/Frontend/Schedule
    ↓
PublisherController
    ↓
PublisherService.publish_*()
    ├→ Craft protobuf payload
    ├→ Encrypt (AES or PKI)
    ├→ Create MeshPacket
    └→ Publish via Interface
        ↓
    Meshtastic Network receives published packet
```

---

## Technology Stack

### Backend
- **Python 3.12**: Core language
- **Django 5.1**: Web framework
- **Django-Ninja**: Modern REST API framework
- **Django-Ninja-JWT**: JWT authentication
- **TimescaleDB**: Time-series PostgreSQL extension
- **Celery**: Distributed task queue
- **Redis**: Message broker and cache
- **Paho-MQTT**: MQTT client library
- **Meshtastic Python**: Protobuf definitions
- **Cryptography**: AES/PKI encryption

### Frontend
- **Next.js 15**: React framework with SSR
- **React 19**: UI library
- **TypeScript**: Type-safe JavaScript
- **Axios**: HTTP client
- **Tailwind CSS 4**: Utility-first CSS
- **Lucide React**: Icon library
- **React-Force-Graph**: Network visualization
- **Leaflet**: Map visualization
- **Recharts**: Chart library

### Infrastructure
- **Docker Compose**: Container orchestration
- **PostgreSQL 17**: Database (with TimescaleDB)
- **Grafana**: Metrics and dashboards
- **Nginx** (optional): Reverse proxy

---

## Project Structure

```
stridetastic_server/
├── api_stridetastic/              # Django backend
│   ├── stridetastic_api/
│   │   ├── admin/               # Admin panel customizations
│   │   ├── controllers/         # API endpoint controllers
│   │   ├── ingest/              # Packet ingestion pipeline
│   │   ├── interfaces/          # MQTT/Serial interface implementations
│   │   ├── management/commands/ # Django commands (seeds.py)
│   │   ├── mesh/
│   │   │   ├── encryption/      # AES + PKI crypto
│   │   │   ├── packet/          # Packet crafter + handler
│   │   │   └── utils.py         # ID conversions, hashing
│   │   ├── migrations/          # Database migrations
│   │   ├── models/              # Django ORM models
│   │   ├── schemas/             # Pydantic schemas (API contracts)
│   │   ├── services/            # Business logic services
│   │   ├── signals/             # Django signals
│   │   ├── tasks/               # Celery tasks
│   │   ├── tests/               # Unit + integration tests
│   │   ├── utils/               # Utility functions
│   │   ├── api.py               # API router registration
│   │   ├── celery.py            # Celery app configuration
│   │   ├── settings.py          # Django settings
│   │   └── urls.py              # URL routing
│   ├── Dockerfile
│   ├── manage.py
│   └── requirements.txt
│
├── web_stridetastic/             # Next.js frontend
│   ├── src/
│   │   ├── app/                 # Next.js app router pages
│   │   ├── components/          # React components
│   │   │   ├── actions/         # Publishing action components
│   │   │   ├── NetworkGraph.tsx # Force-directed graph
│   │   │   ├── NetworkMap.tsx   # Leaflet map
│   │   │   └── ...
│   │   ├── contexts/            # React contexts (Auth, MapFocus)
│   │   ├── hooks/               # Custom React hooks
│   │   ├── lib/                 # Utility libraries
│   │   │   ├── api/             # API client
│   │   │   ├── charts/          # Chart utilities
│   │   │   ├── pathFinding.ts   # Network path algorithms
│   │   │   └── ...
│   │   ├── types/               # TypeScript types
│   │   └── middleware.ts        # Auth middleware
│   ├── Dockerfile
│   ├── next.config.ts
│   ├── package.json
│   └── tsconfig.json
│
├── grafana/                     # Grafana configuration
│   ├── dashboards/              # JSON dashboards
│   │   └── B4-node_telemetry.json
│   └── provisioning/            # Auto-provisioning configs
│
├── wireshark/
│   └── meshtastic.lua           # Wireshark dissector for PCAP files
│
├── timescale_stridetastic/       # TimescaleDB data directory (mounted)
├── docs/                        # Documentation
├── compose.yaml                 # Docker Compose orchestration
├── .env.template                # Environment variable template
├── README.md                    # Project README
└── CLAUDE.md                    # This file
```

---

## Core Components

### 1. ServiceManager (Orchestration Hub)
**File**: `api_stridetastic/stridetastic_api/services/service_manager.py`

**Purpose**: Central orchestrator for all runtime services and interfaces. Singleton pattern ensures single source of truth.

**Responsibilities**:
- Interface lifecycle management (start/stop/reload)
- Service instantiation (Sniffer, Publisher, Capture, PKI)
- Process role detection (Celery worker vs. API server)
- Auto-creates default MQTT interface if none exists
- Publisher resolution for publishing operations

**Key Methods**:
- `load_enabled_interfaces()`: Loads DB interfaces into runtime
- `start_all()` / `stop_all()`: Lifecycle control
- `get_runtime_interface(id)`: Retrieve active interface by ID
- `get_instance()`: Singleton accessor

### 2. SnifferService
**File**: `api_stridetastic/stridetastic_api/services/sniffer_service.py`

**Purpose**: Manages passive packet capture from MQTT and serial interfaces.

**Features**:
- Multi-interface listening
- Automatic reconnection
- Packet dispatching to handlers

### 3. PublisherService
**File**: `api_stridetastic/stridetastic_api/services/publisher_service.py`

**Purpose**: Handles active packet injection into the mesh network.

**Capabilities**:
- **Text Messages**: PKI-encrypted or AES-encrypted
- **NodeInfo**: Impersonate node identity
- **Position**: Fake GPS coordinates
- **Traceroute**: Solicit routing responses
- **Reachability Probes**: Latency measurement

**Modes**:
1. **One-Shot**: Manual publishing via API
2. **Reactive**: Auto-respond to observed packets (configurable trigger ports, max tries)
3. **Periodic**: Scheduled publishing jobs (DB-driven, min 30s interval)

**Key Features**:
- Incremental global message ID
- Attempt tracking with time windows
- Interface-specific publisher resolution
- PKI encryption support via PKIService

### 4. CaptureService
**File**: `api_stridetastic/stridetastic_api/services/capture_service.py`

**Purpose**: Manages PCAP-NG capture sessions for Wireshark analysis.

**Features**:
- Multi-session support (per interface)
- Real-time packet writing with threading
- Frame comments for protobuf type hints
- Automatic decryption attempts (AES + PKI)
- File size limits and automatic rotation
- Channel-aware (writes decrypted payloads when possible)

**PCAP Format**:
- DLT_USER15 (162) link type
- Enhanced Packet Blocks with `type=meshtastic.MeshPacket` comments
- Companion Lua dissector for Wireshark

### 5. PKIService
**File**: `api_stridetastic/stridetastic_api/services/pki_service.py`

**Purpose**: Curve25519 (X25519) + AES-CCM encryption/decryption for Meshtastic PKI mode.

**Operations**:
- Derive shared secrets via ECDH
- Encrypt/decrypt with AES-CCM (L=2, M=8)
- Key management (PEM, base64, hex)
- Nonce generation per packet ID

**Key Components**:
- `encrypt_packet()`: Encrypt plaintext for PKI transmission
- `decrypt_packet()`: Decrypt received PKI payloads
- Key fingerprinting for storage

### 6. VirtualNodeService
**File**: `api_stridetastic/stridetastic_api/services/virtual_node_service.py`

**Purpose**: Manage virtual nodes (publishing identities) with generated or user-provided keys.

**Features**:
- Create virtual nodes with auto-generated keys
- Update existing virtual nodes
- Key pair generation (Curve25519)
- Public key export (base64)
- Node ID validation

### 7. PacketHandler
**File**: `api_stridetastic/stridetastic_api/mesh/packet/handler.py`

**Purpose**: Parse incoming MeshPackets and dispatch to payload-specific handlers.

**Pipeline**:
1. **Validate**: Check packet structure
2. **Identify Nodes**: Create/update Node records
3. **Decrypt**: Attempt AES decryption with known channel keys
4. **Parse Data**: Extract protobuf payload
5. **Dispatch**: Route to payload-specific handler
6. **Update Links**: Record bidirectional communication
7. **Emit Signals**: Trigger post-processing (capture, reactive publish)

**Payload Handlers**:
- `handle_nodeinfo()`: Update node metadata
- `handle_position()`: Update GPS coordinates
- `handle_telemetry()`: Device + environment metrics
- `handle_neighborinfo()`: Adjacency reports
- `handle_traceroute()`: Route discovery responses
- `handle_routing()`: ACKs and route errors

---

## Data Models

All models are in `api_stridetastic/stridetastic_api/models/`.

### Node Model (`node_models.py`)
**Table**: `stridetastic_api_node`

**Core Fields**:
- `node_num` (BigInteger, unique): Numeric node ID (0-4294967295)
- `node_id` (CharField, unique): Text ID (e.g., `!abcd1234`)
- `mac_address` (CharField, unique): Device MAC
- `is_virtual` (Boolean): Managed virtual node flag

**Identity**:
- `short_name`, `long_name`, `hw_model`, `role`
- `public_key`, `private_key` (PKI keys)
- `is_licensed`, `is_unmessagable`

**Last Known State**:
- **Position**: `latitude`, `longitude`, `altitude`, `position_accuracy`, `location_source`
- **Telemetry**: `battery_level`, `voltage`, `channel_utilization`, `air_util_tx`, `uptime_seconds`
- **Environment**: `temperature`, `relative_humidity`, `barometric_pressure`, `gas_resistance`, `iaq`
- **Latency**: `latency_reachable`, `latency_ms`

**Timestamps**:
- `first_seen`, `last_seen`, `private_key_updated_at`

**Relationships**:
- `interfaces` (M2M): Interfaces where node was observed
- `latency_history` (FK): Historical latency probes

### Packet Models (`packet_models.py`)
**Base Table**: `stridetastic_api_packet` (TimescaleModel - hypertable)

**Packet Fields**:
- `time` (auto): Ingestion timestamp
- `from_node`, `to_node` (FK): Source/destination nodes
- `gateway_nodes` (M2M): MQTT gateway nodes
- `channels` (M2M): Channels carrying this packet
- `interfaces` (M2M): Interfaces that observed it

**Metadata**:
- `packet_id`, `rx_time`, `rx_rssi`, `rx_snr`
- `hop_limit`, `hop_start`, `want_ack`, `ackd`
- `priority`, `via_mqtt`, `pki_encrypted`, `public_key`

**Related Models** (1-to-1 with Packet):
- **PacketData**: Portnum, payload, source/dest, reply_id
- **NodeInfoPayload**: short_name, long_name, hw_model, role, public_key
- **PositionPayload**: lat, lon, alt, accuracy, location_source
- **TelemetryPayload**: Device + environment metrics
- **NeighborInfoPayload**: Adjacency report metadata
  - **NeighborInfoNeighbor**: Individual neighbor entries
- **RouteDiscoveryPayload**: Traceroute route + SNR data
  - **RouteDiscoveryRoute**: Ordered node list
- **RoutingPayload**: ACKs, route errors, route requests/replies

### Channel Model (`channel_models.py`)
**Table**: `stridetastic_api_channel`

**Fields**:
- `channel_id` (CharField): Name (e.g., "LongFast")
- `channel_num` (Integer): 0-255
- `psk` (CharField): Base64-encoded AES key
- `members` (M2M Node): Nodes using this channel
- `interfaces` (M2M Interface): Interfaces monitoring this channel

### NodeLink Model (`link_models.py`)
**Table**: `stridetastic_api_nodelink`

**Purpose**: Track bidirectional communication between node pairs.

**Fields**:
- `node_a`, `node_b` (FK Node): Canonically ordered nodes
- `node_a_to_node_b_packets`, `node_b_to_node_a_packets`: Packet counts
- `is_bidirectional`: True if both directions observed
- `last_activity`: Most recent packet timestamp
- `channels` (M2M): Channels used on this link

**Manager**: `NodeLinkManager` with `record_activity()` method for atomic updates.

### Interface Model (`interface_models.py`)
**Table**: `stridetastic_api_interface`

**Purpose**: Configuration for MQTT/Serial interface instances.

**Fields**:
- `name` (Choice): MQTT or SERIAL
- `display_name` (unique): Human-readable identifier
- `is_enabled`: Should this interface run?
- `status` (Choice): INIT, CONNECTING, RUNNING, ERROR, STOPPED
- `config` (JSON): Generic config blob

**MQTT Specific**:
- `mqtt_broker_address`, `mqtt_port`, `mqtt_topic`, `mqtt_base_topic`
- `mqtt_username`, `mqtt_password`, `mqtt_tls`, `mqtt_ca_certs`

**Serial Specific**:
- `serial_port`, `serial_baudrate`
- `serial_node` (FK Node): Bind to specific node

### PublisherReactiveConfig Model (`publisher_models.py`)
**Table**: `stridetastic_api_publisherserviceconfig` (Singleton)

**Purpose**: Reactive publishing configuration.

**Fields**:
- `enabled`: Global reactive publishing on/off
- `from_node`, `gateway_node`, `channel_key`: Publishing parameters
- `hop_limit`, `hop_start`, `want_ack`: Packet parameters
- `listen_interfaces` (M2M): Interfaces triggering reactive publishes
- `max_tries`: Max probes per node per window
- `trigger_ports` (Array): Port names triggering reactions (e.g., ["TEXT_MESSAGE_APP"])

### PublisherPeriodicJob Model (`publisher_models.py`)
**Table**: `stridetastic_api_publisherperiodicjob`

**Purpose**: Scheduled publishing jobs.

**Fields**:
- `name`, `description`, `enabled`
- `payload_type` (Choice): text, position, nodeinfo, traceroute
- `from_node`, `to_node`, `channel_name`, `channel_key`
- `hop_limit`, `hop_start`, `want_ack`, `pki_encrypted`
- `interface` (FK): Target MQTT interface
- `payload_options` (JSON): Type-specific fields (message_text, lat/lon, etc.)
- `period_seconds`: Execution interval (min 30s)
- `next_run_at`, `last_run_at`, `last_status`, `last_error_message`

### CaptureSession Model (`capture_models.py`)
**Table**: `stridetastic_api_capturesession`

**Purpose**: Track active and completed PCAP captures.

**Fields**:
- `id` (UUID): Primary key
- `name`, `filename`, `file_path`
- `file_size`, `packet_count`, `byte_count`
- `status` (Choice): RUNNING, COMPLETED, ERROR, CANCELLED
- `interface` (FK): Source interface
- `started_by` (FK User): Initiating user
- `started_at`, `ended_at`, `last_packet_at`
- `notes` (JSON): Metadata

---

## Services & Business Logic

### Encryption Services

#### AES Encryption (`mesh/encryption/aes.py`)
- **Algorithm**: AES-128-CTR
- **Key Source**: Base64-encoded channel PSK
- **Nonce**: `packet_id (8 bytes) || from_node_num (8 bytes)`
- **Functions**:
  - `encrypt_message()`: Encrypt Data protobuf
  - `decrypt_packet()`: Decrypt MeshPacket.encrypted
  - `ensure_aes_key()`: Normalize key format
  - `generate_hash()`: Channel hash for packet routing

#### PKI Encryption (`mesh/encryption/pkc.py`)
- **Algorithm**: X25519 ECDH + AES-CCM (L=2, M=8)
- **Key Exchange**: Curve25519 (32-byte keys)
- **Nonce**: `packet_id (4 bytes) || from_node (4 bytes) || to_node (4 bytes)`
- **Functions**:
  - `encrypt_packet()`: Encrypt with recipient's public key
  - `decrypt_packet()`: Decrypt with private key
  - `generate_curve25519_keypair()`: Create new key pair
  - `load_public_key_bytes()` / `load_private_key_bytes()`: Key parsing

### Packet Crafting (`mesh/packet/crafter.py`)

**Functions**:
- `craft_mesh_packet()`: Create MeshPacket protobuf
- `craft_service_envelope()`: Wrap for MQTT publishing
- `craft_text_message()`: Text payload
- `craft_nodeinfo()`: User protobuf for NodeInfo
- `craft_position()`: Position protobuf
- `craft_traceroute()`: RouteDiscovery protobuf
- `craft_reachability_probe()`: Routing packet with ACK request

**Key Features**:
- Channel hash computation
- AES encryption integration
- PKI encryption support
- Bitfield management

### Ingestion Pipeline (`ingest/dispatcher.py`)

**Flow**:
1. `ingest_packet(source_type, raw_data, meta)` - Entry point
2. Dispatch to `handle_mqtt_ingest()` or `handle_serial_ingest()`
3. Calls `PacketHandler.handle_packet()`
4. Emits `packet_received` signal

**Signal Handlers** (`signals/packet_signals.py`):
- `on_packet_received_capture()`: Write to active captures
- `on_packet_received_publisher()`: Trigger reactive publishing

---

## API Endpoints

### Authentication (`controllers/auth_controller.py`)
- `POST /api/auth/login`: JWT login
- `POST /api/auth/refresh-token`: Refresh access token
- `GET /api/auth/me`: Current user info

### Nodes (`controllers/node_controller.py`)
- `GET /api/nodes/`: List nodes (with time filters)
- `GET /api/nodes/selectable-publish-nodes`: Nodes for publishing (virtual only if configured)
- `GET /api/nodes/{node_id}`: Node details
- `GET /api/nodes/{node_id}/positions`: Historical positions
- `GET /api/nodes/{node_id}/telemetry`: Historical telemetry
- `GET /api/nodes/{node_id}/latency`: Historical latency probes
- `GET /api/nodes/{node_id}/port-activity`: Port usage stats
- `GET /api/nodes/{node_id}/port-packets`: Packets by port
- `POST /api/nodes/virtual`: Create virtual node
- `PUT /api/nodes/{node_id}/virtual`: Update virtual node
- `DELETE /api/nodes/{node_id}/virtual`: Delete virtual node
- `GET /api/nodes/virtual/options`: Virtual node creation options
- `GET /api/nodes/virtual/prefill`: Prefill data for virtual node
- `GET /api/nodes/virtual/{node_id}/secrets`: Retrieve PKI keys

### Channels (`controllers/channel_controller.py`)
- `GET /api/channels/`: List channels
- `GET /api/channels/{channel_id}`: Channel details

### Links (`controllers/link_controller.py`)
- `GET /api/links/`: Bidirectional node links
- `GET /api/links/{link_id}`: Link details
- `GET /api/links/{link_id}/packets`: Packets on link

### Interfaces (`controllers/interface_controller.py`)
- `GET /api/interfaces/`: List interfaces
- `POST /api/interfaces/`: Create interface
- `GET /api/interfaces/{id}`: Interface details
- `PUT /api/interfaces/{id}`: Update interface
- `DELETE /api/interfaces/{id}`: Delete interface
- `POST /api/interfaces/{id}/start`: Start interface
- `POST /api/interfaces/{id}/stop`: Stop interface
- `POST /api/interfaces/{id}/restart`: Restart interface

### Publishing (`controllers/publisher_controller.py`)
- `POST /api/publisher/text`: Publish text message
- `POST /api/publisher/nodeinfo`: Publish node info
- `POST /api/publisher/position`: Publish position
- `POST /api/publisher/traceroute`: Publish traceroute
- `POST /api/publisher/reachability-probe`: Send reachability probe
- `GET /api/publisher/reactive/status`: Reactive publishing status
- `POST /api/publisher/reactive/start`: Start reactive publishing
- `POST /api/publisher/reactive/stop`: Stop reactive publishing
- `PUT /api/publisher/reactive/config`: Update reactive config
- `GET /api/publisher/periodic/`: List periodic jobs
- `POST /api/publisher/periodic/`: Create periodic job
- `GET /api/publisher/periodic/{id}`: Job details
- `PUT /api/publisher/periodic/{id}`: Update job
- `DELETE /api/publisher/periodic/{id}`: Delete job
- `POST /api/publisher/periodic/{id}/run`: Manually trigger job

### Captures (`controllers/capture_controller.py`)
- `GET /api/captures/`: List capture sessions
- `POST /api/captures/`: Start capture
- `GET /api/captures/{id}`: Capture details
- `POST /api/captures/{id}/stop`: Stop capture
- `GET /api/captures/{id}/download`: Download PCAP file

### Metrics (`controllers/metrics_controller.py`)
- `GET /api/metrics/overview`: Dashboard metrics (nodes, packets, channels, links)
- `GET /api/metrics/overview/{metric}/history`: Historical metric data

### Ports (`controllers/port_controller.py`)
- `GET /api/ports/activity`: Global port activity stats
- `GET /api/ports/{port}/nodes`: Nodes using port

### Graph (`controllers/graph_controller.py`)
- `GET /api/graph/nodes`: Nodes for network visualization
- `GET /api/graph/edges`: Edges for network visualization

---

## Frontend Architecture

### Technology Choices
- **Next.js 15**: Server-side rendering, API routes, file-based routing
- **React 19**: Latest React with concurrent features
- **TypeScript**: Type safety throughout
- **Tailwind CSS**: Utility-first styling

### Key Components

#### Dashboard (`src/app/dashboard/page.tsx`)
Main application view with tabbed interface:
- Overview Tab: Metrics, activity charts
- Network Tab: Graph visualization, map view
- Actions Tab: Publishing controls
- Captures Tab: PCAP management
- Virtual Nodes Tab: Node management

#### Network Visualization
**NetworkGraph** (`src/components/NetworkGraph.tsx`):
- Force-directed graph using react-force-graph-2d
- Node sizing by activity
- Link thickness by packet count
- Color coding by node role
- Click for details, drag to pan

**NetworkMap** (`src/components/NetworkMap.tsx`):
- Leaflet map with node positions
- Markers sized by activity
- Polylines for links
- Sync with graph selection via MapFocusContext

#### Publishing Actions (`src/components/actions/`)
- **PublishingActions.tsx**: Text, NodeInfo, Position, Traceroute
- **TamperingActions.tsx**: Reachability probes
- **EscalationActions.tsx**: Reactive and periodic publishing
- **DosActions.tsx**: Placeholder for future DoS tests

#### Authentication (`src/contexts/AuthContext.tsx`)
- JWT token management (cookies)
- Auto-refresh tokens
- Protected route middleware (`src/middleware.ts`)

### Custom Hooks
- `useNetworkData()`: Fetch nodes/edges with polling
- `useNodeSelection()`: Manage selected node state
- `usePathFinding()`: Dijkstra's algorithm for route discovery
- `useAutoRefresh()`: Configurable data refresh
- `useGraphDimensions()`: Responsive canvas sizing

### API Client (`src/lib/api.ts`)
- Axios-based HTTP client
- Request/response interceptors
- Token refresh on 401
- Type-safe endpoints matching backend

---

## Deployment

### Docker Compose Services

```yaml
services:
  timescale_stridetastic:
    image: timescale/timescaledb:latest-pg17
    ports: ["5432:5432"]
    volumes: ["./timescale_stridetastic:/var/lib/postgresql/data"]

  api_stridetastic:
    build: ./api_stridetastic
    ports: ["8000:8000"]
    depends_on: [timescale_stridetastic]
    devices: ["${SERIAL_PORT}:${SERIAL_PORT}"]  # For serial interface

  redis_stridetastic:
    image: redis:latest
    ports: ["6379:6379"]

  celery_stridetastic:
    build: ./api_stridetastic
    command: celery -A stridetastic_api worker -l info
    depends_on: [redis_stridetastic, timescale_stridetastic]

  celery_beat_stridetastic:
    build: ./api_stridetastic
    command: celery -A stridetastic_api beat --scheduler django_celery_beat.schedulers:DatabaseScheduler
    depends_on: [redis_stridetastic, timescale_stridetastic]

  web_stridetastic:
    build: ./web_stridetastic
    ports: ["3000:3000"]
    environment: [API_HOST_IP=${API_HOST_IP}]

  grafana_stridetastic:
    image: grafana/grafana:latest
    ports: ["3001:3000"]
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - ./grafana/dashboards:/var/lib/grafana/dashboards:ro
```

### Startup Sequence
```bash
# 1. Copy environment template
cp .env.template .env
vim .env  # Configure MQTT broker, serial port, etc.

# 2. Start database
sudo docker compose up -d timescale_stridetastic

# 3. Run migrations
sudo docker compose run --rm api_stridetastic python manage.py migrate

# 4. Create superuser
sudo docker compose run --rm api_stridetastic python manage.py createsuperuser

# 5. Seed default data (broadcast node, default channel, virtual node)
sudo docker compose run --rm api_stridetastic python manage.py seeds

# 6. Start all services
sudo docker compose up -d
```

### Access Points
- **Frontend**: http://localhost:3000
- **API**: http://localhost:8000
- **Admin**: http://localhost:8000/admin
- **Grafana**: http://localhost:3001 (admin/admin)
- **API Docs**: http://localhost:8000/api/docs

### Environment Variables (`.env`)
```ini
# Django
LANGUAGE_CODE=en-us
TIME_ZONE=UTC
ALLOWED_HOSTS=localhost,

# Frontend
NEXT_PUBLIC_API_HOST_IP=localhost

# MQTT (default: public Meshtastic broker)
MQTT_BROKER_ADDRESS=mqtt.meshtastic.org
MQTT_BROKER_PORT=1883
MQTT_TOPIC=msh/US/2/e/#
MQTT_USERNAME=meshdev
MQTT_PASSWORD=large4cats
MQTT_TLS=false
MQTT_BASE_TOPIC=msh/US/2/e

# Serial (optional)
# SERIAL_PORT=/dev/ttyUSB0
SERIAL_BAUDRATE=921600

# Default virtual node
DEFAULT_VIRTUAL_NODE_ENABLED=true
DEFAULT_VIRTUAL_NODE_ID=!abcd9780
DEFAULT_VIRTUAL_NODE_SHORT_NAME=9780
DEFAULT_VIRTUAL_NODE_LONG_NAME=Meshtastic 9780
DEFAULT_VIRTUAL_NODE_ROLE=CLIENT
DEFAULT_VIRTUAL_NODE_HW_MODEL=HELTEC_V3
```

---

## Security Considerations

### Ethical Use
⚠️ **WARNING**: This tool is designed for authorized security research and penetration testing only.

**Legal Requirements**:
- Obtain explicit written permission before testing any network
- Only use on networks you own or have authorization to test
- Follow responsible disclosure for any vulnerabilities found
- Comply with local laws regarding radio transmissions

### Known Security Implications

#### For Network Operators
- **Published NodeInfo**: Attackers can impersonate any node
- **Fake Position**: GPS publishing can mislead rescue operations
- **Message Injection**: Unauthorized messages can spread misinformation
- **Traceroute Flooding**: Excessive probes can congest the network
- **Detection Difficulty**: Meshtastic nodes accept all valid packets

#### Mitigations
- **PKI Mode**: Use encrypted channels with public key authentication
- **Monitor Anomalies**: Watch for suspicious NodeInfo changes
- **Rate Limiting**: Implement mesh-level rate limits (firmware)
- **Signatures**: Require digital signatures for critical messages (future)

### Application Security
- **JWT Tokens**: 60-minute expiration, 1-day refresh tokens
- **CSRF Protection**: Enabled for state-changing operations
- **CORS**: Restricted to localhost (production should use reverse proxy)
- **Admin Panel**: Protected by Django authentication
- **Secret Key**: Change `SECRET_KEY` in production!
- **Database**: PostgreSQL with parameterized queries (no SQL injection)

### Encryption Handling
- **AES Keys**: Stored base64-encoded in database (consider encryption at rest)
- **PKI Private Keys**: Stored in plaintext (TODO: encrypt with user password)
- **Key Rotation**: No automatic rotation (manual process)

---

## Development Guide

### Local Development Setup
```bash
# Backend
cd api_stridetastic
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver

# Frontend
cd web_stridetastic
pnpm install
pnpm dev
```

### Database Management
```bash
# Create migration
docker compose run --rm api_stridetastic python manage.py makemigrations

# Apply migration
docker compose run --rm api_stridetastic python manage.py migrate

# Reset database
docker compose down -v
docker compose up -d timescale_stridetastic
docker compose run --rm api_stridetastic python manage.py migrate
docker compose run --rm api_stridetastic python manage.py seeds
```

### Adding a New Publishing Payload Type
1. **Define Protobuf** (if new): Update `meshtastic/protobuf`
2. **Create Crafter**: Add `craft_newpayload()` in `mesh/packet/crafter.py`
3. **Add Service Method**: `PublisherService.publish_newpayload()` in `services/publisher_service.py`
4. **Add Controller Endpoint**: `PublisherController.publish_newpayload()` in `controllers/publisher_controller.py`
5. **Update Frontend**: Add UI in `web_stridetastic/src/components/actions/`
6. **Test**: Write test in `api_stridetastic/tests/test_publisher_service.py`

### Adding a New Interface Type
1. **Create Interface Class**: Inherit from `BaseInterface` in `interfaces/`
2. **Implement Methods**: `connect()`, `start()`, `disconnect()`, `publish()`, `is_connected()`
3. **Update ServiceManager**: Add build logic in `_build_interface_impl()`
4. **Update Interface Model**: Add choice in `Interface.Names`
5. **Update Frontend**: Add config form in `InterfaceDetailsModal.tsx`

---

## Testing

### Test Framework
- **pytest**: Main test runner
- **pytest-django**: Django integration
- **pytest-mock**: Mocking utilities
- **pytest-cov**: Code coverage
- **factory_boy**: Test data factories

### Test Structure
```
api_stridetastic/stridetastic_api/tests/
├── conftest.py                    # Shared fixtures
├── test_link_controller.py        # Link API tests
├── test_metrics_controller.py     # Metrics API tests
├── test_neighborinfo_handler.py   # NeighborInfo parsing
├── test_node_link_manager.py      # NodeLink logic
├── test_node_positions_api.py     # Position history API
├── test_node_telemetry_api.py     # Telemetry history API
├── test_packet_payloads.py        # Payload serialization
├── test_pcap_writer.py            # PCAP generation
├── test_pki_utils.py              # PKI crypto
├── test_port_activity_api.py      # Port metrics
├── test_route_discovery_handler.py # Traceroute parsing
├── test_seeds_command.py          # Seed command
├── test_publisher_service.py        # Publishing logic
├── test_time_filters.py           # Time range parsing
└── test_virtual_node_api.py       # Virtual node CRUD
```

### Running Tests
```bash
# All tests
docker compose run --rm api_stridetastic pytest

# Specific test file
docker compose run --rm api_stridetastic pytest stridetastic_api/tests/test_publisher_service.py

# With coverage
docker compose run --rm api_stridetastic pytest --cov=stridetastic_api

# Verbose output
docker compose run --rm api_stridetastic pytest -v
```

### Test Coverage
- **Models**: Full CRUD operations
- **Controllers**: API endpoint responses
- **Services**: Business logic and edge cases
- **Handlers**: Protobuf parsing and data extraction
- **Crypto**: AES and PKI encryption/decryption

---

## Future Roadmap

### Planned Features
1. **ATAK Integration**: Publish ATAK plugin messages
2. **Replay Attacks**: Record and replay packet sequences
3. **Advanced DoS**: Channel flooding, ACK storms
4. **MitM Attacks**: Two-node packet interception
5. **Machine Learning**: Anomaly detection for defensive use
6. **Multi-User Support**: Role-based access control
7. **WebSocket Streaming**: Real-time packet feed to frontend
8. **Export/Import**: Capture session management
9. **Plugin System**: Extensible payload handlers

### Known Limitations
- **PKI Key Storage**: Private keys not encrypted at rest
- **PCAP Rotation**: Manual file management required
- **Serial Interface**: Single device only (no multi-device)
- **Rate Limiting**: No built-in DoS protection
- **Error Recovery**: Limited automatic reconnection for Serial

### Performance Considerations
- **TimescaleDB**: Automatic data retention policies recommended for long-term deployments
- **Celery Workers**: Scale horizontally for high-throughput captures
- **Frontend**: Virtual scrolling recommended for >10,000 nodes
- **PCAP Files**: Monitor disk usage (default 1GB limit per capture)

---

## Key Design Patterns

### 1. Singleton Pattern
- `ServiceManager`: Single orchestrator per process
- `PublisherReactiveConfig`: Single global reactive config

### 2. Factory Pattern
- `ServiceManager._build_interface_impl()`: Creates interface instances
- Test factories via `factory_boy`

### 3. Strategy Pattern
- Interface implementations (`MqttInterface`, `SerialInterface`)
- Payload handlers (NodeInfo, Position, Telemetry, etc.)

### 4. Observer Pattern
- Django signals: `packet_received`, `user_logged_in`
- Celery tasks as event handlers

### 5. Repository Pattern
- Model managers (e.g., `NodeLinkManager`)
- Service layer abstracts database access

---

## Troubleshooting

### Common Issues

**Issue**: "Connection refused" to TimescaleDB  
**Solution**: Ensure `timescale_stridetastic` is running and healthy
```bash
docker compose ps timescale_stridetastic
docker compose logs timescale_stridetastic
```

**Issue**: Frontend shows 401 errors  
**Solution**: Login via `/login` page, check cookies, verify API is running

**Issue**: Celery workers not starting  
**Solution**: Check Redis connectivity, review Celery logs
```bash
docker compose logs celery_stridetastic
```

**Issue**: PCAP capture not writing packets  
**Solution**: Verify capture session is active, check file permissions
```bash
docker compose exec api_stridetastic ls -la /app/captures/
```

**Issue**: Reactive publishing not triggering  
**Solution**: Check config (enabled, source node, trigger ports), verify publisher connected

**Issue**: "Module not found" errors  
**Solution**: Rebuild containers after dependency changes
```bash
docker compose build api_stridetastic
docker compose up -d
```

---

## Contributors & Acknowledgments

### Technologies Used
- **Meshtastic**: Open-source mesh networking firmware
- **TimescaleDB**: Time-series database extension for PostgreSQL
- **Django**: Python web framework
- **Next.js**: React framework
- **Celery**: Distributed task queue

### References
- [Meshtastic Documentation](https://meshtastic.org/)
- [Meshtastic Protobuf Definitions](https://github.com/meshtastic/protobufs)
- [TimescaleDB Docs](https://docs.timescale.com/)
- [Django Documentation](https://docs.djangoproject.com/)

---

## Glossary

- **AES**: Advanced Encryption Standard (symmetric cipher)
- **Celery**: Distributed task queue for Python
- **DLT**: Data Link Type (PCAP link layer identifier)
- **ECDH**: Elliptic Curve Diffie-Hellman (key exchange)
- **Hypertable**: TimescaleDB's partitioned time-series table
- **JWT**: JSON Web Token (stateless authentication)
- **MAC Address**: Media Access Control address (device identifier)
- **MQTT**: Message Queuing Telemetry Transport (pub/sub protocol)
- **NodeInfo**: Meshtastic packet announcing node identity
- **PCAP-NG**: Packet Capture Next Generation (network traffic format)
- **PKI**: Public Key Infrastructure (asymmetric encryption)
- **PSK**: Pre-Shared Key (symmetric channel key)
- **SNR**: Signal-to-Noise Ratio (link quality metric)
- **TimescaleDB**: PostgreSQL extension for time-series data
- **Traceroute**: Diagnostic tool showing network path
- **X25519**: Elliptic curve for ECDH (Curve25519)

---

**End of CLAUDE.md**

**Document Purpose**: Comprehensive reference for AI assistants (Claude, GPT, etc.) to understand the complete Stridetastic Server codebase architecture, implementation details, and design decisions.

**Maintenance**: Update this document when major architectural changes occur or new features are added.
