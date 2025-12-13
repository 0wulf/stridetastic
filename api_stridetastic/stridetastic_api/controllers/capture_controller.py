import mimetypes
from typing import List
from uuid import UUID

from django.http import FileResponse, Http404
from ninja import Schema
from ninja_extra import api_controller, permissions, route
from ninja_jwt.authentication import JWTAuth

from ..schemas.common_schemas import MessageSchema
from ..schemas.capture_schemas import CaptureSessionSchema, CaptureStartSchema
from ..services.service_manager import ServiceManager


auth = JWTAuth()


class CaptureStartResponse(Schema):
	session: CaptureSessionSchema


class CaptureBulkDeleteResponse(Schema):
	deleted: int


@api_controller("/captures", tags=["Captures"], permissions=[permissions.IsAuthenticated])
class CaptureController:
	def __init__(self):
		self.service_manager = ServiceManager.get_instance()

	def _get_service(self):
		service = self.service_manager.get_capture_service()
		if service is None:
			service = self.service_manager.initialize_capture_service()
		return service

	@route.get("/sessions", response=List[CaptureSessionSchema], auth=auth)
	def list_sessions(self, request):
		service = self._get_service()
		sessions = service.list_sessions()
		return [service.to_dict(session) for session in sessions]

	@route.post("/start", response={201: CaptureStartResponse, 400: MessageSchema}, auth=auth)
	def start_capture(self, request, payload: CaptureStartSchema):
		service = self._get_service()
		try:
			session = service.start_capture(
				name=payload.name,
				interface_id=payload.interface_id,
				started_by=request.user,
				source_type=payload.source_type,
			)
		except ValueError as exc:
			return 400, MessageSchema(message=str(exc))
		return 201, CaptureStartResponse(session=service.to_dict(session))

	@route.post("/{session_id}/stop", response={200: CaptureSessionSchema, 404: MessageSchema}, auth=auth)
	def stop_capture(self, request, session_id: UUID):
		service = self._get_service()
		session = service.get_session(session_id)
		if not session:
			return 404, MessageSchema(message="Capture session not found")
		session = service.stop_capture(session_id)
		return service.to_dict(session)

	@route.post("/{session_id}/cancel", response={200: MessageSchema, 404: MessageSchema}, auth=auth)
	def cancel_capture(self, request, session_id: UUID):
		service = self._get_service()
		session = service.get_session(session_id)
		if not session:
			return 404, MessageSchema(message="Capture session not found")
		service.cancel_capture(session_id, reason="Cancelled via API")
		return 200, MessageSchema(message="Capture session cancelled")

	@route.delete("/{session_id}", response={200: MessageSchema, 404: MessageSchema}, auth=auth)
	def delete_capture(self, request, session_id: UUID):
		service = self._get_service()
		deleted = service.delete_capture(session_id)
		if not deleted:
			return 404, MessageSchema(message="Capture session not found")
		return 200, MessageSchema(message="Capture session deleted")

	@route.delete("/sessions", response={200: CaptureBulkDeleteResponse}, auth=auth)
	def delete_all_captures(self, request):
		service = self._get_service()
		deleted = service.delete_all_captures()
		return CaptureBulkDeleteResponse(deleted=deleted)

	@route.get("/{session_id}/download", auth=auth)
	def download_capture(self, request, session_id: UUID):
		service = self._get_service()
		session = service.get_session(session_id)
		if not session:
			raise Http404
		path = service.get_full_path(session)
		if not path.exists():
			raise Http404
		mime_type, _ = mimetypes.guess_type(path.name)
		response = FileResponse(path.open("rb"), content_type=mime_type or "application/octet-stream")
		response["Content-Disposition"] = f"attachment; filename={path.name}"
		return response
