from ninja_extra import permissions  # type: ignore[import]
from ninja_extra import api_controller, route
from ninja_jwt.authentication import JWTAuth  # type: ignore[import]

from ..schemas import (
    VirtualNodeKeyPairSchema,
    VirtualNodeOptionsSchema,
    VirtualNodePrefillSchema,
)
from ..services.virtual_node_service import VirtualNodeService

auth = JWTAuth()


@api_controller("/nodes", tags=["Nodes"], permissions=[permissions.IsAuthenticated])
class VirtualNodeMetaController:
    @route.get("/virtual/options", response=VirtualNodeOptionsSchema, auth=auth)
    def get_virtual_node_options(self):
        return VirtualNodeService.get_virtual_node_options()

    @route.get("/virtual/prefill", response=VirtualNodePrefillSchema, auth=auth)
    def get_virtual_node_prefill(self):
        return VirtualNodeService.generate_virtual_node_prefill()

    @route.post("/virtual/keypair", response=VirtualNodeKeyPairSchema, auth=auth)
    def generate_virtual_node_keypair(self):
        secrets = VirtualNodeService.generate_key_pair()
        return VirtualNodeKeyPairSchema(
            public_key=secrets.public_key, private_key=secrets.private_key
        )
