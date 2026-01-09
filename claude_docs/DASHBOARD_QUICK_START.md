# Meshtastic Dashboard Quick Reference & Implementation Guide

## Dashboard Feature Matrix

| Category | Dashboard Name | Key Metrics | Primary Use | Complexity |
|----------|---|---|---|---|
| **A1** | Network Health KPI | Online %, latency, battery, delivery rate | Executive overview | ⭐ |
| **A2** | Network Topology | Graph visualization, link status | Weekly health check | ⭐⭐ |
| **A3** | Geographic Coverage | Node locations, coverage heatmap | Planning/deployment | ⭐⭐ |
| **B4** | Node Telemetry | Device metrics, power, RF performance | Per-node troubleshooting | ⭐ |
| **B5** | Power Management | Battery trends, drain prediction | Battery/charging management | ⭐⭐ |
| **B6** | Inventory Tracker | Hardware config, compliance | Asset management | ⭐ |
| **C7** | Packet Flow | Throughput, port distribution, reliability | Traffic analysis | ⭐⭐ |
| **C8** | Channel Activity | Message volume per channel | Channel analytics | ⭐ |
| **D9** | Routing Analysis | Route discovery, error breakdown | Routing optimization | ⭐⭐⭐ |
| **D10** | Link Quality | SNR heatmap, RSSI distribution | RF engineering | ⭐⭐⭐ |
| **E11** | Alert Management | Active/historical alerts, MTTR | Incident response | ⭐⭐ |
| **E12** | Anomaly Detection | Baseline deviation, forecast | Proactive monitoring | ⭐⭐⭐ |
| **F13** | Optimization Engine | Bottleneck, coverage gaps, redundancy | Network planning | ⭐⭐⭐ |
| **F14** | Compliance/SLA | Uptime %, SLA breaches | Service level tracking | ⭐⭐ |
| **G15** | Capacity Monitor | DB size, query perf, growth forecast | Infrastructure | ⭐⭐ |
| **G16** | Admin Panel | Interface status, system health | Operations | ⭐ |

---

## Dashboards Shipped In This Repo

These dashboards are pre-provisioned from `grafana/dashboards/`.

- `grafana/dashboards/A1-network-health-kpi.json`
- `grafana/dashboards/A3-geographic-coverage.json`
- `grafana/dashboards/B4-node_telemetry.json`
- `grafana/dashboards/B5-node_key_health.json`
- `grafana/dashboards/C1-cve-2025-53627-dm-downgrade-attempts.json` (CVE-2025-53627 detection: `TEXT_MESSAGE_APP` packets that are not PKI and not to `!ffffffff`)

---

## Recommended Implementation Phases

### Phase 1: Foundation (Weeks 1-2) ✅ MVP
**Dashboards**: A1, A3, B4, B6, C7  
**Why**: These provide immediate value and cover 80% of common use cases.

**Deliverables**:
```
✓ Network Health KPI (overview)
✓ Geographic Coverage Map (deployment planning)
✓ Node Telemetry (troubleshooting)
✓ Inventory Tracker (asset management)
✓ Packet Flow (traffic understanding)
```

**SQL Count**: 15-20 core queries
**Alert Count**: 5-8 basic thresholds
**Estimated Effort**: 40-60 hours

---

### Phase 2: Advanced (Weeks 3-4) 🎯 Extended
**Dashboards**: A2, B5, C8, D9, D10  
**Why**: Enables advanced troubleshooting and optimization.

**Deliverables**:
```
✓ Network Topology Graph
✓ Power Management (battery forecasting)
✓ Channel Activity
✓ Routing Analysis (route discovery events)
✓ Link Quality (SNR heatmaps)
```

**SQL Count**: 25-35 complex queries
**Alert Count**: 8-15 intermediate alerts
**Estimated Effort**: 60-80 hours

---

### Phase 3: Intelligence (Weeks 5-6) 🧠 Enterprise
**Dashboards**: E11, E12, F13, F14  
**Why**: Transforms from reactive to proactive monitoring.

**Deliverables**:
```
✓ Alert Management (centralized incident tracking)
✓ Anomaly Detection (ML-ready metrics)
✓ Optimization Engine (actionable recommendations)
✓ Compliance/SLA (service level tracking)
```

