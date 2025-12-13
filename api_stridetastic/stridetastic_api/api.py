from ninja_extra import NinjaExtraAPI  # type: ignore[import]

from .controllers import (
    AuthController,
    NodeController,
    GraphController,
    ChannelController,
    PublisherController,
    CaptureController,
    PortController,
    MetricsController,
    LinkController,
)
from .controllers.interface_controller import InterfaceController

api = NinjaExtraAPI(
    title="Stridetastic API",
    version="1.0.0",
)

@api.get("/status")
def status(request):
    """
    Check the status of the API.
    """
    return {"status": "API is running"}


api.register_controllers(
    AuthController,
    NodeController,
    GraphController,
    ChannelController,
    PublisherController,
    CaptureController,
    PortController,
    InterfaceController,
    MetricsController,
    LinkController,
)