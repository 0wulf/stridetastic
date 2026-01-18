from typing import List, Optional

from ninja import Schema
from ninja_extra import api_controller, permissions, route
from ninja_jwt.authentication import JWTAuth

from ..models.interface_models import Interface
from ..schemas.common_schemas import MessageSchema
from ..tasks.interface_tasks import (
    restart_interface_task,
    start_interface_task,
    stop_interface_task,
)

auth = JWTAuth()


class InterfaceSchema(Schema):
    id: int
    display_name: str
    name: str
    status: str
    is_enabled: bool
    mqtt_topic: Optional[str] = None
    mqtt_base_topic: Optional[str] = None
    serial_node_id: Optional[int] = None
    tcp_hostname: Optional[str] = None
    tcp_port: Optional[int] = None


@api_controller(
    "/interfaces", tags=["Interfaces"], permissions=[permissions.IsAuthenticated]
)
class InterfaceController:
    @route.post(
        "/{interface_id}/restart",
        response={200: MessageSchema, 404: MessageSchema, 400: MessageSchema},
        auth=auth,
    )
    def restart_interface(self, request, interface_id: int):
        iface = Interface.objects.filter(id=interface_id).first()
        if not iface:
            return 404, MessageSchema(message="Interface not found")
        try:
            task = restart_interface_task.delay(interface_id=interface_id)
            result = task.get(timeout=10)
        except Exception as e:
            return 400, MessageSchema(message=f"Failed to restart interface: {str(e)}")
        status = int(result.get("status", 200 if result.get("success") else 400))
        return status, MessageSchema(
            message=result.get("message", "Interface restarted")
        )

    @route.post(
        "/{interface_id}/start",
        response={200: MessageSchema, 404: MessageSchema, 400: MessageSchema},
        auth=auth,
    )
    def start_interface(self, request, interface_id: int):
        iface = Interface.objects.filter(id=interface_id).first()
        if not iface:
            return 404, MessageSchema(message="Interface not found")
        try:
            task = start_interface_task.delay(interface_id=interface_id)
            result = task.get(timeout=10)
        except Exception as e:
            return 400, MessageSchema(message=f"Failed to start interface: {str(e)}")
        status = int(result.get("status", 200 if result.get("success") else 400))
        return status, MessageSchema(message=result.get("message", "Interface started"))

    @route.post(
        "/{interface_id}/stop",
        response={200: MessageSchema, 404: MessageSchema, 400: MessageSchema},
        auth=auth,
    )
    def stop_interface(self, request, interface_id: int):
        iface = Interface.objects.filter(id=interface_id).first()
        if not iface:
            return 404, MessageSchema(message="Interface not found")
        try:
            task = stop_interface_task.delay(interface_id=interface_id)
            result = task.get(timeout=10)
        except Exception as e:
            return 400, MessageSchema(message=f"Failed to stop interface: {str(e)}")
        status = int(result.get("status", 200 if result.get("success") else 400))
        return status, MessageSchema(message=result.get("message", "Interface stopped"))

    def __init__(self):
        pass

    @route.get("/", response=List[InterfaceSchema], auth=auth)
    def list_interfaces(self, request):
        qs = Interface.objects.all()
        type_filter = request.GET.get("type")
        if type_filter:
            qs = qs.filter(name=type_filter.upper())
        return [
            InterfaceSchema(
                id=i.id,
                display_name=i.display_name,
                name=i.name,
                status=i.status,
                is_enabled=i.is_enabled,
                mqtt_topic=i.mqtt_topic,
                mqtt_base_topic=i.mqtt_base_topic,
                serial_node_id=i.serial_node.id if i.serial_node else None,
                tcp_hostname=i.tcp_hostname,
                tcp_port=i.tcp_port,
            )
            for i in qs
        ]

    @route.get(
        "/{interface_id}",
        response={200: InterfaceSchema, 404: MessageSchema},
        auth=auth,
    )
    def get_interface(self, request, interface_id: int):
        iface = Interface.objects.filter(id=interface_id).first()
        if not iface:
            return 404, MessageSchema(message="Interface not found")
        return InterfaceSchema(
            id=iface.id,
            display_name=iface.display_name,
            name=iface.name,
            status=iface.status,
            is_enabled=iface.is_enabled,
            mqtt_topic=iface.mqtt_topic,
            mqtt_base_topic=iface.mqtt_base_topic,
            serial_node_id=iface.serial_node.id if iface.serial_node else None,
            tcp_hostname=iface.tcp_hostname,
            tcp_port=iface.tcp_port,
        )
