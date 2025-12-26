from __future__ import annotations

import logging
from typing import Optional, Dict, Any

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from ..models import PublisherPeriodicJob
logger = logging.getLogger(__name__)

MAX_JOBS_PER_TICK = 100


@shared_task(name="stridetastic_api.tasks.publisher_tasks.process_periodic_publish_jobs")
def process_periodic_publish_jobs() -> int:
	"""Scan for due periodic publishing jobs and queue execution tasks."""
	now = timezone.now()
	queued_job_ids: list[int] = []

	with transaction.atomic():
		due_jobs = list(
			PublisherPeriodicJob.objects.select_for_update(skip_locked=True)
			.filter(enabled=True, next_run_at__lte=now)
			.order_by("next_run_at")[:MAX_JOBS_PER_TICK]
		)

		for job in due_jobs:
			next_run = now + job.get_period_timedelta()
			PublisherPeriodicJob.objects.filter(pk=job.pk).update(next_run_at=next_run)
			queued_job_ids.append(job.pk)

	for job_id in queued_job_ids:
		execute_periodic_publish_job.delay(job_id)

	if queued_job_ids:
		logger.info("Queued %d periodic publishing job(s)", len(queued_job_ids))

	return len(queued_job_ids)


@shared_task(name="stridetastic_api.tasks.publisher_tasks.execute_periodic_publish_job")
def execute_periodic_publish_job(job_id: int) -> bool:
	"""Execute a single periodic publishing job."""
	job = (
		PublisherPeriodicJob.objects.select_related("interface")
		.filter(pk=job_id)
		.first()
	)
	if not job:
		logger.warning("Periodic publish job %s no longer exists", job_id)
		return False

	if not job.enabled:
		job.mark_skipped("Job disabled")
		logger.debug("Skipping periodic publish job %s because it is disabled", job_id)
		return False

	from ..services.service_manager import ServiceManager  # Local import to avoid circular dependency at load

	service_manager = ServiceManager.get_instance()
	publisher_service = service_manager.initialize_publisher_service()

	publisher = None
	base_topic = None

	if job.interface_id:
		publisher, base_topic, err = service_manager.resolve_publish_context(job.interface_id)
		if err:
			job.mark_failure(err)
			logger.warning(
				"Periodic publish job %s failed to resolve publisher for interface %s: %s",
				job_id,
				job.interface_id,
				err,
			)
			return False

	try:
		success = publisher_service.execute_periodic_job(
			job,
			publisher=publisher,
			base_topic=base_topic,
		)
	except Exception as exc:  # pragma: no cover - defensive logging
		job.mark_failure(str(exc))
		logger.exception("Periodic publish job %s encountered an error", job_id)
		return False

	if success:
		job.mark_success()
		logger.info("Periodic publish job %s executed successfully", job_id)
		return True

	job.mark_failure("Publisher publish returned False")
	logger.warning("Periodic publish job %s did not publish successfully", job_id)
	return False


# ===== One-Shot Publishing Tasks =====
# These tasks run in Celery worker where MQTT interfaces are available
# They accept publishing parameters and return success/failure status

@shared_task(name="stridetastic_api.tasks.publisher_tasks.publish_text_message_task")
def publish_text_message_task(
	from_node: str,
	to_node: str,
	message_text: str,
	channel_name: str,
	channel_aes_key: str,
	hop_limit: int,
	hop_start: int,
	want_ack: bool,
	pki_encrypted: bool,
	gateway_node: Optional[str],
	interface_id: Optional[int],
) -> Dict[str, Any]:
	"""Execute a one-shot text message publishing task in Celery worker."""
	from ..services.service_manager import ServiceManager

	try:
		service_manager = ServiceManager.get_instance()
		publisher_service = service_manager.initialize_publisher_service()

		publisher = None
		base_topic = None

		if interface_id is not None:
			publisher, base_topic, err = service_manager.resolve_publish_context(interface_id)
			if err:
				logger.error(f"Failed to resolve publisher for interface {interface_id}: {err}")
				return {"success": False, "error": err}

		success = publisher_service.publish_text_message(
			from_node=from_node,
			to_node=to_node,
			message_text=message_text,
			channel_name=channel_name,
			channel_aes_key=channel_aes_key,
			hop_limit=hop_limit,
			hop_start=hop_start,
			want_ack=want_ack,
			pki_encrypted=pki_encrypted,
			gateway_node=gateway_node,
			publisher=publisher,
			base_topic=base_topic,
		)

		if success:
			return {"success": True, "error": None}
		else:
			return {"success": False, "error": "Publisher publish returned False"}
	except Exception as exc:
		logger.exception("Text message task failed")
		return {"success": False, "error": str(exc)}


