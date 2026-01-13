# STRIDEtastic

Stridetastic is an open-source monitoring and observability framework for Meshtastic® LoRa mesh networks. Born to fill the gap between hobbyist tooling and more professional-grade monitoring, it aims to help operators and administrators capture, inject, and visualize everything happening in their meshes. STRIDEtastic started as an undergraduate research project at Pontificia Universidad Católica de Chile as part of the IPre Program, under the supervision and guidance of [Prof. Miguel Gutiérrez Gaitán](https://www.linkedin.com/in/mgutierrezgaitan) from the [IoT-UC Research Lab](https://www.linkedin.com/company/iot-uc).

## Research Background

- Meshtastic networks offer inexpensive, long-range connectivity but lack centralized observability. Existing tools expose either basic maps, message logs, or limited stats, leaving analysts blind to topology, latency, channel usage, or security anomalies. STRIDEtastic aims to fill this gap.


## Feature Overview

For a complete, user-perspective inventory of shipped features, see [`docs/FEATURES.md`](docs/FEATURES.md).

STRIDEtastic combines passive mesh traffic observability with controlled active measurements. You can ingest Meshtastic traffic from multiple sources, investigate topology/links/nodes from a web dashboard, capture PCAP-NG for Wireshark analysis, and run one-shot/reactive/periodic publishing jobs for reachability and path measurements.

### 1) Ingest & Decode
- Ingest from multiple interfaces: MQTT, serial radios, and TCP-connected nodes.
- Parse MeshPackets and decode common Meshtastic payload types (e.g., NodeInfo, Position, Telemetry, NeighborInfo, Routing).
- Optional decryption when keys are available: channel PSKs (AES) and PKI direct messages.

### 2) Investigate (Web Dashboard)
- Overview KPIs and activity for quick triage.
- Topology graph + geographic map for exploration and pivoting.
- Logical links view (bidirectional vs unidirectional, last activity, basic grouping).

### 3) Capture & Forensics
- UI-driven capture sessions stored as PCAP-NG with per-frame annotations.
- Download captures and inspect them in Wireshark using the bundled Lua dissector.

### 4) Active Publishing & Automation
- One-shot publishing: text, node identity, position, telemetry, traceroute, reachability probes.
- Reactive publishing based on configurable port/app triggers with safety limits.
- Periodic jobs (Celery Beat + workers) for recurring traceroutes/probes with status tracking.

### 5) Reporting (Grafana)
Shipped dashboards in `grafana/dashboards/`:
- `A1-network-health-kpi.json`
- `A3-geographic-coverage.json`
- `B4-node_telemetry.json`
- `B5-node_key_health.json`
- `C1-cve-2025-53627-dm-downgrade-attempts.json`

## Demo


https://github.com/user-attachments/assets/2fb3f76a-0422-4476-8b25-df30ae0e42de


![Graph meshchile](docs/assets/graph.png)

![Path analysis](docs/assets/path.png)

![Virtual nodes and identities](docs/assets/virtual.png)

![Periodic publication action](docs/assets/periodic.png)

### Operations & Tooling
- Django-Ninja REST API with JWT auth exposes nodes, channels, links, captures, interfaces, metrics, graph data, and publisher endpoints.
- Celery workers manage long-running sniffers, capture writers, and publishing jobs; Redis acts as the broker/cache.
- Comprehensive documentation (`CLAUDE.md`, strategy decks, SQL cookbooks) plus pytest suites covering services, controllers, crypto, packet parsing, and seeds.
- Docker Compose stack wires TimescaleDB, API, Redis, Celery worker/beat, Next.js, and Grafana with optional serial device passthrough.

## Architecture at a Glance

```
compose.yaml
├── timescale_stridetastic     # PostgreSQL 17 + TimescaleDB
├── api_stridetastic           # Django API, Celery config, admin
├── redis_stridetastic         # Celery broker / caching layer
├── celery_stridetastic        # Worker (sniffer/publisher tasks)
├── celery_beat_stridetastic   # Scheduler for periodic jobs
├── web_stridetastic           # Next.js dashboard (pnpm build)
└── grafana_stridetastic       # Pre-provisioned dashboards
```

- **Capture Layer** – MQTT, Serial, TCP, and WebSocket interfaces feed the dispatcher.
- **Service Layer** – Sniffer, Publisher, Capture, PKI, and Virtual Node services coordinated by a singleton ServiceManager.
- **Data Layer** – TimescaleDB hypertables for packets/nodes/links + PCAP files on disk.
- **Presentation Layer** – Next.js dashboard for operations, Grafana for analytics, Django admin for power users, Wireshark for forensic drills.

## Repository Layout

```
api_stridetastic/       Django project, services, ingest pipeline, Celery tasks, tests
web_stridetastic/       Next.js 15 frontend (pnpm, React 19, Tailwind)
grafana/                Dashboards + provisioning configs
claude_docs/            Strategy, quick start, recommendations, SQL cookbook, checklist
docs/                   Academic report (`InformeIpreFinal1.pdf`) and related material
wireshark/              Custom Lua dissector for Meshtastic frames
timescale_stridetastic/ Host-mounted database volume
CLAUDE.md               Full-stack architecture digest for AI copilots
.env.template           Example .env file
```

## Docker Images

Pre-built Docker images are available on GitHub Container Registry:

```bash
# Pull the API image
docker pull ghcr.io/0wulf/stridetastic-api:latest

# Pull the Web dashboard image
docker pull ghcr.io/0wulf/stridetastic-web:latest
```

Images are automatically built and published on every push to `main` and for version tags (`v*`).

## Quick Start (Docker Compose)

1. Create your environment file:
   ```bash
   cp .env.template .env
   vim .env
   ```
2. Bring up TimescaleDB first:
   ```bash
   docker compose up -d timescale_stridetastic
   ```
3. Apply migrations and create an admin user:
   ```bash
   docker compose run --rm api_stridetastic python /app/manage.py migrate
   docker compose run --rm api_stridetastic python /app/manage.py createsuperuser
   ```
4. (Optional) Seed default nodes/channels/interfaces:
   ```bash
   docker compose up -d timescale_stridetastic
   docker compose run --rm api_stridetastic python /app/manage.py seeds
   ```
5. Launch the full stack:
   ```bash
   docker compose up -d
   ```
6. Visit the services:
   - Dashboard: http://localhost:3000
   - API & Swagger: http://localhost:8000 / http://localhost:8000/api/docs
   - Django admin: http://localhost:8000/admin
   - Grafana: http://localhost:3001 (default creds `admin:admin`)




## Using the Platform

1. **Onboard Interfaces** – Create MQTT, Serial, and/or TCP interfaces in the dashboard, enable them, and watch packets stream into TimescaleDB.
2. **Start Captures** – If you need to view the packets in Wireshark: Launch PCAP sessions from the UI for forensic investigations; download artifacts when complete and open them in Wireshark.
3. **Instrument Publishing** – For legitimate packet injection: configure virtual nodes and either fire single packets, enable reactive publishing (port-based), or schedule periodic traceroutes to profile paths.
4. **Explore Dashboards** – Use the Next.js console for operations and the Grafana pack for historical analysis, network topology graph, anomaly detection, SLA monitoring, and optimization insights.

## Responsible Use & Citation

- **Ethics** – Stridetastic is intended for authorized research, defensive testing, and academic experimentation. Obtain explicit permission before interacting with third-party meshes, respect local RF regulations, and follow responsible disclosure practices.
- **Academic Reference** – If you use this framework in publications, please cite the IPre report *“STRIDEtastic: Framework de Observabilidad para Redes Meshtastic”* (Pontificia Universidad Católica de Chile, 2025) and reference this repository.

## Acknowledgements

- **Academic guidance** – Huge thanks to Prof. Miguel Gutiérrez Gaitán (PUC Chile) for supporting the original STRIDEtastic research vision, and to Maximiliano Militzer ([Dyotson](https://github.com/Dyotson)) for introducing me to the Meshtastic ecosystem.
- **Community inspiration** – The Meshtastic community and projects such as [`pdxlocations/Meshtastic-Python-Examples`](https://github.com/pdxlocations/Meshtastic-Python-Examples) and [`cdanis/meshtastic-wireshark`](https://github.com/cdanis/meshtastic-wireshark) informed the capture tooling, publishing experiments, and dissector work included here.


## Contributing

- Start with `CONTRIBUTING.md` for workflows (local dev, testing, branching, PR expectations).
- Our community standards live in `CODE_OF_CONDUCT.md`.
- Security reports should follow `SECURITY.md` (email `security@stridetastic.org`).
- Architecture and deep dives: see `CLAUDE.md` and the `claude_docs/` quick-start and strategy guides.

If you open a PR, keep it scoped, include tests for behavior changes, and attach screenshots for UI updates. Thank you for helping improve STRIDEtastic!

## License

Stridetastic is distributed under the GNU General Public License v3.0. See `LICENSE` for details.

---

**Keywords:** Meshtastic, Observability, Latency, Security, STRIDE
