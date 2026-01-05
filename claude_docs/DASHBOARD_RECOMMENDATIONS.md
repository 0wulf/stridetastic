# Meshtastic Network Monitoring Dashboard - Comprehensive Feature Recommendations

## Executive Summary

This document provides a complete feature set for building the **most intelligent and comprehensive Meshtastic network monitoring dashboard** using Grafana, combining insights from your codebase analysis with industry best practices from traditional network monitoring (IP networks, cellular, etc.).

The dashboard should evolve from simple status viewing into a **proactive intelligence platform** that enables operators to understand network health, predict failures, optimize configurations, and respond quickly to issues.

---

## Part 1: Data Model Analysis

### Available Data Sources in Your System

**1. Node Data (Core Entity)**
- Node metadata: `node_id`, `short_name`, `long_name`, `hw_model`, `role`, `mac_address`
- Location: `latitude`, `longitude`, `altitude`, `position_accuracy`, `location_source`
- Device telemetry: `battery_level`, `voltage`, `channel_utilization`, `air_util_tx`, `uptime_seconds`
- Environmental telemetry: `temperature`, `relative_humidity`, `barometric_pressure`, `gas_resistance`, `iaq`
- Reactive metrics: `latency_ms`, `latency_reachable`, first_seen, last_seen
- Configuration: `is_licensed`, `is_virtual`, `is_unmessagable`, `role` (CLIENT, ROUTER, etc.)

**2. Time-Series Telemetry (Historical)**
- `NodeLatencyHistory`: Probe latency, reachability status over time
- `TelemetryPayload`: Battery, voltage, temperature, humidity, pressure, IAQ trends
- `NetworkOverviewSnapshot`: Aggregated network health metrics (total_nodes, active_nodes, reachable_nodes, avg_battery, avg_rssi, avg_snr)

**3. Packet Telemetry (Network Activity)**
- `Packet`: from_node, to_node, gateway_nodes, channels, rx_rssi, rx_snr, hop_limit, want_ack, ackd, priority, via_mqtt, pki_encrypted
- `PacketData`: port type (TEXT_MESSAGE, POSITION, NODEINFO, TELEMETRY, TRACEROUTE, ROUTING)
- `PositionPayload`: Node positions with accuracy metadata
- `NeighborInfoPayload` + `NeighborInfoNeighbor`: Direct neighbor relationships with SNR metrics

**4. Link & Topology Data**
- `NodeLink`: Logical links between nodes (node_a ↔ node_b), packet counts per direction, bidirectionality, last activity
- `Edge`: Physical connection instances with RSSI/SNR/hops
- `RouteDiscoveryPayload` + `RouteDiscoveryRoute`: Discovered routes with hop counts and SNR profiles

**5. Channel & Interface Data**
- `Channel`: Channel metadata, PSK, members, packet counts
- `Interface`: MQTT/Serial connections, status, configuration, connection history

**6. Capture Sessions**
- PCAP capture metadata: file size, packet count, capture duration

---

## Part 2: Dashboard Feature Recommendations

### Category A: Network Overview & Health Intelligence

#### 1. **Network Health KPI Dashboard** (Homepage/Executive View)
Provides at-a-glance network status like Cisco Live Network Dashboard or NGMon.

**Recommended Panels:**
- **Network Status Heat Map**: Color-coded grid (green/yellow/red) showing:
  - Nodes online % (target: >90%)
  - Avg latency (target: <500ms)
  - Avg battery level (target: >50%)
  - Packet delivery rate (success/fail)
  - Channel utilization (target: <80%)
  
- **Key Metrics Status Cards**:
  - Total nodes known
  - Nodes online (real-time + 5m, 1h, 24h trends)
  - Reachable nodes (probed successfully)
  - Network diameter (max hops observed)
  - Active links (bidirectional vs unidirectional)
  - Average hop count to reach nodes
  
- **Network Connectivity Timeline**:
  - Line chart: Nodes online over time (sparkline history for context)
  - Comparison: 7-day rolling window overlay
  - Highlights: Outage events, recovery times
  
- **Link Quality Heatmap**:
  - Each cell = node pair, color intensity = SNR/RSSI quality
  - Show top N worst links, best links
  - Identify weak spots requiring repeaters/repositioning

