# STRIDEtastic Feature Inventory

## Contents

- Web dashboard (Next.js)
- API (Django-Ninja)
- Ingestion interfaces (MQTT / Serial / TCP)
- Capture & forensics (PCAP-NG + Wireshark)
- Active publishing & automation
- Crypto & key health
- Grafana dashboards
- Django admin
- Deployment & operations
- Roadmap / planning docs (non-shipped ideas)


## Web dashboard (Next.js)

### Navigation

- Sidebar navigation across the main operator workflows:
  - Overview
  - Network Topology
  - Network Map
  - Logical Links
  - Virtual Nodes
  - Key Health
  - Captures
  - Actions

### Overview

- At-a-glance network KPIs (e.g., total/active/reachable nodes and trends)
- Quick navigation from metrics into deeper investigations
- Recent activity views for operational awareness

### Network Topology

- Interactive topology graph view of nodes and relationships
- Select nodes to inspect details and pivot into other views
- Navigate directly from topology to a map-focused view for a node

### Network Map

- Geographic visualization of nodes (when position data exists)
- Map focus workflows (e.g., jump to a specific node)

### Logical Links

- Obsevre traffic between addresses.
- Filtering/grouping by protocol/app context (e.g., traceroute vs routing)
- Show bidirectional vs unidirectional communication
- Per-link metadata (last activity, counts, and related channel context when available)

### Virtual Nodes

- Create and manage “virtual” Meshtastic identities for legitimate packet injection
- Generate and store Curve25519 key material for a virtual identity
- Set basic identity metadata (names, role/hardware fields where applicable)
- Update/delete virtual identities

### Key Health

- Detect and review risky key situations across nodes, including:
  - Duplicate public keys across nodes
  - Low-entropy / suspicious key material flags (when detected)
- Summary counters and detailed tables to triage affected nodes

### Captures

- Start/stop capture sessions from the UI
- Track capture status and metadata
- Download capture artifacts for offline analysis
- Delete capture artifacts (single and bulk operations)

### Actions (Publishing)

- One-shot publishing workflows (send a single packet on demand), including:
  - Text
  - Node identity (node info)
  - Position
  - Telemetry
  - Traceroute
  - Reachability probes
- Reactive publishing of traceroutes (triggered by observed traffic)
  - Port-trigger configuration (listen for specific ports/apps)
  - Attempt limits / safety controls to avoid runaway injection
  - Interface binding (publish via a selected interface)
- Periodic publishing workflows
  - Schedule repeating jobs (e.g., traceroutes, reachability probes, telemetry requests)
  - View job status


## API (Django-Ninja)

- Authenticated REST API used by the dashboard
- Interactive API documentation (Swagger/OpenAPI)
- User-facing API capabilities include endpoints to:
  - Retrieve nodes, node history, and network metrics
  - Retrieve topology/link/edge views
  - Manage interfaces (configuration + enable/disable)
  - Manage captures (start/stop/list/download/delete)
  - Manage virtual nodes
  - Execute publishing actions (one-shot)
  - Manage reactive and periodic publishing jobs

## Ingestion interfaces (MQTT / Serial / TCP)

- Multi-interface ingestion: run more than one interface simultaneously

### MQTT interface

- Subscribe to Meshtastic traffic via an MQTT broker
- Configurable broker connection (including auth/TLS where configured)
- Publish back to MQTT (used for injection workflows)

### Serial interface

- Ingest traffic from a serial-attached radio

### TCP interface

- Ingest traffic from a network-connected node
- Publish/inject via TCP-connected nodes when configured



## Capture & forensics (PCAP-NG + Wireshark)

- User-controlled capture sessions persisted as PCAP-NG files
- Capture files include per-frame metadata designed for later inspection
- Capture path attempts to decode nested Meshtastic payloads (when possible)
- Capture path attempts decryption when keys are available:
  - Channel-based AES (PSK)
  - PKI direct messages (when private keys are present)
- Automatic capture file size limits (to prevent runaway disk usage)
- Open captures in Wireshark using the bundled Meshtastic Lua dissector


## Active publishing & automation

### One-shot publishing

- Craft and inject legitimate Meshtastic packets via a selected interface:
  - Text
  - Node identity (node info)
  - Position
  - Telemetry
  - Traceroute
  - Reachability probes

### Reactive publishing

- Listen to observed traffic and automatically inject traceroutes
- Port/app triggers (configurable)
- Attempt windows / rate limiting to avoid repeated injection loops
- Interface-specific targeting

### Periodic publishing

- Schedule recurring jobs via Celery Beat + workers
- Execute long-running campaigns without blocking API ingestion
- Track job state (enabled/disabled, next run time, last run)
- Publish traceroutes and telemetry requests, nodeinfo, etc.

### Background metrics maintenance

- Periodic snapshots/rollups for overview-style metrics
- Reachability maintenance (e.g., marking nodes unreachable after timeouts)


## Crypto & key health

### Channel encryption (AES)

- Manage and use channel PSKs for decrypting general traffic when available

### Direct-message crypto (PKI)

- Support decrypting Meshtastic direct messages when private keys are available
- Support encrypting outbound direct messages for publishing workflows when keys are available

### Key health

- Identify and review suspicious key conditions (i.e., duplicates, low-entropy flags)



## Grafana dashboards

The repo ships a pre-provisioned Grafana stack with dashboards under `grafana/dashboards/`:

- **A1: Network Health KPI** (`A1-network-health-kpi.json`)
  - High-level health KPIs and time-series trends
- **A3: Geographic Coverage** (`A3-geographic-coverage.json`)
  - Map-oriented coverage and position exploration
- **B4: Node Telemetry** (`B4-node_telemetry.json`)
  - Per-node drill-down (telemetry/latency/health)
  - Node Network section (neighbors + publications) when selecting a node variable
- **B5: Node Key Health** (`B5-node_key_health.json`)
  - Duplicate / weak key investigation views
- **C1: CVE-2025-53627 DM Downgrade Attempts** (`C1-cve-2025-53627-dm-downgrade-attempts.json`)
  - Security-oriented investigation dashboard for downgrade-indicator traffic


## Django admin

- Manage and inspect core entities:
  - Nodes
  - Interfaces
  - Channels
  - Links / edges
  - Packets and decoded payload records
- Key material workflows:
  - Enter/paste node private keys (enables PKI DM decryption)
  - Audit nodes with private keys present
  - Filter/triage key-health signals (e.g., low entropy / duplicates)
  - Create and modify interfaces

## Deployment & operations

- Docker Compose stack for local/dev deployments:
  - TimescaleDB/Postgres
  - Django API
  - Redis
  - Celery worker
  - Celery beat
  - Next.js dashboard
  - Grafana
- Quick-start workflows in `README.md`:
  - Migrations, superuser creation
  - Optional seeding
  - Service URLs for dashboard/API/admin/Grafana