**SQL Count**: 35-50 ML-optimized queries
**Alert Count**: 20+ intelligent rules
**Estimated Effort**: 80-120 hours

---

### Phase 4: Polish & Integration (Weeks 7+) 🚀 Production
**Dashboards**: G15, G16 + optimizations  
**Why**: Production readiness, documentation, performance tuning.

**Deliverables**:
```
✓ Capacity Monitoring (growth forecasting)
✓ Admin Panel (operational excellence)
✓ Query optimization & indexing
✓ Runbooks & documentation
✓ Slack/email integration
```

**Estimated Effort**: 40-60 hours

---

## Core Data Models Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│ CORE ENTITIES                                               │
├─────────────────────────────────────────────────────────────┤
│ Node                                                         │
│  ├─ ID: node_id, node_num (unique)                          │
│  ├─ Location: lat, lon, alt (nullable)                      │
│  ├─ Device: hw_model, role (CLIENT/ROUTER)                  │
│  ├─ Power: battery_level (0-100%), voltage                  │
│  ├─ Environment: temp, humidity, pressure, IAQ              │
│  ├─ Metrics: latency_ms, latency_reachable                  │
│  ├─ Timestamps: first_seen, last_seen (critical!)           │
│  └─ Relations: Many channels, many interfaces               │
│                                                              │
│ NodeLink (Logical Connection)                               │
│  ├─ node_a ↔ node_b (canonical ordering)                    │
│  ├─ Packets: a_to_b_count, b_to_a_count                     │
│  ├─ Bidirectional: bool (both directions working?)          │
│  ├─ Timestamp: last_activity, first_seen                    │
│  └─ Metrics: (derived from neighbor info)                   │
│                                                              │
│ Packet (Network Traffic)                                    │
│  ├─ from_node → to_node (routing path)                      │
│  ├─ gateway_nodes (M2M, may be relayed)                     │
│  ├─ Signal: rx_rssi, rx_snr, hop_limit                      │
│  ├─ Reliability: want_ack, ackd (delivery confirm)          │
│  ├─ Priority, delayed, via_mqtt, pki_encrypted             │
│  └─ Timestamp: time (when received)                         │
│                                                              │
│ PacketData (Payload Type)                                   │
│  ├─ port: (TEXT_MESSAGE | POSITION | NODEINFO |            │
│  │          NEIGHBORINFO | TELEMETRY | TRACEROUTE |         │
│  │          ROUTING)                                         │
│  ├─ request_id, reply_id (correlation)                      │
│  └─ Timestamp: time                                         │
│                                                              │
│ TelemetryPayload (Device Sensors)                           │
│  ├─ Device: battery_level, voltage, channel_util,           │
│  │           air_util_tx, uptime_seconds                    │
│  ├─ Environment: temperature, humidity, pressure,           │
│  │                gas_resistance, iaq                       │
│  └─ Timestamp: time                                         │
│                                                              │
│ NeighborInfo (Direct Link Info)                             │
│  ├─ Payload → reporting_node (who reported?)                │
│  ├─ Neighbors: list of advertised_node_id + snr             │
│  ├─ SNR: signal quality metric (higher = better)            │
│  ├─ last_rx_time: when did neighbor last hear us?           │
│  └─ Timestamp: time                                         │
│                                                              │
│ NetworkOverviewSnapshot (Aggregated)                        │
│  ├─ total_nodes, active_nodes, reachable_nodes              │
│  ├─ active_connections, channels                            │
│  ├─ avg_battery, avg_rssi, avg_snr                          │
│  └─ Timestamp: time (1 record per snapshot cycle)           │
└─────────────────────────────────────────────────────────────┘
```

---

## Critical Queries by Category

### **Queries for Phase 1**

#### A1 - Network Health (Homepage)
```sql
-- Network online percentage
SELECT round(100.0 * count(CASE WHEN last_seen >= now() - interval '5 minutes' THEN 1 END)
  / count(*), 2) AS online_pct
FROM stridetastic_api_node;