**SQL Examples:**
```sql
-- Nodes online in last X minutes
SELECT count(*) FROM stridetastic_api_node 
WHERE last_seen >= now() - interval '${interval:csv}';

-- Network reachability %
SELECT round(100.0 * count(CASE WHEN reachable THEN 1 END) / 
  count(*), 2) AS reachability_pct 
FROM stridetastic_api_nodelatencyhistory 
WHERE time >= now() - interval '${interval:csv}';

-- Average hops to reach any node
SELECT avg(hop_limit - COALESCE(first_hop, hop_limit)) AS avg_hops_observed 
FROM stridetastic_api_packet 
WHERE time >= now() - interval '${interval:csv}';

-- Link SNR distribution
SELECT 
  min(snr) AS min_snr, 
  avg(snr) AS avg_snr, 
  max(snr) AS max_snr,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY snr) AS median_snr
FROM stridetastic_api_neighborinfoneighbor;
```

---

#### 2. **Network Topology Explorer** (Interactive Graph)
Visualize mesh structure with dynamic updates like OSPF visualizers (Netbox, LibreNMS).

**Recommended Panels:**
- **Animated Network Graph**:
  - Nodes = vertices (size by active/inactive, color by role)
  - Links = edges (thickness by packet volume, color by SNR)
  - Gateway nodes highlighted distinctly
  - Routers vs clients differentiated
  - Virtual nodes marked
  
- **Interactive Features**:
  - Click node → show node detail sidebar
  - Click edge → show link statistics
  - Filter by role, uptime, battery level, etc.
  - Zoom/pan with force-directed layout
  - Real-time updates (new nodes, links appear/disappear)
  
- **Link Status Overlay**:
  - Show last_seen on each edge (grayed out if stale)
  - Highlight bidirectional vs unidirectional links
  - Show packet throughput animation (data flowing)

**SQL Examples:**
```sql
-- Topology snapshot: all active links
SELECT 
  n1.node_id AS source,
  n2.node_id AS target,
  nl.total_packets AS packet_count,
  nl.is_bidirectional,
  nl.last_activity,
  (SELECT avg(snr) FROM stridetastic_api_neighborinfoneighbor 
   WHERE payload_id IN (SELECT id FROM stridetastic_api_neighborinfopayload 
   WHERE reporting_node_id = n1.id) AND advertised_node_num = n2.node_num) AS snr
FROM stridetastic_api_nodelink nl
JOIN stridetastic_api_node n1 ON nl.node_a_id = n1.id
JOIN stridetastic_api_node n2 ON nl.node_b_id = n2.id
WHERE nl.last_activity >= now() - interval '24 hours'
ORDER BY nl.total_packets DESC;

-- Node metadata for topology (role, status, battery)
SELECT 
  node_id, short_name, role, battery_level, 
  last_seen >= now() - interval '5 minutes' AS is_online,
  latitude, longitude
FROM stridetastic_api_node
WHERE last_seen >= now() - interval '7 days';
```

---

#### 3. **Geographic Coverage Map** (GIS Visualization)
Show node locations and coverage area, useful for planning/deployments.

**Recommended Panels:**
- **Base Map with Node Locations**:
  - Each node = marker (color by status: online/offline/low-battery)
  - Marker icon = hardware model or role
  - Hover = quick stats (battery %, latency, last_seen)
  
- **Coverage Area Visualization**:
  - Heatmap overlay: Signal strength radius around each node
  - Range circles (estimated based on SNR and terrain)
  - Show boundary of network reach
  
- **Mobility Tracking**:
  - Historical position trails (if nodes have GPS)
  - Show position update frequency
  - Identify stuck/stationary nodes
  
- **Terrain & Interference Layers**:
  - Overlay topography data (if available)
  - Show RF propagation prediction
  - Display past packet heatmap (density of traffic)

**SQL Examples:**
```sql
-- Current node positions with status
SELECT 
  node_id, short_name, latitude, longitude, altitude,
  battery_level, latency_ms, 
  CASE WHEN last_seen >= now() - interval '5 minutes' THEN 'online' 
       WHEN last_seen >= now() - interval '1 hour' THEN 'idle'
       ELSE 'offline' END AS status,
  hw_model, role
FROM stridetastic_api_node
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Position update history (mobility trail)
SELECT 
  pp.latitude, pp.longitude, pp.altitude, pp.time,
  p.from_node_id
FROM stridetastic_api_positionpayload pp
JOIN stridetastic_api_packetdata pd ON pp.packet_data_id = pd.id
JOIN stridetastic_api_packet p ON pd.packet_id = p.id
WHERE p.from_node_id = ${node:sqlstring}
AND pp.time >= now() - interval '${time_range}'
ORDER BY pp.time;
```

