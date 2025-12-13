# Node Neighbors and Publications - Quick Implementation Guide

## Quick Summary

**What**: Add two new dashboard sections to B4:
1. **Direct Neighbors** - Shows which nodes see this node directly (0-hop via NeighborInfo edges)
2. **Packet Publications** - Shows which addresses this node sends packets to (via Logical Links)

**Why**: 
- Understand network connectivity topology
- Identify reliable vs unreliable neighbors
- Track packet communication patterns
- Diagnose network issues

---

## Data Sources Explained

### Direct Neighbors (Edges with last_hops = 0)

These come from **NeighborInfo messages** that nodes broadcast:
- Each node advertises its immediate neighbors (0-hops away)
- Stored as directional **Edge** records with `last_hops = 0`
- Include signal quality (SNR, RSSI)
- Direction: Reporting Node → Neighbor Node

**Key Fields**:
- `source_node_id`: The node doing the reporting
- `target_node_id`: The neighbor being reported
- `last_hops`: Always 0 for neighbor info
- `last_rx_snr`: Signal quality (dB)
- `last_rx_rssi`: Received signal strength (dBm)

### Packet Publications (Logical Links)

These are **bidirectional communication records** that track actual packet exchange:
- Shows which addresses this node has communicated with
- Stored as **NodeLink** records (canonical ordering)
- Tracks packets in both directions
- Includes bidirectionality flag

**Key Fields**:
- `node_a_id` / `node_b_id`: Node pair (canonical order)
- `node_a_to_node_b_packets`: Packets flowing A→B
- `node_b_to_node_a_packets`: Packets flowing B→A
- `is_bidirectional`: True if traffic both ways
- `last_activity`: Last timestamp

---

## 4-Panel Implementation

### Panel 1: Neighbors Table (ID: 42)
**Shows**: List of direct neighbors with SNR/RSSI

**Query**:
```sql
SELECT 
    target_node.node_id::text as "Neighbor",
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

**Grafana Config**:
- Type: `table`
- Width: 12 units
- Height: 8 units
- Position: x: 0, y: 75

**Thresholds** (SNR column):
- Green: ≥ 10 dB
- Yellow: 5-9 dB
- Orange: 0-4 dB
- Red: < 0 dB

---

### Panel 2: Neighbors Directionality (ID: 43)
**Shows**: Neighbor connections with direction indicators

**Query** (Shows both incoming & outgoing):
```sql
WITH outgoing AS (
    SELECT 
        target_node.node_id::text as "Node",
        target_node.short_name as "Name",
        edge.last_rx_snr as "SNR",
        'Sees This Node' as "Direction"
    FROM stridetastic_api_graph_edge edge
    JOIN stridetastic_api_node target_node ON edge.target_node_id = target_node.id
    WHERE edge.source_node_id = (
        SELECT id FROM stridetastic_api_node WHERE node_id = '${node}'
    ) AND edge.last_hops = 0
),
incoming AS (
    SELECT 
        source_node.node_id::text as "Node",
        source_node.short_name as "Name",
        edge.last_rx_snr as "SNR",
        'Sees This Node' as "Direction"
    FROM stridetastic_api_graph_edge edge
    JOIN stridetastic_api_node source_node ON edge.source_node_id = source_node.id
    WHERE edge.target_node_id = (
        SELECT id FROM stridetastic_api_node WHERE node_id = '${node}'
    ) AND edge.last_hops = 0
)
SELECT * FROM outgoing
UNION ALL
SELECT * FROM incoming
ORDER BY "SNR" DESC NULLS LAST;
```

**Grafana Config**:
- Type: `table` or `stat` (repeating)
- Width: 12 units
- Height: 8 units
- Position: x: 12, y: 75

---

### Panel 3: Publications Table (ID: 44)
**Shows**: Addresses (nodes) this node has sent packets to

**Query**:
```sql
SELECT 
    CASE 
        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
        THEN node_b.node_id
        ELSE node_a.node_id
    END::text as "Remote Node",
    CASE 
        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
        THEN node_b.short_name
        ELSE node_a.short_name
    END as "Name",
    CASE 
        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
        THEN node_a_to_node_b_packets
        ELSE node_b_to_node_a_packets
    END::int as "Sent",
    CASE 
        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
        THEN node_b_to_node_a_packets
        ELSE node_a_to_node_b_packets
    END::int as "Received",
    CASE WHEN is_bidirectional THEN '✓' ELSE '✗' END as "Bidirectional",
    last_activity as "Last Activity"
FROM stridetastic_api_link_nodelink
WHERE node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
    OR node_b_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
ORDER BY last_activity DESC;
```

**Grafana Config**:
- Type: `table`
- Width: 12 units
- Height: 8 units
- Position: x: 0, y: 83

---

### Panel 4: Publication Activity Timeline (ID: 45)
**Shows**: Packet publication activity over time

**Query**:
```sql
SELECT 
    $__timeGroup(last_activity, '1h') as "time",
    CASE 
        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
        THEN 'Sent'
        ELSE 'Received'
    END as "Direction",
    SUM(CASE 
        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
        THEN node_a_to_node_b_packets
        ELSE node_b_to_node_a_packets
    END)::int as "Packets"
FROM stridetastic_api_link_nodelink
WHERE (node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')
    OR node_b_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}'))
    AND $__timeFilter(last_activity)
GROUP BY $__timeGroup(last_activity, '1h'), "Direction"
ORDER BY "time" DESC;
```

**Grafana Config**:
- Type: `timeseries`
- Width: 12 units
- Height: 8 units
- Position: x: 12, y: 83
- Legend: Display both Sent and Received
- Interpolation: Smooth

---

## Integration Steps

1. **Create New Section Row**
   - ID: 46
   - Type: `row`
   - Title: "Node Network"
   - Position: y: 75

2. **Add 4 Panels** (see above)
   - Update subsequent sections' y-positions if needed

3. **Update Network Activity Row**
   - Currently at y: 65
   - Shift down 16 units (8 rows of content)
   - New position: y: 81

4. **Update any other sections** below Network Activity
   - Shift down by 16 units

---

## Testing Checklist

- [ ] Neighbors table shows correct direct neighbors for selected node
- [ ] SNR/RSSI values match expected ranges
- [ ] Publications table shows bidirectional communication
- [ ] Timeline shows accurate packet counts
- [ ] Empty results handled gracefully (no errors)
- [ ] Directionality indicators correct (sender vs receiver)
- [ ] Color thresholds apply correctly to SNR column

---

## Common Issues & Fixes

### No neighbors showing
- Verify node has sent/received NeighborInfo messages
- Check if node is actually connected to network
- Look for `last_hops = 0` in Edge table

### Publications showing 0 packets
- Verify NodeLink records exist for this node
- Check if communication happened during selected time range
- Ensure logical links were properly aggregated

### Directionality unclear
- Label outgoing vs incoming explicitly in queries
- Use arrow symbols (→/←) if needed
- Consider separate panels for clarity

---

## Performance Notes

All queries are optimized:
- Indexed lookups on node_id
- Filters on last_hops and node pairs
- No expensive joins beyond 3 tables
- Suitable for real-time dashboard updates

---

## Future Extensions

1. Add **Multi-Hop View**: Show 1-hop and 2-hop neighbors
2. Add **Reliability Score**: Calc based on SNR consistency
3. Add **Channel Breakdown**: Show which channels carry traffic
4. Add **Time-Based Analysis**: Track neighbor changes over days

