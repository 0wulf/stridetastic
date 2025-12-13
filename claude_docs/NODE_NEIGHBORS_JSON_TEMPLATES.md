# Node Network Section - Grafana JSON Panel Templates

This document contains ready-to-implement Grafana panel JSON configurations for the Node Network section.

---

## Section Header (Row) - ID: 46

```json
{
  "collapsed": false,
  "gridPos": {
    "h": 1,
    "w": 24,
    "x": 0,
    "y": 75
  },
  "id": 46,
  "panels": [],
  "title": "Node Network",
  "type": "row"
}
```

---

## Panel 42: Neighbors Table

```json
{
  "datasource": {
    "type": "postgres",
    "uid": "timescaledb"
  },
  "fieldConfig": {
    "defaults": {
      "color": {
        "mode": "thresholds"
      },
      "mappings": [],
      "thresholds": {
        "mode": "absolute",
        "steps": [
          {
            "color": "blue",
            "value": null
          }
        ]
      },
      "unit": "short"
    },
    "overrides": [
      {
        "matcher": {
          "id": "byName",
          "options": "SNR (dB)"
        },
        "properties": [
          {
            "id": "thresholds",
            "value": {
              "mode": "absolute",
              "steps": [
                {
                  "color": "red",
                  "value": null
                },
                {
                  "color": "orange",
                  "value": 0
                },
                {
                  "color": "yellow",
                  "value": 5
                },
                {
                  "color": "green",
                  "value": 10
                }
              ]
            }
          },
          {
            "id": "custom.displayMode",
            "value": "color-background"
          }
        ]
      },
      {
        "matcher": {
          "id": "byName",
          "options": "Last Seen"
        },
        "properties": [
          {
            "id": "custom.displayMode",
            "value": "date"
          }
        ]
      }
    ]
  },
  "gridPos": {
    "h": 8,
    "w": 12,
    "x": 0,
    "y": 76
  },
  "id": 42,
  "options": {
    "footer": {
      "countRows": "all",
      "enablePagination": true,
      "fields": "",
      "mode": "auto",
      "show": true
    },
    "frameIndex": 0,
    "showHeader": true,
    "sortBy": [
      {
        "displayName": "SNR (dB)",
        "desc": true
      }
    ]
  },
  "pluginVersion": "12.2.1",
  "targets": [
    {
      "format": "table",
      "rawSql": "SELECT \n    target_node.node_id::text as \"Neighbor\",\n    target_node.short_name as \"Name\",\n    COALESCE(ROUND(edge.last_rx_snr::numeric, 2), 0) as \"SNR (dB)\",\n    COALESCE(edge.last_rx_rssi, 0) as \"RSSI (dBm)\",\n    edge.last_seen as \"Last Seen\"\nFROM stridetastic_api_graph_edge edge\nJOIN stridetastic_api_node target_node ON edge.target_node_id = target_node.id\nWHERE edge.source_node_id = (\n    SELECT id FROM stridetastic_api_node WHERE node_id = '${node}'\n) AND edge.last_hops = 0\nORDER BY edge.last_rx_snr DESC NULLS LAST;",
      "refId": "A"
    }
  ],
  "title": "Direct Neighbors (0-Hop)",
  "type": "table"
}
```

---

## Panel 43: Neighbor Connectivity Direction