---

### Category B: Node Health & Device Intelligence

#### 4. **Individual Node Telemetry Dashboard** (Per-Node Details)
Deep dive into device metrics for a specific node.

**Recommended Panels:**
- **Device Status Card**:
  - Node ID, name, model, role, location (lat/lon)
  - Last seen (time delta)
  - Uptime (calculated from uptime_seconds)
  - MAC address, Public key fingerprint status
  - Channel memberships
  
- **Power Management Metrics**:
  - Battery level (gauge with threshold warnings: <20% critical, <50% caution)
  - Voltage trend (line chart, detect low-battery curve)
  - Charging state (if available)
  - Power consumption estimation (uptime vs battery drain rate)
  - Predicted time to discharge (linear regression)
  
- **Environmental Sensors**:
  - Temperature trend (line chart with min/max/avg)
  - Humidity gauge
  - Barometric pressure trend (useful for weather)
  - IAQ (Indoor Air Quality) index
  - Gas resistance (VOC detection)
  - Anomaly detection: flag unexpected values (e.g., temp spike = short circuit?)
  
- **Radio Performance**:
  - Latency histogram (min/max/p50/p95/p99)
  - Reachability % (probe success rate)
  - RSSI/SNR distribution to neighbors (box plot)
  - Duty Cycle % (traffic load)
  - Channel utilization % (congestion indicator)
  
- **Network Activity**:
  - Packets sent/received per minute
  - Messages by port type (pie: TEXT_MESSAGE vs POSITION vs TELEMETRY)
  - Packet acknowledgment rate (want_ack vs ackd)
  - Retry/NAK rate (delivery reliability)

**SQL Examples:**
```sql
-- Power consumption trend (battery drain rate over time)
SELECT 
  date_trunc('hour', time) AS hour,
  avg(battery_level) AS avg_battery,
  first(battery_level) - last(battery_level) AS drain_pct_per_hour
FROM (SELECT * FROM stridetastic_api_telemetrypayload 
      WHERE packet_data_id IN (
        SELECT id FROM stridetastic_api_packetdata 
        WHERE packet_id IN (
          SELECT id FROM stridetastic_api_packet 
          WHERE from_node_id = (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
        )
      )
      ORDER BY time
)
GROUP BY date_trunc('hour', time)
ORDER BY hour DESC;

-- Latency percentiles
SELECT 
  percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_ms,
  max(latency_ms) AS max_ms,
  min(latency_ms) AS min_ms,
  avg(latency_ms) AS avg_ms
FROM stridetastic_api_nodelatencyhistory
WHERE node_id = (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
AND time >= now() - interval '${interval}';

-- Packet delivery success rate
SELECT 
  round(100.0 * count(CASE WHEN ackd THEN 1 END) / 
    count(*), 2) AS ack_rate_pct,
  count(*) AS total_packets,
  count(CASE WHEN ackd THEN 1 END) AS acked_packets,
  count(CASE WHEN want_ack AND NOT ackd THEN 1 END) AS failed_packets
FROM stridetastic_api_packet
WHERE from_node_id = (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
AND time >= now() - interval '${interval}';
```

---

#### 5. **Battery & Power Monitoring (IoT Focus)**
Specialized panel for power-critical deployments.

**Recommended Panels:**
- **Fleet Battery Distribution**:
  - Histogram: battery levels across all nodes (buckets: 0-10%, 10-25%, 25-50%, 50-75%, 75-100%)
  - Identify nodes needing charge soon
  
- **Battery Drain Rate Prediction**:
  - Per-node: calculate drain_rate_pct_per_hour
  - Estimate days until discharge
  - Alert when <2 days estimated remaining
  
- **Seasonal/Pattern Analysis**:
  - Average battery by time-of-day (usage patterns)
  - Daily cycle: peak drain times
  - Weekend vs weekday differences
  
- **Battery Health Correlation**:
  - Scatter plot: voltage vs battery_level (detect worn-out batteries)
  - Uptime vs battery (heavy users have shorter lifetimes)
  - Temperature vs battery drain (thermal effects)

