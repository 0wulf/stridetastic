# Node Neighbors and Packet Publications Implementation Guide

## Overview

Add two new visualizations to the B4 Node Telemetry Dashboard:
1. **Node Neighbors Graph** - Shows direct neighbors with directionality (0-hop connections via Edges)
2. **Packet Publications** - Shows which addresses the node publishes packets to (from Logical Links)

---

## Part 1: Node Neighbors Graph

### Data Source
- **Table**: `stridetastic_api_graph_edge`
- **Filter**: `last_hops = 0` (direct 0-hop connections from NeighborInfo payloads)
- **Direction**: Source → Target (directional edges)

### Database Query Structure

```sql
-- Direct neighbors (0-hop edges FROM this node)
SELECT 
    target_node.node_id as neighbor_node_id,
    target_node.short_name,
    edge.last_rx_rssi,
    edge.last_rx_snr,
    edge.last_seen
FROM stridetastic_api_graph_edge edge
JOIN stridetastic_api_node source_node ON edge.source_node_id = source_node.id
JOIN stridetastic_api_node target_node ON edge.target_node_id = target_node.id
WHERE source_node.node_id = '${node}'
    AND edge.last_hops = 0
ORDER BY edge.last_rx_snr DESC;
```

### Visualization Components

#### A. Neighbors Table/Card (Simple Format)

**Grafana Panel Details:**
- Type: `table` or `stat` (repeating)
- Layout: Shows neighbor node ID, short name, SNR, RSSI, last seen
- Sorting: By SNR (best signal first)

**Query Structure:**
```sql
SELECT 
    target_node.node_id::text as "Neighbor ID",
    target_node.short_name as "Name",
    edge.last_rx_snr as "SNR (dB)",
    edge.last_rx_rssi as "RSSI (dBm)",
    edge.last_seen as "Last Seen"
FROM stridetastic_api_graph_edge edge
JOIN stridetastic_api_node target_node ON edge.target_node_id = target_node.id
WHERE edge.source_node_id = (
    SELECT id FROM stridetastic_api_node WHERE node_id = '${node}'
) AND edge.last_hops = 0
ORDER BY edge.last_rx_snr DESC NULLS LAST;
```

#### B. Neighbors Directionality Graph

**Grafana Panel Details:**
- Type: `nodeGraph` (if available in Grafana 12.x) or use custom visualization
- Shows directed connections with signal strength indication
- Color coding: Green (good SNR >10dB), Yellow (5-10dB), Orange (0-5dB), Red (<0dB)

**Alternative: Force-Directed Graph Using TimescaleDB Data**

For a more advanced visualization, we can create a force-graph style panel:

```sql
-- Both directions: neighbors of this node + nodes that see this node as neighbor
WITH outgoing AS (
    SELECT 
        target_node.node_id as remote_node_id,
        target_node.short_name,
        edge.last_rx_snr,
        'outgoing' as direction,
        0 as strength
    FROM stridetastic_api_graph_edge edge
    JOIN stridetastic_api_node target_node ON edge.target_node_id = target_node.id
    WHERE edge.source_node_id = (
        SELECT id FROM stridetastic_api_node WHERE node_id = '${node}'
    ) AND edge.last_hops = 0
),
incoming AS (
    SELECT 
        source_node.node_id as remote_node_id,
        source_node.short_name,
        edge.last_rx_snr,
        'incoming' as direction,
        1 as strength
    FROM stridetastic_api_graph_edge edge
    JOIN stridetastic_api_node source_node ON edge.source_node_id = source_node.id
    WHERE edge.target_node_id = (
        SELECT id FROM stridetastic_api_node WHERE node_id = '${node}'
    ) AND edge.last_hops = 0
)
SELECT * FROM outgoing
UNION ALL
SELECT * FROM incoming
ORDER BY direction, last_rx_snr DESC NULLS LAST;
```

### Color Thresholds for SNR
- **Green**: ≥ 10 dB (excellent)
- **Yellow**: 5-9 dB (good)
- **Orange**: 0-4 dB (fair)
- **Red**: < 0 dB (poor)

---

## Part 2: Packet Publications

### Data Source
- **Table**: `stridetastic_api_link_nodelink`
- **Focus**: Logical links where this node is `node_a` or `node_b`
- **Information**: Shows which specific addresses (via ports) the node communicates with

### Database Query Structure

```sql
-- All logical links from this node (addresses it publishes to)
SELECT 
    CASE 
        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
        THEN 'to_' || node_b.node_id
        ELSE 'from_' || node_a.node_id
    END as direction,
    CASE 
        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
        THEN node_b.short_name
        ELSE node_a.short_name
    END as remote_node,
    node_a_to_node_b_packets,
    node_b_to_node_a_packets,
    is_bidirectional,
    last_activity
FROM stridetastic_api_link_nodelink
WHERE node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
    OR node_b_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
ORDER BY last_activity DESC;
```

### Visualization Components

#### A. Publications Table

