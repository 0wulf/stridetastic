# Meshtastic Dashboard SQL Query Cookbook

All queries optimized for TimescaleDB with Grafana macro support.

---

## Table of Contents

1. [Network Overview Queries](#network-overview-queries)
2. [Node Health Queries](#node-health-queries)
3. [Packet & Traffic Queries](#packet--traffic-queries)
4. [Link Quality & SNR Queries](#link-quality--snr-queries)
5. [Telemetry & Sensors Queries](#telemetry--sensors-queries)
6. [Routing & Topology Queries](#routing--topology-queries)
7. [Battery & Power Queries](#battery--power-queries)
8. [Anomaly Detection Queries](#anomaly-detection-queries)
9. [Aggregation & Reporting Queries](#aggregation--reporting-queries)

---

## Network Overview Queries

### 1. Network Online Percentage (KPI Card)
**Use**: Network Health Dashboard, stat panel  
**Output**: Single value 0-100
```sql
SELECT round(100.0 * count(CASE WHEN last_seen >= now() - interval '5 minutes' THEN 1 END) 
  / count(*), 2) AS online_percentage
FROM stridetastic_api_node
WHERE last_seen >= now() - interval '30 days';
```

### 2. Nodes Online Timeline (Timeseries)
**Use**: Network Health, line chart  
**Output**: Time, value (node count)
```sql
SELECT 
  date_trunc('5 minutes', snapshots.capture_time) AS time,
  count(DISTINCT n.id) AS nodes_online
FROM (
  SELECT DISTINCT date_trunc('5 minutes', last_seen) AS capture_time
  FROM stridetastic_api_node
  WHERE last_seen >= now() - interval '${interval:csv}'
) snapshots
JOIN stridetastic_api_node n ON n.last_seen >= snapshots.capture_time - interval '5 minutes'
  AND n.last_seen < snapshots.capture_time + interval '1 minute'
GROUP BY date_trunc('5 minutes', snapshots.capture_time)
ORDER BY time;
```

**Note**: For simpler approach, use NetworkOverviewSnapshot if populated:
```sql
SELECT time, active_nodes AS value FROM stridetastic_api_networkoverviewsnapshot
WHERE $__timeFilter(time)
ORDER BY time;
```

### 3. Average Network Latency (KPI)
**Use**: Network Health, stat panel  
**Output**: Single value (ms)
```sql
SELECT round(avg(latency_ms)::numeric, 2) AS avg_latency_ms
FROM stridetastic_api_nodelatencyhistory
WHERE time >= now() - interval '5 minutes'
  AND latency_ms IS NOT NULL;
```

### 4. Network Reachability Rate (KPI)
**Use**: Network Health, stat panel  
**Output**: Percentage 0-100
```sql
SELECT round(100.0 * count(CASE WHEN reachable THEN 1 END) 
  / count(*), 2) AS reachability_pct
FROM stridetastic_api_nodelatencyhistory
WHERE time >= now() - interval '5 minutes'
  AND reachable IS NOT NULL;
```

### 5. Total Active Connections (KPI)
**Use**: Network Health, stat panel  
**Output**: Single value
```sql
SELECT count(*) AS total_links
FROM stridetastic_api_nodelink
WHERE last_activity >= now() - interval '24 hours';
```

### 6. Bidirectional vs Unidirectional Links (Pie)
**Use**: Network Health, pie chart  
**Output**: Metric, value
```sql
SELECT 
  CASE WHEN is_bidirectional THEN 'Bidirectional' ELSE 'Unidirectional' END AS metric,
  count(*) AS value
FROM stridetastic_api_nodelink
WHERE last_activity >= now() - interval '${interval:csv}'
GROUP BY is_bidirectional;
```

### 7. Average Network SNR (KPI)
**Use**: Network Health, stat panel  
**Output**: Single value (dB)
```sql
SELECT round(avg(snr)::numeric, 2) AS avg_snr_db
FROM stridetastic_api_neighborinfoneighbor neigh
WHERE payload_id IN (
  SELECT id FROM stridetastic_api_neighborinfopayload 
  WHERE time >= now() - interval '5 minutes'
)
AND snr IS NOT NULL;
```

### 8. Average Network RSSI (KPI)
**Use**: Network Health, stat panel  
**Output**: Single value (dBm)
```sql
SELECT round(avg(rx_rssi)::numeric, 2) AS avg_rssi_dbm
FROM stridetastic_api_packet
WHERE time >= now() - interval '5 minutes'
  AND rx_rssi IS NOT NULL;
```

### 9. Network Diameter (Max Hop Count)
**Use**: Network Health, stat panel  
**Output**: Single value (hops)
```sql
SELECT max(hop_limit - COALESCE(first_hop, hop_limit)) AS max_hops
FROM stridetastic_api_packet
WHERE time >= now() - interval '${interval:csv}'
  AND hop_limit IS NOT NULL
  AND first_hop IS NOT NULL;
```

### 10. Average Fleet Battery Level (KPI)
**Use**: Network Health, stat panel  
**Output**: Percentage 0-100
```sql
SELECT round(avg(battery_level)::numeric, 2) AS avg_battery_pct
FROM stridetastic_api_node
WHERE battery_level IS NOT NULL
  AND last_seen >= now() - interval '24 hours';
```

---

## Node Health Queries

### 1. Node Detail Snapshot (Table)
**Use**: Node Telemetry Dashboard, table  
**Output**: All node metadata
```sql
SELECT 
  node_id,
  short_name,
  long_name,
  hw_model,
  role,
  battery_level,
  temperature,
  latitude,
  longitude,
  altitude,
  latency_ms,
  last_seen,
  uptime_seconds,
  channel_utilization,
  air_util_tx
FROM stridetastic_api_node
WHERE node_id = ${node:sqlstring}
LIMIT 1;
```

### 2. Node Uptime Calculator (Stat)
**Use**: Node Telemetry, stat card  
**Output**: Uptime in days
```sql
SELECT 
  round((EXTRACT(EPOCH FROM (now() - first_seen)) / 86400)::numeric, 2) AS uptime_days
FROM stridetastic_api_node
WHERE node_id = ${node:sqlstring};
```

### 3. Latency Percentiles (Table)
**Use**: Node Telemetry, stat table  
**Output**: p50, p95, p99 in ms
```sql
SELECT 
  count(*) AS samples,
  round(min(latency_ms)::numeric, 2) AS min_ms,
  round(percentile_cont(0.25) WITHIN GROUP (ORDER BY latency_ms)::numeric, 2) AS p25_ms,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::numeric, 2) AS p50_ms,
  round(percentile_cont(0.75) WITHIN GROUP (ORDER BY latency_ms)::numeric, 2) AS p75_ms,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 2) AS p95_ms,
  round(percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms)::numeric, 2) AS p99_ms,
  round(max(latency_ms)::numeric, 2) AS max_ms,
  round(avg(latency_ms)::numeric, 2) AS avg_ms,
  round(stddev(latency_ms)::numeric, 2) AS stddev_ms
FROM stridetastic_api_nodelatencyhistory
WHERE node_id = (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  AND time >= now() - interval '${interval:csv}'
  AND latency_ms IS NOT NULL;
```

### 4. Latency Timeseries (Timeseries)
**Use**: Node Telemetry, line chart  
**Output**: Time, value (latency in ms)
```sql
SELECT 
  $__timeGroup(time, '1m') AS "time",
  avg(latency_ms)::numeric(8,2) AS value
FROM stridetastic_api_nodelatencyhistory
WHERE node_id = (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  AND $__timeFilter(time)
GROUP BY $__timeGroup(time, '1m')
ORDER BY "time";
```

### 5. Latency Unreachable Indicator (Timeseries)
**Use**: Node Telemetry, bar chart (red for unreachable)  
**Output**: Time, value (1 = reachable, 0 = unreachable)
```sql
SELECT 
  $__timeGroup(time, '5m') AS "time",
  round(100.0 * count(CASE WHEN reachable THEN 1 END) / count(*), 0)::int AS reachability_pct
FROM stridetastic_api_nodelatencyhistory
WHERE node_id = (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  AND $__timeFilter(time)
GROUP BY $__timeGroup(time, '5m')
ORDER BY "time";
```

### 6. Latest Device Telemetry (Table)
**Use**: Node Telemetry, single row table  
**Output**: Battery, voltage, temp, etc.
```sql
SELECT 
  tp.battery_level,
  tp.voltage,
  tp.temperature,
  tp.relative_humidity,
  tp.barometric_pressure,
  tp.channel_utilization,
  tp.air_util_tx,
  tp.uptime_seconds,
  tp.gas_resistance,
  tp.iaq,
  tp.time AS recorded_at
FROM stridetastic_api_telemetrypayload tp
WHERE tp.packet_data_id IN (
  SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
    SELECT id FROM stridetastic_api_packet WHERE from_node_id = 
      (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  )
)
ORDER BY tp.time DESC
LIMIT 1;
```

### 7. Nodes Offline (Table)
**Use**: Alerting Dashboard  
**Output**: Node list with offline duration
```sql
SELECT 
  node_id,
  short_name,
  EXTRACT(HOUR FROM (now() - last_seen))::int AS hours_offline,
  last_seen,
  battery_level
FROM stridetastic_api_node
WHERE last_seen < now() - interval '1 hour'
  AND first_seen >= now() - interval '7 days'  -- Exclude old nodes
ORDER BY last_seen ASC;
```

### 8. Nodes by Role (Pie)
**Use**: Inventory Dashboard  
**Output**: Role, count
```sql
SELECT 
  role AS metric,
  count(*) AS value
FROM stridetastic_api_node
WHERE last_seen >= now() - interval '7 days'
GROUP BY role
ORDER BY value DESC;
```

### 9. Nodes by Hardware Model (Pie)
**Use**: Inventory Dashboard  
**Output**: Model, count
```sql
SELECT 
  hw_model AS metric,
  count(*) AS value
FROM stridetastic_api_node
WHERE hw_model IS NOT NULL
  AND last_seen >= now() - interval '7 days'
GROUP BY hw_model
ORDER BY value DESC;
```

### 10. Uptime Leaderboard (Table)
**Use**: Inventory Dashboard  
**Output**: Ranked by longest uptime
```sql
SELECT 
  node_id,
  short_name,
  hw_model,
  role,
  first_seen,
  round((EXTRACT(EPOCH FROM (now() - first_seen)) / 86400)::numeric, 1) AS uptime_days,
  battery_level,
  last_seen
FROM stridetastic_api_node
WHERE last_seen >= now() - interval '24 hours'
ORDER BY first_seen ASC
LIMIT 50;
```

---

## Packet & Traffic Queries

### 1. Packets per Minute (Timeseries)
**Use**: Packet Flow Dashboard, line chart  
**Output**: Time, value (packet count)
```sql
SELECT 
  $__timeGroup(time, '1m') AS "time",
  count(*) AS packets_per_minute
FROM stridetastic_api_packet
WHERE $__timeFilter(time)
GROUP BY $__timeGroup(time, '1m')
ORDER BY "time";
```

### 2. Packets from Specific Node (Timeseries)
**Use**: Node Telemetry, line chart  
**Output**: Time, value
```sql
SELECT 
  $__timeGroup(p.time, '1m') AS "time",
  count(*) AS packets_per_minute
FROM stridetastic_api_packet p
WHERE p.from_node_id = (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  AND $__timeFilter(p.time)
GROUP BY $__timeGroup(p.time, '1m')
ORDER BY "time";
```

### 3. Top Packet Flows (Sankey/Table)
**Use**: Packet Flow Dashboard  
**Output**: Source, dest, count
```sql
SELECT 
  n1.node_id AS source,
  n2.node_id AS dest,
  count(*) AS packet_count,
  round(avg(p.rx_rssi)::numeric, 2) AS avg_rssi,
  round(avg(p.rx_snr)::numeric, 2) AS avg_snr,
  round(100.0 * count(CASE WHEN p.ackd THEN 1 END) / 
    count(CASE WHEN p.want_ack THEN 1 END), 2) AS ack_rate_pct
FROM stridetastic_api_packet p
JOIN stridetastic_api_node n1 ON p.from_node_id = n1.id
JOIN stridetastic_api_node n2 ON p.to_node_id = n2.id
WHERE p.time >= now() - interval '${interval:csv}'
GROUP BY p.from_node_id, p.to_node_id
ORDER BY packet_count DESC
LIMIT 20;
```

### 4. Packet Distribution by Port (Pie)
**Use**: Packet Flow Dashboard  
**Output**: Port type, count
```sql
SELECT 
  COALESCE(pd.port, 'unknown') AS metric,
  count(*) AS value
FROM stridetastic_api_packetdata pd
JOIN stridetastic_api_packet p ON pd.packet_id = p.id
WHERE p.time >= now() - interval '${interval:csv}'
GROUP BY pd.port
ORDER BY value DESC;
```

### 5. Message Delivery Reliability (KPI)
**Use**: Packet Flow Dashboard  
**Output**: Percentage
```sql
SELECT 
  round(100.0 * count(CASE WHEN ackd THEN 1 END) / 
    count(CASE WHEN want_ack THEN 1 END), 2) AS ack_success_rate_pct
FROM stridetastic_api_packet
WHERE time >= now() - interval '${interval:csv}'
  AND want_ack = true;
```

### 6. Packet Throughput Timeseries (Stacked by Port)
**Use**: Packet Flow Dashboard, stacked area  
**Output**: Time, metric (port type), value
```sql
SELECT 
  $__timeGroup(p.time, '5m') AS "time",
  COALESCE(pd.port, 'unknown') AS metric,
  count(*) AS value
FROM stridetastic_api_packet p
LEFT JOIN stridetastic_api_packetdata pd ON p.id = pd.packet_id
WHERE $__timeFilter(p.time)
GROUP BY $__timeGroup(p.time, '5m'), pd.port
ORDER BY "time", metric;
```

### 7. Broadcast vs Unicast Messages (Pie)
**Use**: Channel Activity Dashboard  
**Output**: Type, count
```sql
SELECT 
  CASE 
    WHEN p.to_node_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '!ffffffff') 
      THEN 'broadcast' 
    ELSE 'unicast' 
  END AS metric,
  count(*) AS value
FROM stridetastic_api_packet p
WHERE p.time >= now() - interval '${interval:csv}'
GROUP BY metric;
```

### 8. Retry/NAK Indicators (Timeseries)
**Use**: Packet Flow Dashboard  
**Output**: Time, value
```sql
SELECT 
  $__timeGroup(time, '5m') AS "time",
  round(100.0 * count(CASE WHEN want_ack AND NOT ackd THEN 1 END) / 
    count(CASE WHEN want_ack THEN 1 END), 2)::numeric(5,2) AS unack_rate_pct
FROM stridetastic_api_packet
WHERE $__timeFilter(time)
GROUP BY $__timeGroup(time, '5m')
ORDER BY "time";
```

### 9. Gateway Activity (Table)
**Use**: Traffic Dashboard  
**Output**: Gateway node, packet count
```sql
SELECT 
  n.node_id AS gateway_node,
  count(DISTINCT p.id) AS packets_gatewayed,
  count(DISTINCT p.from_node_id) AS source_nodes,
  max(p.time) AS last_activity
FROM stridetastic_api_node n
JOIN stridetastic_api_packet_gateway_nodes pgn ON n.id = pgn.node_id
JOIN stridetastic_api_packet p ON pgn.packet_id = p.id
WHERE p.time >= now() - interval '${interval:csv}'
GROUP BY n.id
ORDER BY packets_gatewayed DESC;
```

### 10. Via MQTT Bridge Activity (Timeseries)
**Use**: Traffic Dashboard  
**Output**: Time, count
```sql
SELECT 
  $__timeGroup(time, '5m') AS "time",
  count(*) AS mqtt_packets
FROM stridetastic_api_packet
WHERE via_mqtt = true
  AND $__timeFilter(time)
GROUP BY $__timeGroup(time, '5m')
ORDER BY "time";
```

---

## Link Quality & SNR Queries

### 1. SNR Heatmap Data (Table)
**Use**: Link Quality Dashboard  
**Output**: Reporting node, neighbor, SNR (for heatmap visualization)
```sql
SELECT 
  n.reporting_node_id_text AS from_node,
  neigh.advertised_node_id AS to_node,
  round(avg(neigh.snr)::numeric, 2) AS avg_snr,
  count(*) AS samples,
  round(stddev(neigh.snr)::numeric, 2) AS stddev_snr
FROM stridetastic_api_neighborinfopayload n
JOIN stridetastic_api_neighborinfoneighbor neigh ON neigh.payload_id = n.id
WHERE n.time >= now() - interval '${interval:csv}'
GROUP BY n.reporting_node_id_text, neigh.advertised_node_id
ORDER BY avg_snr ASC;
```

### 2. SNR Distribution (Box Plot)
**Use**: Link Quality Dashboard  
**Output**: Quartile stats
```sql
SELECT 
  count(*) AS samples,
  round(min(snr)::numeric, 2) AS min_snr,
  round(percentile_cont(0.25) WITHIN GROUP (ORDER BY snr)::numeric, 2) AS q1_snr,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY snr)::numeric, 2) AS median_snr,
  round(percentile_cont(0.75) WITHIN GROUP (ORDER BY snr)::numeric, 2) AS q3_snr,
  round(max(snr)::numeric, 2) AS max_snr,
  round(avg(snr)::numeric, 2) AS mean_snr,
  round(stddev(snr)::numeric, 2) AS stddev_snr
FROM stridetastic_api_neighborinfoneighbor neigh
WHERE payload_id IN (
  SELECT id FROM stridetastic_api_neighborinfopayload 
  WHERE time >= now() - interval '${interval:csv}'
);
```

### 3. Poor SNR Links (Alert Table)
**Use**: Alerting Dashboard  
**Output**: Links with SNR < threshold
```sql
SELECT 
  n.reporting_node_id_text AS reporting_node,
  neigh.advertised_node_id AS neighbor,
  round(avg(neigh.snr)::numeric, 2) AS avg_snr,
  CASE 
    WHEN avg(neigh.snr) < 2 THEN 'critical'
    WHEN avg(neigh.snr) < 5 THEN 'caution'
    ELSE 'ok'
  END AS status
FROM stridetastic_api_neighborinfopayload n
JOIN stridetastic_api_neighborinfoneighbor neigh ON neigh.payload_id = n.id
WHERE n.time >= now() - interval '${interval:csv}'
GROUP BY n.reporting_node_id_text, neigh.advertised_node_id
HAVING avg(neigh.snr) < 5
ORDER BY avg_snr ASC;
```

### 4. SNR Trend Line (Timeseries)
**Use**: Link Quality Dashboard  
**Output**: Time, SNR value
```sql
SELECT 
  $__timeGroup(n.time, '1h') AS "time",
  round(avg(neigh.snr)::numeric, 2) AS avg_snr
FROM stridetastic_api_neighborinfopayload n
JOIN stridetastic_api_neighborinfoneighbor neigh ON neigh.payload_id = n.id
WHERE n.reporting_node_id_text = ${reporting_node:sqlstring}
  AND neigh.advertised_node_id = ${neighbor:sqlstring}
  AND $__timeFilter(n.time)
GROUP BY $__timeGroup(n.time, '1h')
ORDER BY "time";
```

### 5. RSSI Distribution (Histogram)
**Use**: Link Quality Dashboard  
**Output**: RSSI buckets, count
```sql
SELECT 
  CASE 
    WHEN rx_rssi > -80 THEN 'excellent (-80 to 0)'
    WHEN rx_rssi > -100 THEN 'good (-100 to -80)'
    WHEN rx_rssi > -120 THEN 'fair (-120 to -100)'
    ELSE 'poor (< -120)'
  END AS rssi_bucket,
  count(*) AS packet_count
FROM stridetastic_api_packet
WHERE rx_rssi IS NOT NULL
  AND time >= now() - interval '${interval:csv}'
GROUP BY rssi_bucket
ORDER BY rssi_bucket;
```

### 6. Link Asymmetry Analysis (Table)
**Use**: Link Quality Dashboard  
**Output**: Asymmetric link pairs
```sql
WITH link_stats AS (
  SELECT 
    n1.node_id AS from_node,
    n2.node_id AS to_node,
    nl.node_a_to_node_b_packets,
    nl.node_b_to_node_a_packets,
    abs(nl.node_a_to_node_b_packets - nl.node_b_to_node_a_packets) AS asymmetry
  FROM stridetastic_api_nodelink nl
  JOIN stridetastic_api_node n1 ON nl.node_a_id = n1.id
  JOIN stridetastic_api_node n2 ON nl.node_b_id = n2.id
  WHERE nl.last_activity >= now() - interval '${interval:csv}'
)
SELECT 
  from_node,
  to_node,
  node_a_to_node_b_packets,
  node_b_to_node_a_packets,
  asymmetry
FROM link_stats
WHERE asymmetry > (SELECT avg(asymmetry) FROM link_stats) * 2  -- 2x average = significant
ORDER BY asymmetry DESC;
```

### 7. Interference Detection (Anomaly)
**Use**: Link Quality Dashboard  
**Output**: Recent SNR drops
```sql
WITH recent_snr AS (
  SELECT 
    n.reporting_node_id_text,
    neigh.advertised_node_id,
    neigh.time,
    neigh.snr,
    lag(neigh.snr) OVER (PARTITION BY n.reporting_node_id_text, neigh.advertised_node_id 
      ORDER BY neigh.time) AS prev_snr,
    neigh.snr - lag(neigh.snr) OVER (PARTITION BY n.reporting_node_id_text, neigh.advertised_node_id 
      ORDER BY neigh.time) AS snr_change
  FROM stridetastic_api_neighborinfopayload n
  JOIN stridetastic_api_neighborinfoneighbor neigh ON neigh.payload_id = n.id
  WHERE n.time >= now() - interval '1 hour'
)
SELECT 
  reporting_node_id_text AS node,
  advertised_node_id AS neighbor,
  time,
  snr,
  prev_snr,
  snr_change
FROM recent_snr
WHERE snr_change IS NOT NULL AND snr_change < -10  -- SNR drop > 10 dB
ORDER BY time DESC;
```

---

## Telemetry & Sensors Queries

### 1. Temperature Timeseries
**Use**: Node Telemetry Dashboard  
**Output**: Time, temperature
```sql
SELECT 
  $__timeGroup(tp.time, '5m') AS "time",
  round(avg(tp.temperature)::numeric, 2) AS temperature_celsius
FROM stridetastic_api_telemetrypayload tp
WHERE tp.packet_data_id IN (
  SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
    SELECT id FROM stridetastic_api_packet WHERE from_node_id = 
      (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  )
)
AND $__timeFilter(tp.time)
GROUP BY $__timeGroup(tp.time, '5m')
ORDER BY "time";
```

### 2. Temperature Alert (Stat)
**Use**: Node Telemetry  
**Output**: Latest temperature with threshold color
```sql
SELECT temperature FROM stridetastic_api_telemetrypayload
WHERE packet_data_id IN (
  SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
    SELECT id FROM stridetastic_api_packet WHERE from_node_id = 
      (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  )
)
ORDER BY time DESC LIMIT 1;
```
**Grafana Thresholds**: Red < -20°C or > 60°C, Yellow < 0°C or > 50°C

### 3. Humidity Timeseries
**Use**: Node Telemetry Dashboard  
**Output**: Time, humidity
```sql
SELECT 
  $__timeGroup(tp.time, '5m') AS "time",
  round(avg(tp.relative_humidity)::numeric, 2) AS humidity_pct
FROM stridetastic_api_telemetrypayload tp
WHERE tp.packet_data_id IN (
  SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
    SELECT id FROM stridetastic_api_packet WHERE from_node_id = 
      (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  )
)
AND $__timeFilter(tp.time)
GROUP BY $__timeGroup(tp.time, '5m')
ORDER BY "time";
```

### 4. Barometric Pressure Timeseries
**Use**: Node Telemetry Dashboard  
**Output**: Time, pressure
```sql
SELECT 
  $__timeGroup(tp.time, '5m') AS "time",
  round(avg(tp.barometric_pressure)::numeric, 2) AS pressure_hpa
FROM stridetastic_api_telemetrypayload tp
WHERE tp.packet_data_id IN (
  SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
    SELECT id FROM stridetastic_api_packet WHERE from_node_id = 
      (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  )
)
AND $__timeFilter(tp.time)
GROUP BY $__timeGroup(tp.time, '5m')
ORDER BY "time";
```

### 5. Air Quality Index (IAQ) Timeseries
**Use**: Node Telemetry Dashboard  
**Output**: Time, IAQ value
```sql
SELECT 
  $__timeGroup(tp.time, '5m') AS "time",
  round(avg(tp.iaq)::numeric, 2) AS iaq_index
FROM stridetastic_api_telemetrypayload tp
WHERE tp.packet_data_id IN (
  SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
    SELECT id FROM stridetastic_api_packet WHERE from_node_id = 
      (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  )
)
AND $__timeFilter(tp.time)
GROUP BY $__timeGroup(tp.time, '5m')
ORDER BY "time";
```

### 6. Environmental Summary Table
**Use**: Node Telemetry Dashboard  
**Output**: Single latest record
```sql
SELECT 
  tp.temperature,
  tp.relative_humidity,
  tp.barometric_pressure,
  tp.gas_resistance,
  tp.iaq,
  tp.time AS recorded_at
FROM stridetastic_api_telemetrypayload tp
WHERE tp.packet_data_id IN (
  SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
    SELECT id FROM stridetastic_api_packet WHERE from_node_id = 
      (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  )
)
ORDER BY tp.time DESC LIMIT 1;
```

---

## Routing & Topology Queries

### 1. Route Discovery Timeline (Timeseries)
**Use**: Routing Dashboard  
**Output**: Time, count
```sql
SELECT 
  $__timeGroup(p.time, '5m') AS "time",
  count(*) AS route_discovery_events
FROM stridetastic_api_routediscoverypayload rdp
JOIN stridetastic_api_packetdata pd ON rdp.packet_data_id = pd.id
JOIN stridetastic_api_packet p ON pd.packet_id = p.id
WHERE $__timeFilter(p.time)
GROUP BY $__timeGroup(p.time, '5m')
ORDER BY "time";
```

### 2. Routing Error Breakdown (Pie)
**Use**: Routing Dashboard  
**Output**: Error type, count
```sql
SELECT 
  COALESCE(error_reason, 'none') AS metric,
  count(*) AS value
FROM stridetastic_api_routingpayload
WHERE time >= now() - interval '${interval:csv}'
GROUP BY error_reason
ORDER BY value DESC;
```

### 3. Hop Distance Distribution (Histogram)
**Use**: Routing Dashboard  
**Output**: Hop bucket, node count
```sql
SELECT 
  (p.hop_start - COALESCE(p.first_hop, p.hop_start)) AS hops_traversed,
  count(DISTINCT p.from_node_id) AS node_count
FROM stridetastic_api_packet p
WHERE p.time >= now() - interval '${interval:csv}'
  AND p.hop_start IS NOT NULL
  AND p.first_hop IS NOT NULL
GROUP BY (p.hop_start - COALESCE(p.first_hop, p.hop_start))
ORDER BY hops_traversed;
```

### 4. Network Partition Detection
**Use**: Alerting Dashboard  
**Output**: Boolean/status
```sql
SELECT 
  CASE 
    WHEN count(*) = 0 THEN 'no_packets'
    ELSE 'connected'
  END AS network_status
FROM stridetastic_api_packet
WHERE time >= now() - interval '30 minutes';
```

### 5. Topology Link List (Table)
**Use**: Network Topology Explorer  
**Output**: Bidirectional link pairs
```sql
SELECT 
  n1.node_id AS source,
  n2.node_id AS target,
  nl.total_packets,
  nl.node_a_to_node_b_packets,
  nl.node_b_to_node_a_packets,
  nl.is_bidirectional,
  nl.last_activity,
  round(EXTRACT(HOUR FROM (now() - nl.last_activity)), 1) AS hours_since_activity
FROM stridetastic_api_nodelink nl
JOIN stridetastic_api_node n1 ON nl.node_a_id = n1.id
JOIN stridetastic_api_node n2 ON nl.node_b_id = n2.id
WHERE nl.last_activity >= now() - interval '${interval:csv}'
ORDER BY nl.total_packets DESC;
```

---

## Battery & Power Queries

### 1. Battery Level Timeseries (Current Node)
**Use**: Power Management Dashboard  
**Output**: Time, battery %
```sql
SELECT 
  $__timeGroup(tp.time, '1h') AS "time",
  round(avg(tp.battery_level)::numeric, 2) AS battery_level_pct
FROM stridetastic_api_telemetrypayload tp
WHERE tp.packet_data_id IN (
  SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
    SELECT id FROM stridetastic_api_packet WHERE from_node_id = 
      (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  )
)
AND $__timeFilter(tp.time)
GROUP BY $__timeGroup(tp.time, '1h')
ORDER BY "time";
```

### 2. Battery Drain Rate (Current Node)
**Use**: Power Management  
**Output**: % per hour
```sql
WITH battery_history AS (
  SELECT tp.time, tp.battery_level
  FROM stridetastic_api_telemetrypayload tp
  WHERE tp.packet_data_id IN (
    SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
      SELECT id FROM stridetastic_api_packet WHERE from_node_id = 
        (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
    )
  )
  ORDER BY tp.time DESC LIMIT 100
)
SELECT 
  round(((first(battery_level) - last(battery_level)) / 
    EXTRACT(HOUR FROM (first(time) - last(time))))::numeric, 3) AS drain_rate_pct_per_hour,
  first(battery_level) AS current_battery_pct,
  last(battery_level) AS oldest_battery_pct
FROM battery_history;
```

### 3. Battery Discharge Time Prediction (Current Node)
**Use**: Power Management  
**Output**: Hours until discharge
```sql
WITH battery_stats AS (
  SELECT 
    COALESCE(n.battery_level, 50) AS current_battery,
    (
      SELECT (first(tp.battery_level) - last(tp.battery_level)) / 
        EXTRACT(HOUR FROM (first(tp.time) - last(tp.time)))
      FROM stridetastic_api_telemetrypayload tp
      WHERE tp.packet_data_id IN (
        SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
          SELECT id FROM stridetastic_api_packet WHERE from_node_id = n.id
        )
      )
      LIMIT 100
    ) AS drain_rate_pct_per_hour
  FROM stridetastic_api_node n
  WHERE n.node_id = ${node:sqlstring}
)
SELECT 
  CASE 
    WHEN drain_rate_pct_per_hour > 0 
      THEN round(current_battery / drain_rate_pct_per_hour, 1)
    ELSE 999
  END AS hours_remaining,
  current_battery,
  drain_rate_pct_per_hour
FROM battery_stats;
```

### 4. Battery Distribution (Fleet)
**Use**: Power Management Dashboard  
**Output**: Battery bucket, node count
```sql
SELECT 
  CASE 
    WHEN battery_level < 10 THEN 'critical (<10%)'
    WHEN battery_level < 25 THEN 'low (10-25%)'
    WHEN battery_level < 50 THEN 'medium (25-50%)'
    WHEN battery_level < 75 THEN 'good (50-75%)'
    ELSE 'excellent (75%+)'
  END AS battery_bucket,
  count(*) AS node_count
FROM stridetastic_api_node
WHERE battery_level IS NOT NULL
  AND last_seen >= now() - interval '24 hours'
GROUP BY battery_bucket
ORDER BY battery_level;
```

### 5. Nodes Needing Charge Soon
**Use**: Alerting Dashboard  
**Output**: Nodes with <2 days battery remaining
```sql
WITH battery_trends AS (
  SELECT 
    n.id,
    n.node_id,
    n.battery_level AS current_battery,
    (
      SELECT (first(tp.battery_level) - last(tp.battery_level)) / 
        EXTRACT(HOUR FROM (first(tp.time) - last(tp.time)))
      FROM stridetastic_api_telemetrypayload tp
      WHERE tp.packet_data_id IN (
        SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
          SELECT id FROM stridetastic_api_packet WHERE from_node_id = n.id
        )
      )
      AND tp.time >= now() - interval '24 hours'
      LIMIT 100
    ) AS drain_rate_pct_per_hour
  FROM stridetastic_api_node n
  WHERE n.battery_level IS NOT NULL
    AND n.last_seen >= now() - interval '24 hours'
)
SELECT 
  node_id,
  current_battery,
  drain_rate_pct_per_hour,
  CASE WHEN drain_rate_pct_per_hour > 0 
    THEN round(current_battery / drain_rate_pct_per_hour, 1) 
    ELSE 999 END AS hours_remaining,
  CASE 
    WHEN drain_rate_pct_per_hour > 0 AND (current_battery / drain_rate_pct_per_hour) < 48 
      THEN 'urgent'
    WHEN current_battery < 20 THEN 'low'
    ELSE 'ok'
  END AS status
FROM battery_trends
WHERE drain_rate_pct_per_hour > 0 AND (current_battery / drain_rate_pct_per_hour) < 48
ORDER BY hours_remaining;
```

### 6. Battery Health Correlation (Scatter Plot Data)
**Use**: Power Management Dashboard  
**Output**: Voltage vs battery level
```sql
SELECT 
  tp.battery_level,
  tp.voltage
FROM stridetastic_api_telemetrypayload tp
WHERE tp.packet_data_id IN (
  SELECT id FROM stridetastic_api_packetdata WHERE packet_id IN (
    SELECT id FROM stridetastic_api_packet WHERE from_node_id = 
      (SELECT id FROM stridetastic_api_node WHERE node_id = ${node:sqlstring})
  )
)
AND $__timeFilter(tp.time)
ORDER BY tp.time DESC
LIMIT 1000;
```

---

## Anomaly Detection Queries

### 1. Z-Score Anomaly (Latency)
**Use**: Anomaly Detection Dashboard  
**Output**: Time, zscore
```sql
WITH stats AS (
  SELECT 
    avg(latency_ms) AS mean,
    stddev(latency_ms) AS stdev
  FROM stridetastic_api_nodelatencyhistory
  WHERE time >= now() - interval '7 days'
    AND latency_ms IS NOT NULL
)
SELECT 
  $__timeGroup(nlh.time, '5m') AS "time",
  round(avg(nlh.latency_ms)::numeric, 2) AS latency_ms,
  round(((avg(nlh.latency_ms) - stats.mean) / NULLIF(stats.stdev, 0))::numeric, 2) AS z_score,
  CASE WHEN abs((avg(nlh.latency_ms) - stats.mean) / NULLIF(stats.stdev, 0)) > 2 
    THEN 'anomaly' ELSE 'normal' END AS status
FROM stridetastic_api_nodelatencyhistory nlh, stats
WHERE $__timeFilter(nlh.time)
  AND nlh.latency_ms IS NOT NULL
GROUP BY $__timeGroup(nlh.time, '5m')
ORDER BY "time";
```

### 2. Baseline vs Current (Moving Average)
**Use**: Anomaly Detection Dashboard  
**Output**: Time, baseline, current, delta
```sql
SELECT 
  $__timeGroup(time, '1m') AS bucket,
  avg(latency_ms) OVER (ORDER BY $__timeGroup(time, '1m') ROWS BETWEEN 1440 PRECEDING AND CURRENT ROW)::numeric(8,2) AS baseline_7d,
  avg(latency_ms)::numeric(8,2) AS current_value,
  (avg(latency_ms) - avg(latency_ms) OVER (ORDER BY $__timeGroup(time, '1m') ROWS BETWEEN 1440 PRECEDING AND CURRENT ROW))::numeric(8,2) AS delta
FROM stridetastic_api_nodelatencyhistory
WHERE $__timeFilter(time)
  AND latency_ms IS NOT NULL
GROUP BY $__timeGroup(time, '1m')
ORDER BY bucket;
```

### 3. Sudden Jumps Detection (Threshold Crossing)
**Use**: Alerting  
**Output**: Anomalies with timestamps
```sql
WITH recent_values AS (
  SELECT 
    time,
    latency_ms,
    lag(latency_ms, 1) OVER (ORDER BY time) AS prev_value,
    latency_ms - lag(latency_ms, 1) OVER (ORDER BY time) AS delta
  FROM stridetastic_api_nodelatencyhistory
  WHERE time >= now() - interval '24 hours'
    AND latency_ms IS NOT NULL
)
SELECT 
  time,
  latency_ms,
  prev_value,
  delta
FROM recent_values
WHERE abs(delta) > 500  -- Jump > 500ms
ORDER BY time DESC;
```

---

## Aggregation & Reporting Queries

### 1. Daily Network Summary
**Use**: Reporting/Export  
**Output**: Aggregated daily metrics
```sql
SELECT 
  date_trunc('day', time)::date AS day,
  count(DISTINCT from_node_id) AS unique_sender_nodes,
  count(*) AS total_packets,
  round(avg(latency_ms)::numeric, 2) AS avg_latency_ms,
  round(avg(rx_rssi)::numeric, 2) AS avg_rssi_dbm,
  round(avg(rx_snr)::numeric, 2) AS avg_snr_db,
  count(CASE WHEN ackd THEN 1 END)::float / count(CASE WHEN want_ack THEN 1 END) AS ack_rate
FROM stridetastic_api_packet
WHERE time >= now() - interval '30 days'
GROUP BY date_trunc('day', time)
ORDER BY day DESC;
```

### 2. Per-Node Uptime Report
**Use**: Reporting  
**Output**: Node list with uptime stats
```sql
SELECT 
  node_id,
  short_name,
  hw_model,
  role,
  first_seen,
  last_seen,
  round((EXTRACT(EPOCH FROM (now() - first_seen)) / 86400)::numeric, 1) AS uptime_days,
  round((EXTRACT(EPOCH FROM (last_seen - first_seen)) / 86400)::numeric, 1) AS seen_duration_days,
  battery_level
FROM stridetastic_api_node
WHERE last_seen >= now() - interval '30 days'
ORDER BY uptime_days DESC;
```

### 3. Network Performance Summary
**Use**: Executive Dashboard  
**Output**: Single summary row
```sql
SELECT 
  (SELECT count(*) FROM stridetastic_api_node WHERE last_seen >= now() - interval '24 hours') AS nodes_active_24h,
  (SELECT count(*) FROM stridetastic_api_nodelink WHERE last_activity >= now() - interval '24 hours') AS links_active_24h,
  (SELECT round(avg(latency_ms)::numeric, 2) FROM stridetastic_api_nodelatencyhistory WHERE time >= now() - interval '24 hours') AS avg_latency_24h,
  (SELECT round(100.0 * count(CASE WHEN ackd THEN 1 END) / count(CASE WHEN want_ack THEN 1 END), 2) 
   FROM stridetastic_api_packet WHERE time >= now() - interval '24 hours') AS ack_success_rate_24h;
```

---

## Query Performance Tips

1. **Always use `$__timeFilter(time)` on time columns** → enables chunk pruning
2. **Index on common WHERE fields**: `time`, `node_id`, `from_node_id`, `to_node_id`
3. **Use `LIMIT` in aggregations** → prevent memory bloat
4. **Materialized views** for expensive computations (Phase 3+)
5. **Sample data** if dealing with years of history
6. **Parameterize intervals** → `interval '${interval:csv}'` for dashboard variables

---

**Last Updated**: 2025-11-17  
**Database**: TimescaleDB with Meshtastic Schema