-- Average latency
SELECT avg(latency_ms)::numeric(8,2) FROM stridetastic_api_nodelatencyhistory 
WHERE time >= now() - interval '5 minutes';

-- Reachability percentage
SELECT round(100.0 * count(CASE WHEN reachable THEN 1 END) 
  / count(*), 2) FROM stridetastic_api_nodelatencyhistory 
WHERE time >= now() - interval '5 minutes';
```

#### B4 - Node Telemetry (Per-Node)
```sql
-- Latency percentiles
SELECT percentile_cont(ARRAY[0.5, 0.95, 0.99]) WITHIN GROUP (ORDER BY latency_ms)
  AS percentiles FROM stridetastic_api_nodelatencyhistory
WHERE node_id = (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  AND time >= now() - interval '24 hours';

-- Latest battery + voltage
SELECT battery_level, voltage, temperature, channel_utilization, air_util_tx
FROM stridetastic_api_telemetrypayload
WHERE packet_data_id IN (
  SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
    SELECT id FROM stridetastic_api_packet WHERE from_node_id = 
      (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  )
)
ORDER BY time DESC LIMIT 1;
```

#### C7 - Packet Flow (Sankey)
```sql
-- Top flows (source → dest)
SELECT n1.node_id AS source, n2.node_id AS dest, count(*) AS packets,
  avg(rx_rssi)::numeric(5,2) AS avg_rssi
FROM stridetastic_api_packet p
JOIN stridetastic_api_node n1 ON p.from_node_id = n1.id
JOIN stridetastic_api_node n2 ON p.to_node_id = n2.id
WHERE p.time >= now() - interval '${interval:csv}'
GROUP BY p.from_node_id, p.to_node_id
ORDER BY packets DESC LIMIT 20;

-- Port distribution (pie chart)
SELECT pd.port, count(*) AS count
FROM stridetastic_api_packetdata pd
JOIN stridetastic_api_packet p ON pd.packet_id = p.id
WHERE p.time >= now() - interval '${interval:csv}'
GROUP BY pd.port ORDER BY count DESC;
```

---

### **Queries for Phase 2**

#### D10 - Link Quality (SNR Heatmap)
```sql
-- SNR per link
SELECT n.reporting_node_id_text AS from_node, neigh.advertised_node_id AS to_node,
  round(avg(neigh.snr)::numeric, 2) AS avg_snr, count(*) AS samples
FROM stridetastic_api_neighborinfopayload n
JOIN stridetastic_api_neighborinfoneighbor neigh ON neigh.payload_id = n.id
WHERE n.time >= now() - interval '${interval:csv}'
GROUP BY n.reporting_node_id_text, neigh.advertised_node_id
ORDER BY avg_snr ASC;

-- SNR distribution (box plot)
SELECT 
  min(snr)::numeric(5,2) AS min_snr,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY snr)::numeric(5,2) AS q1_snr,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY snr)::numeric(5,2) AS median_snr,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY snr)::numeric(5,2) AS q3_snr,
  max(snr)::numeric(5,2) AS max_snr
FROM stridetastic_api_neighborinfoneighbor
WHERE payload_id IN (SELECT id FROM stridetastic_api_neighborinfopayload 
  WHERE time >= now() - interval '${interval:csv}');
```

#### B5 - Battery Prediction
```sql
-- Battery drain rate estimation
WITH recent AS (
  SELECT tp.time, tp.battery_level
  FROM stridetastic_api_telemetrypayload tp
  WHERE packet_data_id IN (
    SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
      SELECT id FROM stridetastic_api_packet WHERE from_node_id = 
        (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
    )
  )
  ORDER BY tp.time DESC LIMIT 100
)
SELECT 
  (first(battery_level) - last(battery_level)) / 
    EXTRACT(HOUR FROM (first(time) - last(time))) AS pct_per_hour,
  CASE WHEN (first(battery_level) - last(battery_level)) / 
    EXTRACT(HOUR FROM (first(time) - last(time))) > 0 
    THEN round(first(battery_level) / ((first(battery_level) - last(battery_level)) / 
    EXTRACT(HOUR FROM (first(time) - last(time)))), 1)
    ELSE 999 END AS hours_remaining
