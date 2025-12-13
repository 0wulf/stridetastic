import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings

from stridetastic_api.models import Node
from stridetastic_api.services.virtual_node_service import VirtualNodeService


@pytest.mark.django_db
@override_settings(
    DEFAULT_VIRTUAL_NODE_ENABLED=True,
    DEFAULT_VIRTUAL_NODE_ID="!aabbccdd",
    DEFAULT_VIRTUAL_NODE_SHORT_NAME="VN1",
    DEFAULT_VIRTUAL_NODE_LONG_NAME="Seed Virtual Node",
    DEFAULT_VIRTUAL_NODE_ROLE="ROUTER",
    DEFAULT_VIRTUAL_NODE_HW_MODEL="TBEAM",
    DEFAULT_VIRTUAL_NODE_IS_LICENSED=True,
    DEFAULT_VIRTUAL_NODE_IS_UNMESSAGABLE=True,
)
def test_seeds_creates_configured_virtual_node():
    call_command("seeds")

    node = Node.objects.get(node_id="!aabbccdd")
    assert node.is_virtual is True
    assert node.short_name == "VN1"
    assert node.long_name == "Seed Virtual Node"
    assert node.role == "ROUTER"
    assert node.hw_model == "TBEAM"
    assert node.is_licensed is True
    assert node.is_unmessagable is True
    expected_node_num = VirtualNodeService._node_num_seed_from_node_id("!aabbccdd")
    assert node.node_num == expected_node_num
    assert node.mac_address == VirtualNodeService._default_mac(expected_node_num)
    assert Node.objects.filter(node_id="!aabbccdd").count() == 1


@pytest.mark.django_db
def test_seeds_updates_virtual_node_and_regenerates_keys():
    with override_settings(
        DEFAULT_VIRTUAL_NODE_ENABLED=True,
        DEFAULT_VIRTUAL_NODE_ID="!11223344",
        DEFAULT_VIRTUAL_NODE_SHORT_NAME="OLD",
        DEFAULT_VIRTUAL_NODE_LONG_NAME="Original Virtual Node",
        DEFAULT_VIRTUAL_NODE_ROLE="CLIENT",
        DEFAULT_VIRTUAL_NODE_HW_MODEL="UNSET",
        DEFAULT_VIRTUAL_NODE_IS_LICENSED=False,
        DEFAULT_VIRTUAL_NODE_IS_UNMESSAGABLE=False,
    ):
        call_command("seeds")

    node = Node.objects.get(node_id="!11223344")
    original_public_key = node.public_key
    original_private_key = node.private_key

    with override_settings(
        DEFAULT_VIRTUAL_NODE_ENABLED=True,
        DEFAULT_VIRTUAL_NODE_ID="!11223344",
        DEFAULT_VIRTUAL_NODE_SHORT_NAME="NEW",
        DEFAULT_VIRTUAL_NODE_LONG_NAME="Updated Virtual Node",
        DEFAULT_VIRTUAL_NODE_ROLE="ROUTER",
        DEFAULT_VIRTUAL_NODE_HW_MODEL="TBEAM",
        DEFAULT_VIRTUAL_NODE_IS_LICENSED=True,
        DEFAULT_VIRTUAL_NODE_IS_UNMESSAGABLE=True,
        DEFAULT_VIRTUAL_NODE_PUBLIC_KEY="cHVibGljS2V5QkFTRTY0",
        DEFAULT_VIRTUAL_NODE_PRIVATE_KEY="cHJpdmF0ZUtleUJBV0Va",
    ):
        call_command("seeds")

    node.refresh_from_db()
    assert node.short_name == "NEW"
    assert node.long_name == "Updated Virtual Node"
    assert node.role == "ROUTER"
    assert node.hw_model == "TBEAM"
    assert node.is_licensed is True
    assert node.is_unmessagable is True
    assert node.public_key == "cHVibGljS2V5QkFTRTY0"
    assert node.private_key == "cHJpdmF0ZUtleUJBV0Va"
    assert node.public_key != original_public_key
    assert node.private_key != original_private_key
    assert Node.objects.filter(node_id="!11223344").count() == 1


@pytest.mark.django_db
def test_seeds_requires_complete_key_pair():
    with override_settings(
        DEFAULT_VIRTUAL_NODE_ENABLED=True,
        DEFAULT_VIRTUAL_NODE_ID="!55667788",
        DEFAULT_VIRTUAL_NODE_PUBLIC_KEY="Zm9v",
        DEFAULT_VIRTUAL_NODE_PRIVATE_KEY="",
    ):
        with pytest.raises(CommandError):
            call_command("seeds")


@pytest.mark.django_db
def test_seeds_rejects_duplicate_seeded_key_pair():
    existing = Node.objects.create(
        node_num=VirtualNodeService.VIRTUAL_NODE_NUM_START,
        node_id="!existing",
        mac_address="AA:BB:CC:DD:EE:10",
        public_key="cHVibGljanNvbkR1cGxpY2F0ZQ==",
        is_virtual=True,
    )
    existing.store_private_key("cHJpdmF0ZWpzb25EdXBsaWNhdGU=")

    with override_settings(
        DEFAULT_VIRTUAL_NODE_ENABLED=True,
        DEFAULT_VIRTUAL_NODE_ID="!seeddemo",
        DEFAULT_VIRTUAL_NODE_PUBLIC_KEY="cHVibGljanNvbkR1cGxpY2F0ZQ==",
        DEFAULT_VIRTUAL_NODE_PRIVATE_KEY="cHJpdmF0ZWpzb25EdXBsaWNhdGU=",
    ):
        with pytest.raises(CommandError):
            call_command("seeds")