@shared_task(name="stridetastic_api.tasks.publisher_tasks.publish_nodeinfo_task")
def publish_nodeinfo_task(
	from_node: str,
	to_node: str,
	short_name: str,
	long_name: str,
	hw_model: int,
	public_key: str,
	channel_name: str,
	channel_aes_key: str,
	hop_limit: int,
	hop_start: int,
	want_ack: bool,
	gateway_node: Optional[str],
	interface_id: Optional[int],
) -> Dict[str, Any]:
	"""Execute a one-shot nodeinfo publishing task in Celery worker."""
	from ..services.service_manager import ServiceManager

	try:
		service_manager = ServiceManager.get_instance()
		publisher_service = service_manager.initialize_publisher_service()

		publisher = None
		base_topic = None

		if interface_id is not None:
			publisher, base_topic, err = service_manager.resolve_publish_context(interface_id)
			if err:
				logger.error(f"[Publish-Task] Failed to resolve publisher for interface {interface_id}: {err}")
				return {"success": False, "error": err}

		success = publisher_service.publish_nodeinfo(
			from_node=from_node,
			to_node=to_node,
			short_name=short_name,
			long_name=long_name,
			hw_model=hw_model,
			public_key=public_key,
			channel_name=channel_name,
			channel_aes_key=channel_aes_key,
			hop_limit=hop_limit,
			hop_start=hop_start,
			want_ack=want_ack,
			gateway_node=gateway_node,
			publisher=publisher,
			base_topic=base_topic,
		)

		if success:
			return {"success": True, "error": None}
		else:
			return {"success": False, "error": "Publisher publish returned False"}
	except Exception as exc:
		logger.exception("Nodeinfo task failed")
		return {"success": False, "error": str(exc)}


@shared_task(name="stridetastic_api.tasks.publisher_tasks.publish_position_task")
def publish_position_task(
	from_node: str,
	to_node: str,
	lat: float,
	lon: float,
	alt: float,
	channel_name: str,
	channel_aes_key: str,
	hop_limit: int,
	hop_start: int,
	want_ack: bool,
	want_response: bool,
	pki_encrypted: bool,
	gateway_node: Optional[str],
	interface_id: Optional[int],
) -> Dict[str, Any]:
	"""Execute a one-shot position publishing task in Celery worker."""
	from ..services.service_manager import ServiceManager

	try:
		service_manager = ServiceManager.get_instance()
		publisher_service = service_manager.initialize_publisher_service()

		publisher = None
		base_topic = None

		if interface_id is not None:
			publisher, base_topic, err = service_manager.resolve_publish_context(interface_id)
			if err:
				logger.error(f"[Publish-Task] Failed to resolve publisher for interface {interface_id}: {err}")
				return {"success": False, "error": err}

		success = publisher_service.publish_position(
			from_node=from_node,
			to_node=to_node,
			lat=lat,
			lon=lon,
			alt=alt,
			channel_name=channel_name,
			channel_aes_key=channel_aes_key,
			hop_limit=hop_limit,
			hop_start=hop_start,
			want_ack=want_ack,
			want_response=want_response,
			pki_encrypted=pki_encrypted,
			gateway_node=gateway_node,
			publisher=publisher,
			base_topic=base_topic,
		)

		if success:
			return {"success": True, "error": None}
		else:
			return {"success": False, "error": "Publisher publish returned False"}
	except Exception as exc:
		logger.exception("Position task failed")
		return {"success": False, "error": str(exc)}