**SQL Examples:**
```sql
-- Battery distribution across fleet
SELECT 
  CASE 
    WHEN battery_level IS NULL THEN 'unknown'
    WHEN battery_level < 10 THEN 'critical (<10%)'
    WHEN battery_level < 25 THEN 'low (10-25%)'
    WHEN battery_level < 50 THEN 'medium (25-50%)'
    WHEN battery_level < 75 THEN 'good (50-75%)'
    ELSE 'excellent (75%+)'
  END AS battery_bucket,
  count(*) AS node_count
FROM stridetastic_api_node
WHERE battery_level IS NOT NULL
GROUP BY battery_bucket
ORDER BY battery_level;

-- Nodes requiring attention soon (estimated discharge in 2 days)
WITH battery_trends AS (
  SELECT 
    n.node_id,
    n.battery_level AS current_battery,
    avg(tp.battery_level) FILTER (WHERE tp.time >= now() - interval '24 hours') AS avg_24h_battery,
    (COALESCE(avg(tp.battery_level) FILTER (WHERE tp.time >= now() - interval '24 hours'), 
               n.battery_level) - n.battery_level) / 24.0 AS drain_rate_pct_per_hour
  FROM stridetastic_api_node n
  LEFT JOIN stridetastic_api_telemetrypayload tp ON tp.packet_data_id IN (
    SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
      SELECT id FROM stridetastic_api_packet WHERE from_node_id = n.id
    )
  )
  GROUP BY n.id, n.node_id, n.battery_level
)
SELECT 
  node_id,
  current_battery,
  drain_rate_pct_per_hour,
  CASE WHEN drain_rate_pct_per_hour > 0 
    THEN round(current_battery / drain_rate_pct_per_hour, 1) 
    ELSE 999 END AS hours_until_discharged
FROM battery_trends
WHERE drain_rate_pct_per_hour > 0 
  AND (current_battery / drain_rate_pct_per_hour) < 48  -- Less than 2 days
ORDER BY hours_until_discharged;
```

---

#### 6. **Node Inventory & Configuration Tracker**
Compliance and configuration management view.

**Recommended Panels:**
- **Hardware Inventory Table**:
  - Columns: node_id, hw_model, role, is_licensed, is_virtual, is_unmessagable, first_seen, uptime_seconds
  - Filter by hardware type, role, licensing status
  - Export to CSV
  
- **Configuration Compliance**:
  - Check: All routers >= 2 hops? (recommend minimum 2)
  - Check: All nodes have unique PSK channels assigned?
  - Check: Licensed nodes percentage (for regulations)
  - Check: Virtual nodes for critical functions?
  
- **Role Distribution Pie**:
  - Percentage of CLIENT vs ROUTER vs REPEATER (if used)
  - Recommend ratio: 80% clients, 20% routers
  
- **Uptime Leaderboard**:
  - Longest-running nodes
  - Newest nodes (recent additions)
  - Frequently restarts (potential hardware issues)

---

### Category C: Traffic & Message Analytics

#### 7. **Packet Flow & Throughput Dashboard**
Network traffic analysis like traditional NetFlow dashboards.

**Recommended Panels:**
- **Network Throughput (Sankey Diagram)**:
  - Flow from sending nodes → receiving nodes
  - Width/color = packet count
  - Show top 20 connections (most traffic)
  - Breakdown by port type (TEXT vs TELEMETRY vs POSITION)
  
- **Packet Rates by Port**:
  - Stacked area chart:
    - TEXT_MESSAGE_APP
    - POSITION_APP
    - NODEINFO_APP
    - TELEMETRY_APP
    - TRACEROUTE_APP
    - ROUTING_APP
  - Identify dominant packet types
  
- **Message Statistics**:
  - Total messages sent
  - Messages by direction (originating vs relayed/gateway)
  - Message sizes (payload distribution)
  - Broadcast vs unicast ratio
  
- **Packet Reliability Metrics**:
  - ACK rate trend (% of want_ack packets that received ack)
  - Retry count distribution (retransmissions)
  - Failed delivery reasons (broken down by routing error type)
  - Time-to-ACK distribution (delivery latency)
  
- **Gateway Activity**:
  - Packets through each gateway node
  - Gateway node utilization %
  - MQTT bridge traffic (if available)
  - External relay status

