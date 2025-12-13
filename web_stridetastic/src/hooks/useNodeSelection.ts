import { useState, useCallback } from 'react';
import { Node } from '@/types';
import { apiClient } from '@/lib/api';

interface NodeSelectionState {
  selectedNode: Node | null;
  selectedNodeId: string | null;
  secondSelectedNode: Node | null;
  secondSelectedNodeId: string | null;
}

export function useNodeSelection() {
  const [state, setState] = useState<NodeSelectionState>({
    selectedNode: null,
    selectedNodeId: null,
    secondSelectedNode: null,
    secondSelectedNodeId: null,
  });

  const handleNodeClick = useCallback(async (node: any) => {
    // Don't allow clicking on hidden nodes
    if (node.isHidden) return;
    
    try {
      let nodeData: Node;
      
      // Handle MQTT Client node specially since it doesn't exist in the API
      if (node.isMqttBroker) {
        nodeData = {
          id: -999,
          node_num: -999,
          node_id: 'mqtt_broker',
          mac_address: '00:00:00:00:00:00',
          short_name: 'MQTT Client',
          long_name: 'MQTT Message Broker',
          hw_model: 'Virtual Node',
          is_licensed: false,
          role: 'BROKER',
          is_low_entropy_public_key: false,
          has_private_key: false,
          private_key_fingerprint: null,
          is_virtual: true,
          is_unmessagable: true,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          interfaces: ['MQTT Interface'],
        };
      } else {
        const response = await apiClient.getNode(node.node_id);
        nodeData = response.data;
      }
      
      setState(prevState => {
        // Two-node selection logic
        if (!prevState.selectedNodeId) {
          // First node selection
          return {
            selectedNode: nodeData,
            selectedNodeId: node.id,
            secondSelectedNode: null,
            secondSelectedNodeId: null,
          };
        } else if (prevState.selectedNodeId === node.id) {
          // Clicking the same node - deselect all
          return {
            selectedNode: null,
            selectedNodeId: null,
            secondSelectedNode: null,
            secondSelectedNodeId: null,
          };
        } else if (!prevState.secondSelectedNodeId) {
          // Second node selection
          return {
            ...prevState,
            secondSelectedNode: nodeData,
            secondSelectedNodeId: node.id,
          };
        } else if (prevState.secondSelectedNodeId === node.id) {
          // Clicking the second node - remove it
          return {
            ...prevState,
            secondSelectedNode: null,
            secondSelectedNodeId: null,
          };
        } else {
          // Third node clicked - replace second node
          return {
            ...prevState,
            secondSelectedNode: nodeData,
            secondSelectedNodeId: node.id,
          };
        }
      });
    } catch (err) {
      console.error('Failed to get node details:', err);
    }
  }, []);

  const selectNodeById = useCallback(async (nodeId: string | null) => {
    if (!nodeId) {
      return false;
    }

    try {
      const response = await apiClient.getNode(nodeId);
      const nodeData: Node = response.data;
      setState({
        selectedNode: nodeData,
        selectedNodeId: nodeData.node_id ?? nodeId,
        secondSelectedNode: null,
        secondSelectedNodeId: null,
      });
      return true;
    } catch (err) {
      console.error('Failed to select node by id:', err);
      return false;
    }
  }, []);

  const clearSelection = useCallback(() => {
    setState({
      selectedNode: null,
      selectedNodeId: null,
      secondSelectedNode: null,
      secondSelectedNodeId: null,
    });
  }, []);

  const swapNodes = useCallback(() => {
    setState(prevState => ({
      selectedNode: prevState.secondSelectedNode,
      selectedNodeId: prevState.secondSelectedNodeId,
      secondSelectedNode: prevState.selectedNode,
      secondSelectedNodeId: prevState.selectedNodeId,
    }));
  }, []);

  return {
    ...state,
    handleNodeClick,
    clearSelection,
    swapNodes,
    selectNodeById,
  };
}
