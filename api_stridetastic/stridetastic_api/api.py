from ninja_extra import NinjaExtraAPI  # type: ignore[import]

from .controllers import (
    AuthController,
    CaptureController,
    ChannelController,
    GraphController,
    KeepaliveController,
    LinkController,
    MetricsController,
    NodeController,
    PortController,
    PublisherController,
    VirtualNodeMetaController,
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
    VirtualNodeMetaController,
    NodeController,
    GraphController,
    ChannelController,
    PublisherController,
    CaptureController,
    PortController,
    InterfaceController,
    MetricsController,
    KeepaliveController,
    LinkController,
)