**SQL Examples:**
```sql
-- Top packet flows (source → dest)
SELECT 
  n1.node_id AS source,
  n2.node_id AS dest,
  count(*) AS packet_count,
  avg(p.rx_rssi)::numeric(5,2) AS avg_rssi,
  avg(p.rx_snr)::numeric(5,2) AS avg_snr
FROM stridetastic_api_packet p
JOIN stridetastic_api_node n1 ON p.from_node_id = n1.id
JOIN stridetastic_api_node n2 ON p.to_node_id = n2.id
WHERE p.time >= now() - interval '${interval}'
GROUP BY p.from_node_id, p.to_node_id
ORDER BY packet_count DESC
LIMIT 20;

-- Packet distribution by type
SELECT 
  pd.port AS port_type,
  count(*) AS packet_count,
  round(100.0 * count(*) / sum(count(*)) OVER (), 2) AS pct_of_total
FROM stridetastic_api_packetdata pd
JOIN stridetastic_api_packet p ON pd.packet_id = p.id
WHERE p.time >= now() - interval '${interval}'
GROUP BY pd.port
ORDER BY packet_count DESC;

-- Message delivery reliability
SELECT 
  round(100.0 * count(CASE WHEN ackd THEN 1 END) / 
    count(CASE WHEN want_ack THEN 1 END), 2) AS ack_success_rate,
  count(CASE WHEN want_ack THEN 1 END) AS ack_requested,
  count(CASE WHEN want_ack AND ackd THEN 1 END) AS ack_received,
  count(CASE WHEN want_ack AND NOT ackd THEN 1 END) AS ack_missed
FROM stridetastic_api_packet
WHERE time >= now() - interval '${interval}';
```

---

#### 8. **Channel Activity & Messaging Statistics**
Per-channel messaging analytics.

**Recommended Panels:**
- **Channel Message Volume**:
  - Bar chart: messages per channel (ranked)
  - Identify most active channels
  - Show members per channel
  
- **Channel Members Activity**:
  - Table: channel_id, member count, total_messages, last_message_time
  - Hint at spam/abuse (unusual channel activity)
  
- **Message Types by Channel**:
  - Stacked bar: each channel's message composition (TEXT vs POSITION vs TELEMETRY)
  - Channels used for different purposes (data vs chat)

---

### Category D: Routing & Link Quality Analysis

#### 9. **Routing Analysis & Path Visualization**
Understanding mesh routing dynamics like BGP visualizers (BGPlay, Routeviews).

**Recommended Panels:**
- **Route Discovery Events**:
  - Timeline of route discovery requests/replies
  - Source → destination routing attempts
  - Success rate for route discovery
  
- **Route Diversity**:
  - Show multiple available paths to key nodes
  - Path redundancy check: are there backup routes?
  
- **Routing Errors Analysis**:
  - Breakdown of error types (NO_ROUTE, DUTY_CYCLE_LIMIT, MAX_RETRANSMIT, etc.)
  - Time series: error count over time
  - Which nodes/links generate most errors?
  
- **Hop Count Distribution**:
  - Histogram: nodes at hop distance 1, 2, 3, 4+ from originator
  - Network diameter tracking (max hops observed)
  - Ideal network: most nodes within 2-3 hops

**SQL Examples:**
```sql
-- Routing error analysis
SELECT 
  error_reason,
  count(*) AS error_count,
  round(100.0 * count(*) / sum(count(*)) OVER (), 2) AS pct
FROM stridetastic_api_routingpayload
WHERE time >= now() - interval '${interval}'
GROUP BY error_reason
ORDER BY error_count DESC;

-- Hop distance distribution (from originator node)
SELECT 
  (rdr.hop_start - rdr.hop_limit) AS hops_to_destination,
  count(DISTINCT p.from_node_id) AS node_count
FROM stridetastic_api_routediscoveryroute rdr
JOIN stridetastic_api_routediscoverypayload rdp ON rdr.id = rdp.route_towards_id
JOIN stridetastic_api_packetdata pd ON rdp.packet_data_id = pd.id
JOIN stridetastic_api_packet p ON pd.packet_id = p.id
WHERE p.time >= now() - interval '${interval}'
GROUP BY hops_to_destination
ORDER BY hops_to_destination;
```

---

#### 10. **Link Quality & SNR Analytics** (Radio Engineering Focus)
Critical for understanding mesh reliability.

**Recommended Panels:**
- **Neighbor SNR Heatmap**:
  - Matrix: each row=reporting_node, each column=neighbor
  - Color intensity = SNR value (green/yellow/red for good/fair/poor)
  - Identify weak links requiring intervention
  
- **SNR Distribution by Link**:
  - Box plot or violin plot: SNR distribution across all neighbor links
  - Percentiles: p10, p25, p50, p75, p90
  - Identify links at risk (consistently < 2 dB SNR)
  