```json
{
  "datasource": {
    "type": "postgres",
    "uid": "timescaledb"
  },
  "fieldConfig": {
    "defaults": {
      "color": {
        "mode": "thresholds"
      },
      "mappings": [],
      "thresholds": {
        "mode": "absolute",
        "steps": [
          {
            "color": "blue",
            "value": null
          }
        ]
      },
      "unit": "short"
    },
    "overrides": [
      {
        "matcher": {
          "id": "byName",
          "options": "SNR"
        },
        "properties": [
          {
            "id": "thresholds",
            "value": {
              "mode": "absolute",
              "steps": [
                {
                  "color": "red",
                  "value": null
                },
                {
                  "color": "orange",
                  "value": 0
                },
                {
                  "color": "yellow",
                  "value": 5
                },
                {
                  "color": "green",
                  "value": 10
                }
              ]
            }
          },
          {
            "id": "custom.displayMode",
            "value": "color-background"
          }
        ]
      },
      {
        "matcher": {
          "id": "byName",
          "options": "Direction"
        },
        "properties": [
          {
            "id": "custom.displayMode",
            "value": "color-background"
          }
        ]
      }
    ]
  },
  "gridPos": {
    "h": 8,
    "w": 12,
    "x": 12,
    "y": 76
  },
  "id": 43,
  "options": {
    "footer": {
      "countRows": "all",
      "enablePagination": true,
      "fields": "",
      "mode": "auto",
      "show": true
    },
    "frameIndex": 0,
    "showHeader": true,
    "sortBy": [
      {
        "displayName": "SNR",
        "desc": true
      }
    ]
  },
  "pluginVersion": "12.2.1",
  "targets": [
    {
      "format": "table",
      "rawSql": "WITH outgoing AS (\n    SELECT \n        target_node.node_id::text as \"Node\",\n        target_node.short_name as \"Name\",\n        COALESCE(ROUND(edge.last_rx_snr::numeric, 2), 0) as \"SNR\",\n        '→ Sees Us' as \"Direction\"\n    FROM stridetastic_api_graph_edge edge\n    JOIN stridetastic_api_node target_node ON edge.target_node_id = target_node.id\n    WHERE edge.source_node_id = (\n        SELECT id FROM stridetastic_api_node WHERE node_id = '${node}'\n    ) AND edge.last_hops = 0\n),\nincoming AS (\n    SELECT \n        source_node.node_id::text as \"Node\",\n        source_node.short_name as \"Name\",\n        COALESCE(ROUND(edge.last_rx_snr::numeric, 2), 0) as \"SNR\",\n        '← We See' as \"Direction\"\n    FROM stridetastic_api_graph_edge edge\n    JOIN stridetastic_api_node source_node ON edge.source_node_id = source_node.id\n    WHERE edge.target_node_id = (\n        SELECT id FROM stridetastic_api_node WHERE node_id = '${node}'\n    ) AND edge.last_hops = 0\n)\nSELECT * FROM outgoing\nUNION ALL\nSELECT * FROM incoming\nORDER BY \"SNR\" DESC NULLS LAST;",
      "refId": "A"
    }
  ],
  "title": "Neighbor Connectivity Direction",
  "type": "table"
}
```

---

## Panel 44: Packet Publications Table

```json
{
  "datasource": {
    "type": "postgres",
    "uid": "timescaledb"
  },
  "fieldConfig": {
    "defaults": {
      "color": {
        "mode": "thresholds"
      },
      "mappings": [],
      "thresholds": {
        "mode": "absolute",
        "steps": [
          {
            "color": "blue",
            "value": null
          }
        ]
      },
      "unit": "short"
    },
    "overrides": [
      {
        "matcher": {
          "id": "byName",
          "options": "Bidirectional"
        },
        "properties": [
          {
            "id": "mappings",
            "value": [
              {
                "type": "value",
                "options": {
                  "✓": {
                    "color": "green",
                    "index": 0
                  },
                  "✗": {
                    "color": "red",
                    "index": 1
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  },
  "gridPos": {
    "h": 8,
    "w": 12,
    "x": 0,
    "y": 84
  },
  "id": 44,
  "options": {
    "footer": {
      "countRows": "all",
      "enablePagination": true,
      "fields": "",
      "mode": "auto",
      "show": true
    },
    "frameIndex": 0,
    "showHeader": true,
    "sortBy": [
      {
        "displayName": "Last Activity",
        "desc": true
      }
    ]
  },
  "pluginVersion": "12.2.1",
  "targets": [
    {
      "format": "table",
      "rawSql": "SELECT \n    CASE \n        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')\n        THEN node_b.node_id\n        ELSE node_a.node_id\n    END::text as \"Remote Node\",\n    CASE \n        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')\n        THEN node_b.short_name\n        ELSE node_a.short_name\n    END as \"Name\",\n    CASE \n        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')\n        THEN node_a_to_node_b_packets\n        ELSE node_b_to_node_a_packets\n    END::int as \"Sent\",\n    CASE \n        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')\n        THEN node_b_to_node_a_packets\n        ELSE node_a_to_node_b_packets\n    END::int as \"Received\",\n    CASE WHEN is_bidirectional THEN '✓' ELSE '✗' END as \"Bidirectional\",\n    last_activity as \"Last Activity\"\nFROM stridetastic_api_link_nodelink\nWHERE node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')\n    OR node_b_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')\nORDER BY last_activity DESC;",
      "refId": "A"
    }
  ],
  "title": "Packet Publications",
  "type": "table"
}
```