@shared_task(name="stridetastic_api.tasks.publisher_tasks.publish_traceroute_task")
def publish_traceroute_task(
	from_node: str,
	to_node: str,
	channel_name: str,
	channel_aes_key: str,
	hop_limit: int,
	hop_start: int,
	want_ack: bool,
	gateway_node: Optional[str],
	interface_id: Optional[int],
) -> Dict[str, Any]:
	"""Execute a one-shot traceroute publishing task in Celery worker."""
	from ..services.service_manager import ServiceManager

	try:
		service_manager = ServiceManager.get_instance()
		publisher_service = service_manager.initialize_publisher_service()

		publisher = None
		base_topic = None

		if interface_id is not None:
			publisher, base_topic, err = service_manager.resolve_publish_context(interface_id)
			if err:
				logger.error(f"[Publish-Task] Failed to resolve publisher for interface {interface_id}: {err}")
				return {"success": False, "error": err}

		success, _ = publisher_service.publish_traceroute(
			from_node=from_node,
			to_node=to_node,
			channel_name=channel_name,
			channel_aes_key=channel_aes_key,
			hop_limit=hop_limit,
			hop_start=hop_start,
			want_ack=want_ack,
			gateway_node=gateway_node,
			publisher=publisher,
			base_topic=base_topic,
			record_pending=True,
		)

		if success:
			return {"success": True, "error": None}
		else:
			return {"success": False, "error": "Publisher publish returned False"}
	except Exception as exc:
		logger.exception("Traceroute task failed")
		return {"success": False, "error": str(exc)}


@shared_task(name="stridetastic_api.tasks.publisher_tasks.publish_reachability_probe_task")
def publish_reachability_probe_task(
	from_node: str,
	to_node: str,
	channel_name: str,
	channel_aes_key: str,
	hop_limit: int,
	hop_start: int,
	gateway_node: Optional[str],
	interface_id: Optional[int],
) -> Dict[str, Any]:
	"""Execute a one-shot reachability probe publishing task in Celery worker."""
	from ..services.service_manager import ServiceManager

	try:
		service_manager = ServiceManager.get_instance()
		publisher_service = service_manager.initialize_publisher_service()

		publisher = None
		base_topic = None

		if interface_id is not None:
			publisher, base_topic, err = service_manager.resolve_publish_context(interface_id)
			if err:
				logger.error(f"[Publish-Task] Failed to resolve publisher for interface {interface_id}: {err}")
				return {"success": False, "error": err}

		success = publisher_service.publish_reachability_probe(
			from_node=from_node,
			to_node=to_node,
			channel_name=channel_name,
			channel_aes_key=channel_aes_key,
			hop_limit=hop_limit,
			hop_start=hop_start,
			gateway_node=gateway_node,
			publisher=publisher,
			base_topic=base_topic,
		)

		if success:
			return {"success": True, "error": None}
		else:
			return {"success": False, "error": "Publisher publish returned False"}
	except Exception as exc:
		logger.exception("Reachability probe task failed")
		return {"success": False, "error": str(exc)}


@shared_task(name="stridetastic_api.tasks.publisher_tasks.publish_telemetry_task")
def publish_telemetry_task(
	from_node: str,
	to_node: str,
	channel_name: str,
	channel_aes_key: str,
	hop_limit: int,
	hop_start: int,
	want_ack: bool,
	want_response: bool,
	telemetry_type: str,
	telemetry_options: Dict[str, Any],
	pki_encrypted: bool,
	gateway_node: Optional[str],
	interface_id: Optional[int],
) -> Dict[str, Any]:
	"""Execute a one-shot telemetry publishing task in Celery worker."""
	from ..services.service_manager import ServiceManager

	try:
		service_manager = ServiceManager.get_instance()
		publisher_service = service_manager.initialize_publisher_service()

		publisher = None
		base_topic = None

		if interface_id is not None:
			publisher, base_topic, err = service_manager.resolve_publish_context(interface_id)
			if err:
				logger.error(f"[Publish-Task] Failed to resolve publisher for interface {interface_id}: {err}")
				return {"success": False, "error": err}

		success = publisher_service.publish_telemetry(
			from_node=from_node,
			to_node=to_node,
			telemetry_type=telemetry_type,
			telemetry_options=telemetry_options,
			channel_name=channel_name,
			channel_aes_key=channel_aes_key,
			hop_limit=hop_limit,
			hop_start=hop_start,
			want_ack=want_ack,
			want_response=want_response,
			pki_encrypted=pki_encrypted,
			gateway_node=gateway_node,
			publisher=publisher,
			base_topic=base_topic,
		)

		if success:
			return {"success": True, "error": None}
		else:
			return {"success": False, "error": "Publisher publish returned False"}
	except Exception as exc:
		logger.exception("Telemetry task failed")
		return {"success": False, "error": str(exc)}