FROM recent;
```

---

### **Queries for Phase 3**

#### E12 - Anomaly Detection (Baseline vs Current)
```sql
-- Z-score calculation for latency
WITH stats AS (
  SELECT 
    avg(latency_ms)::numeric(8,2) AS mean_latency,
    stddev(latency_ms)::numeric(8,2) AS stddev_latency
  FROM stridetastic_api_nodelatencyhistory
  WHERE time >= now() - interval '7 days'
)
SELECT 
  $__timeGroup(time, '5m') AS bucket,
  avg(latency_ms)::numeric(8,2) AS current_latency,
  ((avg(latency_ms) - stats.mean_latency) / NULLIF(stats.stddev_latency, 0))::numeric(5,2) AS z_score,
  CASE WHEN abs((avg(latency_ms) - stats.mean_latency) / NULLIF(stats.stddev_latency, 0)) > 2 
    THEN 'anomaly' ELSE 'normal' END AS status
FROM stridetastic_api_nodelatencyhistory, stats
WHERE time >= now() - interval '24 hours'
GROUP BY bucket ORDER BY bucket;
```

#### F13 - Bottleneck Detection
```sql
-- Nodes with highest relay load
SELECT n.node_id, count(p.id) AS relay_count,
  (SELECT count(DISTINCT from_node_id) FROM stridetastic_api_packet 
   WHERE to_node_id = n.id AND from_node_id != to_node_id) AS originating_packets
FROM stridetastic_api_node n
LEFT JOIN stridetastic_api_packet p ON p.id IN (
  SELECT last_packet_id FROM stridetastic_api_nodelink 
  WHERE node_a_id = n.id OR node_b_id = n.id
)
WHERE n.last_seen >= now() - interval '24 hours'
GROUP BY n.id
ORDER BY relay_count DESC LIMIT 10;
```

---

## Grafana Dashboard Template Structure

### Panel Types by Category

| Panel Type | Best For | Phase |
|---|---|---|
| **stat** | KPI cards, single values | 1 |
| **timeseries** | Trends over time | 1 |
| **table** | Detailed records | 1 |
| **gauge** | Current state with threshold | 1 |
| **piechart** | Distribution breakdown | 1 |
| **geomap** | Geographic points | 2 |
| **nodeGraph** | Topology/graph visualization | 2 |
| **heatmap** | SNR/RSSI intensity matrix | 2 |
| **bargauge** | Ranking/comparison bars | 2 |
| **timeseries (stacked)** | Stacked area charts | 2 |
| **candlestick** | OHLC (if tracking ranges) | 3 |
| **state-timeline** | Uptime/downtime visualization | 3 |
| **alerting** | Alert status board | 3 |

---

## Alert Thresholds Recommendations

### Network-Level

| Alert | Metric | Condition | Threshold | Duration |
|---|---|---|---|---|
| Low Network Reachability | Reachable % | < | 80% | 15 min |
| High Average Latency | Avg latency | > | 2000 ms | 10 min |
| Network Partition | Packets received | = | 0 | 30 min |

### Node-Level

| Alert | Metric | Condition | Threshold | Duration |
|---|---|---|---|---|
| Node Offline | last_seen | > | 1 hour ago | 5 min |
| Critical Battery | battery_level | < | 20% | triggered |
| Battery Drain Spike | drain_rate | > | 10% /hour | 5 min |
| High Temperature | temperature | > | 60°C | 5 min |
| Node Unreachable | latency_reachable | = | False | 5 probes |

### Link-Level

| Alert | Metric | Condition | Threshold | Duration |
|---|---|---|---|---|
| Poor Link Quality | SNR | < | 2 dB | 10 min |
| Link Degradation | SNR trend | ↓ | -10 dB / 1h | 1 hour |
| Unidirectional Link | Bidirectional | = | False | 1 hour |

---

## Provisioning File Structure

After Phase 1, create provisioning files:

```
grafana/
├── provisioning/
│   ├── datasources/
│   │   └── datasource.yaml          # TimescaleDB config
│   ├── dashboards/
│   │   ├── dashboards.yaml          # Dashboard provider
│   │   ├── network-health.json      # Phase 1
│   │   ├── node-details.json
│   │   ├── packet-flow.json
│   │   └── ... (more Phase 2/3)
│   ├── alerting/
│   │   ├── alert-rules.yaml         # Phase 2+
│   │   └── alert-routing.yaml
│   └── notifiers/
│       └── slack.yaml               # Phase 3+
└── dashboard-templates/
    └── README.md                     # Documentation
