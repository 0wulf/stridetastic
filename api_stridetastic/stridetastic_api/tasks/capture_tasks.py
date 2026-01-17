from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from celery import shared_task

logger = logging.getLogger(__name__)


def _get_capture_service():
    from ..services.service_manager import (  # Local import to avoid circular deps at module load
        ServiceManager,
    )

    manager = ServiceManager.get_instance()
    service = manager.get_capture_service()
    if service is None:
        service = manager.initialize_capture_service()
    return service


@shared_task(name="stridetastic_api.tasks.capture_tasks.activate_capture_session")
def activate_capture_session(session_id: str) -> bool:
    try:
        service = _get_capture_service()
        return service.activate_existing_session(UUID(session_id))
    except Exception:  # pragma: no cover - defensive logging
        logger.exception("Failed to activate capture session %s", session_id)
        return False


@shared_task(name="stridetastic_api.tasks.capture_tasks.stop_capture_session")
def stop_capture_session(session_id: str) -> Optional[dict]:
    service = _get_capture_service()
    session = service.stop_capture(UUID(session_id))
    return service.to_dict(session) if session else None


@shared_task(name="stridetastic_api.tasks.capture_tasks.cancel_capture_session")
def cancel_capture_session(
    session_id: str, reason: Optional[str] = None
) -> Optional[dict]:
    service = _get_capture_service()
    session = service.cancel_capture(UUID(session_id), reason=reason)
    return service.to_dict(session) if session else None


@shared_task(name="stridetastic_api.tasks.capture_tasks.delete_capture_session")
def delete_capture_session(session_id: str) -> bool:
    service = _get_capture_service()
    return service.delete_capture(UUID(session_id))


@shared_task(name="stridetastic_api.tasks.capture_tasks.delete_all_capture_sessions")
def delete_all_capture_sessions() -> int:
    service = _get_capture_service()
    return service.delete_all_captures()


@shared_task(name="stridetastic_api.tasks.capture_tasks.stop_all_capture_sessions")
def stop_all_capture_sessions() -> None:
    service = _get_capture_service()
    service.stop_all()
