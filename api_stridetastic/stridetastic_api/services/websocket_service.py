from ..interfaces.websocket_interface import WebSocketInterface

class WebSocketService:
    def __init__(self, group_name=None):
        self.interface = WebSocketInterface(group_name=group_name)
        self.interface.connect()

    def send_packet(self, packet, decoded_data, portnum, from_node, to_node, packet_obj):
        # Serialize and send the packet to all connected clients
        data = {
            "packet_id": getattr(packet_obj, "packet_id", None),
            "portnum": portnum,
            "from_node": getattr(from_node, "node_id", None),
            "to_node": getattr(to_node, "node_id", None),
            # Add more fields as needed
        }
        self.interface.send_packet(data)