```

---

## Quick Implementation Checklist

### Phase 1 (Weeks 1-2)

- [ ] Design database schema (already done ✓)
- [ ] Write core SQL queries (latency, online, battery)
- [ ] Create Network Health KPI dashboard
  - [ ] Online % stat card
  - [ ] Average latency stat card
  - [ ] Reachability % stat card
  - [ ] Nodes online timeseries
- [ ] Create Node Telemetry dashboard
  - [ ] Per-node selector variable
  - [ ] Latency timeseries
  - [ ] Battery gauge
  - [ ] Temperature timeseries
  - [ ] Latency percentile table
- [ ] Create Packet Flow dashboard
  - [ ] Port distribution pie
  - [ ] Top flows table
  - [ ] Throughput timeseries
- [ ] Create Inventory Tracker dashboard
  - [ ] Hardware model distribution
  - [ ] Nodes by role
  - [ ] Uptime leaderboard
- [ ] Create Geographic Map dashboard
  - [ ] Node location geomap
  - [ ] Coverage visualization
- [ ] Set up 5-8 basic alerts
- [ ] Test with live data from TimescaleDB
- [ ] Document in README

### Phase 2 (Weeks 3-4)

- [ ] Create Topology Graph dashboard
- [ ] Create Power Management dashboard
  - [ ] Battery drain prediction
  - [ ] Battery distribution histogram
  - [ ] Predicted discharge timeline
- [ ] Create Channel Activity dashboard
- [ ] Create Routing Analysis dashboard
  - [ ] Route discovery events timeline
  - [ ] Error breakdown
  - [ ] Hop distance distribution
- [ ] Create Link Quality dashboard
  - [ ] SNR heatmap
  - [ ] RSSI distribution
  - [ ] Link symmetry analysis
  - [ ] Interference detection
- [ ] Optimize queries for performance
- [ ] Add 8+ intermediate alerts
- [ ] Create runbooks for common issues

### Phase 3+ (Weeks 5+)

- [ ] Implement anomaly detection queries
- [ ] Create Alert Management dashboard
- [ ] Create Optimization recommendations engine
- [ ] Set up SLA compliance tracking
- [ ] Integrate Slack notifications
- [ ] Add email alerts for critical issues
- [ ] Create admin panel
- [ ] Set up capacity forecasting
- [ ] Documentation (runbooks, API guide)
- [ ] Performance tuning + indexing review

---

## Performance Tips for TimescaleDB

1. **Use `time >= now() - interval '...'` in all queries** → enables chunk pruning
2. **Add indexes on common WHERE fields**:
   - `node_id` (foreign key, usually auto-indexed)
   - `time` (hypertable index, already optimized)
   - `from_node_id`, `to_node_id` on packets
3. **Use `LIMIT` in aggregations** → prevents memory bloat
4. **Partition queries by time window** → avoid scanning entire hypertable
5. **Consider materialized views** for heavy computations (Phase 3+)

---

## Resources

- **Meshtastic API Docs**: https://meshtastic.org/
- **TimescaleDB Docs**: https://docs.timescale.com/
- **Grafana Docs**: https://grafana.com/docs/
- **Your Models**: `api_stridetastic/models/*.py`
- **Full Recommendations**: See `DASHBOARD_RECOMMENDATIONS.md` in repo root

---

## Next Steps

1. **Review** this guide with your team
2. **Prioritize** which Phase 1 dashboards to build first
3. **Create SQL queries** for each panel (test against live data)
4. **Build dashboards** incrementally (test after each)
5. **Set up alerts** and notification channels
6. **Monitor usage** and iterate based on team feedback

---

**Questions?** Review the full `DASHBOARD_RECOMMENDATIONS.md` for deep dives into each dashboard category.
