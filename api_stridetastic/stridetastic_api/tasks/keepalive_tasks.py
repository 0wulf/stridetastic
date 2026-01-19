from __future__ import annotations

import logging

from celery import shared_task
from django.utils import timezone

from ..models import KeepaliveConfig
from ..services.keepalive_service import KeepaliveService

logger = logging.getLogger(__name__)


@shared_task(name="stridetastic_api.tasks.keepalive_tasks.run_keepalive_check")
def run_keepalive_check() -> int:
    """Run the keepalive offline transition check."""
    try:
        service = KeepaliveService()
        return service.run_check()
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception("Keepalive check failed: %s", exc)
        try:
            config = KeepaliveConfig.get_solo()
            config.last_run_at = timezone.now()
            config.last_error_message = str(exc)
            config.save(update_fields=["last_run_at", "last_error_message"])
        except Exception:
            pass
        return 0
