export interface Interface {
  id: number;
  name: string;
  interface_type: string; // 'MQTT' | 'SERIAL' | 'TCP'
  status?: string; // 'INIT' | 'RUNNING' | 'ERROR' | 'STOPPED' | 'CONNECTING'
  is_enabled?: boolean;
  mqtt_topic?: string;
  mqtt_base_topic?: string;
  last_connected?: string;
  last_error?: string;
  serial_node_id?: number;
}