- **SNR Trend Lines**:
  - Per-link: how has SNR changed over time? (detecting interference)
  - Detect links degrading (SNR dropping over time = problem)
  
- **RSSI Power Levels**:
  - Distribution of received signal strength across all links
  - Identify weak signals (e.g., <-120 dBm = marginal)
  
- **Link Symmetry Analysis**:
  - Some links may be asymmetric (A→B strong, B→A weak)
  - Recommend repeaters for asymmetric paths
  
- **Interference Detection**:
  - Sudden SNR drops across multiple links = interference event
  - Correlate with external events (WiFi, other mesh networks)

**SQL Examples:**
```sql
-- SNR statistics per link (reporting_node → neighbor)
SELECT 
  n.reporting_node_id_text AS reporting_node,
  neigh.advertised_node_id AS neighbor,
  count(*) AS samples,
  min(neigh.snr) AS min_snr,
  round(avg(neigh.snr)::numeric, 2) AS avg_snr,
  max(neigh.snr) AS max_snr,
  round(stddev(neigh.snr)::numeric, 2) AS stddev_snr,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY neigh.snr)::numeric, 2) AS median_snr
FROM stridetastic_api_neighborinfopayload n
JOIN stridetastic_api_neighborinfoneighbor neigh ON neigh.payload_id = n.id
WHERE n.time >= now() - interval '${interval}'
GROUP BY n.reporting_node_id_text, neigh.advertised_node_id
ORDER BY avg_snr ASC;

-- Poor SNR links (< 2 dB = concerning, < 5 dB = caution)
SELECT 
  n.reporting_node_id_text AS reporting_node,
  neigh.advertised_node_id AS neighbor,
  round(avg(neigh.snr)::numeric, 2) AS avg_snr,
  CASE WHEN avg(neigh.snr) < 2 THEN 'critical'
       WHEN avg(neigh.snr) < 5 THEN 'caution'
       ELSE 'ok' END AS link_quality
FROM stridetastic_api_neighborinfopayload n
JOIN stridetastic_api_neighborinfoneighbor neigh ON neigh.payload_id = n.id
WHERE n.time >= now() - interval '${interval}'
GROUP BY n.reporting_node_id_text, neigh.advertised_node_id
HAVING avg(neigh.snr) < 5
ORDER BY avg_snr;
```

---

### Category E: Alerting & Anomaly Detection

#### 11. **Alert Dashboard & Incident Management**
Proactive health monitoring and issue tracking.

**Recommended Alerts:**

1. **Network-Level Alerts**
   - Network reachability < 80%
   - Average latency > 2000ms
   - More than 30% of nodes unreachable for 15 minutes
   - No packets received for 30 minutes (network partitioned?)

2. **Node-Level Alerts**
   - Node offline for > 1 hour (expected back online?)
   - Battery level < 20% (critical, charge soon)
   - Battery level < 50% (caution, schedule charging)
   - Battery drain rate abnormal (e.g., 10%+ per hour = hardware fault?)
   - Temperature out of range: <-20°C or >60°C (hardware damage?)
   - High latency to this node: > 3000ms (poor signal/congested)
   - Latency reachable = False for 5+ consecutive probes
   - Uptime spike to 0 (device restarted unexpectedly)

3. **Link-Level Alerts**
   - SNR < 2 dB (link marginal, will drop packets)
   - SNR degrading trend (down 10+ dB over 1 hour = interference)
   - Unidirectional link persists for 1+ hour (A→B works, B→A fails)
   - No packets on previously active link for 2 hours