---

## Panel 45: Publication Activity Timeline

```json
{
  "datasource": {
    "type": "postgres",
    "uid": "timescaledb"
  },
  "fieldConfig": {
    "defaults": {
      "color": {
        "mode": "palette-classic"
      },
      "custom": {
        "axisBorderShow": false,
        "axisCenteredZero": false,
        "axisColorMode": "text",
        "axisLabel": "Packets",
        "axisPlacement": "auto",
        "barAlignment": 0,
        "barWidthFactor": 0.6,
        "drawStyle": "line",
        "fillOpacity": 10,
        "gradientMode": "none",
        "hideFrom": {
          "legend": false,
          "tooltip": false,
          "viz": false
        },
        "insertNulls": false,
        "lineInterpolation": "smooth",
        "lineWidth": 1,
        "pointSize": 5,
        "scaleDistribution": {
          "type": "linear"
        },
        "showPoints": "auto",
        "showValues": false,
        "spanNulls": true,
        "stacking": {
          "group": "A",
          "mode": "none"
        },
        "thresholdsStyle": {
          "mode": "off"
        }
      },
      "mappings": [],
      "thresholds": {
        "mode": "absolute",
        "steps": [
          {
            "color": "green",
            "value": null
          }
        ]
      },
      "unit": "short"
    },
    "overrides": []
  },
  "gridPos": {
    "h": 8,
    "w": 12,
    "x": 12,
    "y": 84
  },
  "id": 45,
  "options": {
    "legend": {
      "calcs": [
        "mean",
        "max"
      ],
      "displayMode": "table",
      "placement": "right",
      "showLegend": true
    },
    "tooltip": {
      "hideZeros": false,
      "mode": "multi",
      "sort": "none"
    }
  },
  "pluginVersion": "12.2.1",
  "targets": [
    {
      "format": "time_series",
      "rawSql": "SELECT \n    $__timeGroup(last_activity, '1h') as \"time\",\n    CASE \n        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')\n        THEN 'Sent'\n        ELSE 'Received'\n    END as \"Direction\",\n    SUM(CASE \n        WHEN node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')\n        THEN node_a_to_node_b_packets\n        ELSE node_b_to_node_a_packets\n    END)::int as \"Packets\"\nFROM stridetastic_api_link_nodelink\nWHERE (node_a_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}')\n    OR node_b_id = (SELECT id FROM stridetastic_api_node WHERE node_id = '${node}'))\n    AND $__timeFilter(last_activity)\nGROUP BY $__timeGroup(last_activity, '1h'), \"Direction\"\nORDER BY \"time\" DESC;",
      "refId": "A"
    }
  ],
  "title": "Publication Activity Timeline",
  "type": "timeseries"
}
```

---

## Implementation Notes

1. **Panel IDs**: Use 42, 43, 44, 45 (or adjust based on current max ID)
2. **Grid Positions**: 
   - Row 46 at y: 75
   - Panels 42-43 at y: 76
   - Panels 44-45 at y: 84
3. **Datasource**: All use "timescaledb" PostgreSQL datasource
4. **Node Variable**: Uses `${node}` variable (should already exist in dashboard)
5. **Time Range**: Panel 45 uses `$__timeFilter()` for dynamic time range selection

---

## Next Steps

1. Export this JSON
2. Add to B4-node_telemetry.json dashboard JSON
3. Update existing panels that were below y: 75 (shift down 16 units)
4. Test queries with different node selections
5. Adjust colors/thresholds as needed