**Grafana Panel Details:**
- Type: `table`
- Shows remote address, direction, packet counts, bidirectionality status
- Columns:
  - Remote Address (node_id)
  - Remote Name (short_name)
  - Outgoing Packets (node_a_to_node_b or node_b_to_node_a)
  - Incoming Packets (reverse direction)
  - Bidirectional (yes/no)
  - Last Seen

**Query:**
```sql
SELECT 
    CASE 
        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
        THEN node_b.node_id
        ELSE node_a.node_id
    END::text as "Remote Address",
    CASE 
        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
        THEN node_b.short_name
        ELSE node_a.short_name
    END as "Name",
    CASE 
        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
        THEN node_a_to_node_b_packets
        ELSE node_b_to_node_a_packets
    END::int as "Packets Out",
    CASE 
        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
        THEN node_b_to_node_a_packets
        ELSE node_a_to_node_b_packets
    END::int as "Packets In",
    CASE 
        WHEN is_bidirectional THEN '✓ Yes'
        ELSE '✗ No'
    END as "Bidirectional",
    last_activity as "Last Activity"
FROM stridetastic_api_link_nodelink
WHERE node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
    OR node_b_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
ORDER BY last_activity DESC;
```

#### B. Publications Timeline (Optional)

Show packet exchange volume over time:

```sql
-- Timeline of packet publications
SELECT 
    $__timeGroup(last_activity, '1h') as "time",
    CASE 
        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
        THEN 'Outgoing'
        ELSE 'Incoming'
    END as "Direction",
    SUM(CASE 
        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
        THEN node_a_to_node_b_packets
        ELSE node_b_to_node_a_packets
    END) as "Packets"
FROM stridetastic_api_link_nodelink
WHERE (node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
    OR node_b_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}'))
    AND $__timeFilter(last_activity)
GROUP BY $__timeGroup(last_activity, '1h'), "Direction"
ORDER BY "time" DESC;
```

---

## Dashboard Layout

### New Section: "Node Network"

**Position**: After "Radio Performance" section (around y: 75)

**Subsections:**

1. **Direct Neighbors (0-Hop)**
   - Panel ID: 42 (Neighbors Table)
   - Panel ID: 43 (Neighbor Directionality Graph)
   - Grid Position: y: 75-85, w: 12 each

2. **Packet Publications**
   - Panel ID: 44 (Publications Table)
   - Panel ID: 45 (Publications Timeline)
   - Grid Position: y: 85-93, w: 12 each

---

## Implementation Checklist

### Phase 1: Backend API Queries
- [ ] Create reusable query for 0-hop neighbors (Edges)
- [ ] Create reusable query for logical links publications
- [ ] Test queries in database client
- [ ] Validate field types and NULL handling

### Phase 2: Grafana Panels
- [ ] Add Neighbors Table panel (ID: 42)
- [ ] Add Neighbor Graph panel (ID: 43)
- [ ] Add Publications Table panel (ID: 44)
- [ ] Add Publications Timeline panel (ID: 45)

### Phase 3: Styling & Thresholds
- [ ] Apply SNR color thresholds for neighbors
- [ ] Format timestamps and numeric values
- [ ] Configure legend and tooltips

### Phase 4: Testing
- [ ] Query performance validation
- [ ] Test with various node selections
- [ ] Verify data accuracy against network graph
- [ ] Test empty result handling

---

## Technical Notes

### Edge Table Structure
```
Edge:
  - id (PK)
  - source_node_id (FK) → Node
  - target_node_id (FK) → Node
  - last_hops (int) ← Filter: = 0 for direct neighbors
  - last_rx_rssi (int)
  - last_rx_snr (decimal)
  - last_seen (datetime)
  - last_packet_id (FK) → Packet
```

### NodeLink Table Structure
```
NodeLink:
  - id (PK)
  - node_a_id (FK) → Node (canonical ordering)
  - node_b_id (FK) → Node
  - node_a_to_node_b_packets (int)
  - node_b_to_node_a_packets (int)
  - is_bidirectional (bool)
  - last_activity (datetime)
  - channels (M2M) → Channel
```

### Key Differences
- **Edges**: Directional, 0-hop only, from NeighborInfo
- **NodeLinks**: Bidirectional with packet counts, includes all hops, aggregated communication

---

## Query Performance Considerations

1. **Neighbors Query**: Quick, filters on index (last_hops = 0)
2. **Publications Query**: Quick, indexed lookups on node_a_id and node_b_id
3. **Timeline Query**: Moderate complexity with time grouping, may benefit from materialized view

---

## Future Enhancements

1. **Multi-Hop Neighbors**: Show 1-hop and 2-hop neighbors with path visualization
2. **Neighbor History**: Track how neighbors change over time
3. **Publication Patterns**: Show most active publication addresses
4. **Channel Analysis**: Show which channels carry traffic to each neighbor
5. **Quality Metrics**: Calculate reliability scores based on successful/failed deliveries

---

## References

- Meshtastic NeighborInfo Protocol: Reports 0-hop neighbors
- Meshtastic Routing: Uses RouteDiscovery for multi-hop information
- Logical Links: Aggregates all packet communication between node pairs
- Edges: Directional graph representation from NeighborInfo data

