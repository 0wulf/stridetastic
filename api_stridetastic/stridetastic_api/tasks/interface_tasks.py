from __future__ import annotations

from typing import Any, Dict

from celery import shared_task

from ..models.interface_models import Interface
from ..services.service_manager import ServiceManager


def _resolve_wrapper(manager: ServiceManager, interface_id: int):
    wrapper = manager.get_runtime_interface(interface_id)
    if not wrapper:
        manager.reload_interface(interface_id)
        wrapper = manager.get_runtime_interface(interface_id)
    return wrapper


@shared_task(name="stridetastic_api.tasks.interface_tasks.start_interface_task")
def start_interface_task(interface_id: int) -> Dict[str, Any]:
    iface = Interface.objects.filter(id=interface_id).first()
    if not iface:
        return {"success": False, "status": 404, "message": "Interface not found"}
    if not iface.is_enabled:
        return {
            "success": False,
            "status": 400,
            "message": "Interface is not enabled",
        }

    manager = ServiceManager.get_instance()
    wrapper = _resolve_wrapper(manager, interface_id)
    if not wrapper:
        return {
            "success": False,
            "status": 400,
            "message": "Failed to load interface runtime",
        }
    if wrapper.db.status == Interface.Status.RUNNING:
        return {
            "success": False,
            "status": 400,
            "message": "Interface is already running",
        }

    wrapper.start()
    return {"success": True, "status": 200, "message": "Interface started"}


@shared_task(name="stridetastic_api.tasks.interface_tasks.stop_interface_task")
def stop_interface_task(interface_id: int) -> Dict[str, Any]:
    iface = Interface.objects.filter(id=interface_id).first()
    if not iface:
        return {"success": False, "status": 404, "message": "Interface not found"}
    if not iface.is_enabled:
        return {
            "success": False,
            "status": 400,
            "message": "Interface is not enabled",
        }

    manager = ServiceManager.get_instance()
    wrapper = _resolve_wrapper(manager, interface_id)
    if not wrapper:
        return {
            "success": False,
            "status": 400,
            "message": "Failed to load interface runtime",
        }
    if wrapper.db.status == Interface.Status.STOPPED:
        return {
            "success": False,
            "status": 400,
            "message": "Interface is already stopped",
        }

    wrapper.stop()
    return {"success": True, "status": 200, "message": "Interface stopped"}


@shared_task(name="stridetastic_api.tasks.interface_tasks.restart_interface_task")
def restart_interface_task(interface_id: int) -> Dict[str, Any]:
    iface = Interface.objects.filter(id=interface_id).first()
    if not iface:
        return {"success": False, "status": 404, "message": "Interface not found"}

    manager = ServiceManager.get_instance()
    try:
        manager.reload_interface(interface_id)
    except Exception as exc:  # pragma: no cover - defensive
        return {
            "success": False,
            "status": 400,
            "message": f"Failed to restart interface: {exc}",
        }

    return {"success": True, "status": 200, "message": "Interface restarted"}