4. **Traffic Alerts**
   - Message ACK rate drops < 90% (delivery issues)
   - Routing error rate spike (more than 20% of packets fail routing)
   - Routing error types change (e.g., DUTY_CYCLE_LIMIT spike = congestion)
   - Gateway node down (can't reach external systems)

5. **Anomaly Alerts**
   - Unusual message rate change (2x normal traffic = bot/spam?)
   - Unusual packet size distribution
   - New node appears (first_seen just now)
   - Node broadcasting from unexpected location (GPS jump = publishing?)

**Alert Dashboard Panel:**
- Table: active alerts (alert_type, node/link, severity, time_triggered, acknowledgment_status)
- Alert history: resolved alerts with duration
- Alert frequency: top alert types
- Mean time to resolution (MTTR)
- Alert noise: which alerts are frequently resolved (tuning needed?)

---

#### 12. **Anomaly Detection & ML-Ready Metrics**
Foundation for intelligent alerting.

**Recommended Panels:**

- **Baseline vs Current Comparison**:
  - For each metric (latency, battery_drain, packet_rate), show:
    - 7-day baseline (average/std dev)
    - Current value with Z-score deviation
    - Highlight if Z-score > 2 (likely anomaly)
  
- **Timeseries Anomalies**:
  - Statistical anomaly detection (moving average ± 2 std dev)
  - Identify sudden jumps/drops
  - Suggested action: is this a real problem or sensor noise?
  
- **Forecast vs Actual**:
  - Use simple exponential smoothing to forecast expected values
  - Show forecast bands (confidence interval)
  - Alert if actual value outside band for 3+ consecutive readings
  
- **Correlation Heatmap**:
  - Show which metrics correlate (e.g., temp ↑ → battery_drain ↑)
  - Useful for root cause analysis

---

### Category F: Performance Optimization & Recommendations

#### 13. **Network Optimization Engine** (Intelligence Dashboard)
Actionable recommendations for network improvement.

**Recommended Panels:**

1. **Network Bottleneck Analysis**:
   - Identify nodes acting as bottlenecks (high relay load)
   - Recommend promoting high-traffic nodes to ROUTER role
   - Highlight nodes with consistently low battery (suggest replacing/relocating)
   
2. **Coverage Gap Analysis**:
   - Nodes with high latency/unreachable (poor signal)
   - Recommend new repeater placements (geographically central to gapped area)
   - Show nodes isolated (only 1 neighbor) = network fragmentation risk
   
3. **Link Redundancy Report**:
   - Nodes with only 1 neighbor (single point of failure)
   - Critical edges if removed, would partition network
   - Recommend mesh strengthening (add nodes to create alternate paths)
   
4. **Capacity Planning**:
   - Packet rate trend (linear regression forecast)
   - Time until network saturated (based on trend + current capacity)
   - Recommend channel management (load balancing across channels)
   
5. **Hardware Health Predictions**:
   - Nodes with degrading battery (likely to fail in N days)
   - Nodes with high uptime (may be due for maintenance reset)
   - Nodes with high temperature consistently (potential cooling issue)

---

#### 14. **Compliance & SLA Dashboard**
Service level tracking for managed networks.

**Recommended Panels:**

- **Network Availability SLA**:
  - Monthly uptime % (target: 99.5%?)
  - Network reachability SLA
  - Average latency SLA
  
- **Per-Node SLA**:
  - Individual node uptime %
  - Node meeting battery health targets?
  - Node relay performance (if ROUTER)
  
- **SLA Violation Log**:
  - When were SLAs breached?
  - Severity (5 min breach vs 1 hour breach)
  - Root cause (link failure? node offline? interference?)

---

### Category G: Operational Excellence

#### 15. **Capacity & Resource Monitoring Dashboard**
Database and infrastructure health.

**Recommended Panels:**

- **Database Size & Growth**:
  - Timescale table sizes: packets, telemetry, neighbors, nodes
  - Growth rate (GB/day)
  - Forecast: when will storage be full?
  - Data retention policy recommendations
  
- **Query Performance**:
  - Slow queries (> 1 second)
  - Index utilization
  - Cache hit rates (if applicable)
  
- **Capture Session Stats**:
  - Active captures
  - Total bytes captured (cumulative)
  - PCAP file sizes and growth
  - Archival recommendations (old captures to delete?)

---

#### 16. **Admin Control Panel**
Operational management view.

**Recommended Panels:**

- **Interface Status**:
  - MQTT broker connectivity
  - Serial port connections
  - WebSocket connections
  - Last error messages
  - Uptime per interface
  
- **System Health**:
  - API response times
  - Error rates (HTTP 5xx, database errors)
  - User activity (login counts)
  - Background job status (if any)
  
- **Configuration Audit**:
  - Recent changes to channel PSKs
  - Node role changes (client → router)
  - New interfaces added
  - Virtual nodes created/destroyed

---

## Part 3: Dashboard Architecture Recommendations

### Multi-Dashboard Organization

Instead of one monolithic dashboard, organize into **specialized dashboards**:

1. **Homepage/Executive Dashboard**
   - KPI cards, network status heat map, active alerts
   - Target: 5-minute review

2. **Network Topology Dashboard**
   - Interactive graph, link status, geographic map
   - Target: weekly network health review

3. **Node Explorer Dashboard**
   - Per-node details, telemetry trends, power management
   - Target: troubleshooting specific nodes

4. **Traffic Analytics Dashboard**
   - Packet flows, throughput, message types
   - Target: understanding network usage patterns

5. **Link Quality Dashboard**
   - SNR analysis, RSSI heatmap, link symmetry
   - Target: RF engineering optimization

6. **Alerts & Incidents Dashboard**
   - Active/historical alerts, incident tracking
   - Target: operations team during outages

7. **Network Optimization Dashboard**
   - Bottleneck analysis, coverage gaps, capacity forecast
   - Target: network planning and expansion

8. **Admin Dashboard**
   - System health, interface status, audit log
   - Target: infrastructure monitoring

---

### Grafana Features to Leverage

1. **Dashboard Variables**:
   - `$node` - select specific node
   - `$interval` - time range (1h, 24h, 7d, 30d)
   - `$role` - filter by node role (CLIENT/ROUTER)
   - `$hardware_model` - filter by device type
   
2. **Alert Rules** (in `provisioning/alerting/`):
   - Create YAML files for each alert type
   - Set thresholds, evaluation intervals, notification channels
   
3. **Data Sources**:
   - Primary: TimescaleDB (postgres)
   - Optional future: Prometheus (if you add metrics export)
   
4. **Plugins to Consider**:
   - `grafana-piechart-panel` (already included?)
   - `grafana-worldmap-panel` (geographic visualization)
   - `grafana-stat-panel` (already built-in)
   - `grafana-table-panel` (already built-in)
   - `grafana-gauge-panel` (already built-in)
   - `grafana-timeseries-panel` (already built-in)

---

### Implementation Roadmap

**Phase 1: Foundation (Weeks 1-2)**
- Implement Panels 1-5 (Network Overview, Node Telemetry, Battery, Inventory, Packet Flow)
- Set up basic alert rules for critical thresholds
- Deploy on-prem dashboards

**Phase 2: Advanced (Weeks 3-4)**
- Implement Panels 6-10 (Channel Activity, Routing, Link Quality)
- Add anomaly detection queries
- Implement alert escalation

**Phase 3: Intelligence (Weeks 5-6)**
- Implement Panels 11-14 (Alerting, Anomaly Detection, Optimization, Compliance)
- Add ML-ready metrics export
- Create capacity forecasting

**Phase 4: Polish (Weeks 7+)**
- Implement Panels 15-16 (Capacity, Admin)
- Performance optimization
- Documentation and runbooks

---

## Part 4: SQL Query Library

All queries use Grafana macros:
- `$__timeFilter(field)` - automatically adds time range WHERE clause
- `$__timeGroup(field, 'interval')` - groups by time bucket
- `${variable}` - substitutes variable value
- `${variable:sqlstring}` - safely quotes string variable

Queries are optimized for TimescaleDB hypertables (auto-chunking by time).

---

## Part 5: Integration Points

### Future Integrations to Consider

1. **Prometheus Metrics Export**
   - Export current metrics as /metrics endpoint
   - Scrape into Prometheus alongside Grafana

2. **Slack/Email Notifications**
   - Send alerts to Slack channel
   - Email on critical issues

3. **Grafana Loki for Logs**
   - Collect logs from MQTT/Serial interfaces
   - Correlate with metrics for better debugging

4. **Machine Learning Integration**
   - Predict node failures 24+ hours in advance
   - Recommend optimal channel assignments
   - Detect usage patterns and recommend power modes

5. **API Webhooks**
   - Trigger external actions on alerts
   - Auto-remediation for known issues

---

## Conclusion

This comprehensive feature set transforms Grafana from simple **status monitoring** into an **intelligent network operations platform** for Meshtastic mesh networks.

**Key advantages of this approach:**
- **Actionable Intelligence**: Not just "what's happening" but "what should we do?"
- **Proactive Operations**: Predict and prevent issues before they affect users
- **Root Cause Analysis**: Deep telemetry enables fast troubleshooting
- **Capacity Planning**: Forecast growth, plan expansions
- **Compliance**: Document SLA adherence, audit trail

Start with the critical foundation panels (1-5) and progressively add specialized dashboards as your team gains maturity with the system.

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-17  
**Target System**: Grafana 12.2.1 + TimescaleDB + Meshtastic Backend
