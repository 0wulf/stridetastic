from typing import Dict

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from stridetastic_api.models import Channel, Interface, Node
from stridetastic_api.services.virtual_node_service import (
    VirtualNodeError,
    VirtualNodeService,
)


class Command(BaseCommand):
    help = "Seed the database with initial data"

    def handle(self, *args, **kwargs):
        Node.objects.update_or_create(
            node_id="!ffffffff",
            defaults={
                "node_num": 4294967295,
                "mac_address": "00:00:ff:ff:ff:ff",
                "long_name": "BROADCAST",
            },
        )

        _serial_interface = Interface.objects.filter(
            interface_type=Interface.Types.SERIAL
        ).first()
        if _serial_interface is None:
            _serial_interface = Interface.objects.create(
                interface_type=Interface.Types.SERIAL,
            )

        mqtt_interface = Interface.objects.filter(
            interface_type=Interface.Types.MQTT
        ).first()
        if mqtt_interface is None:
            mqtt_interface = Interface.objects.create(
                interface_type=Interface.Types.MQTT
            )

        default_channel, _ = Channel.objects.get_or_create(
            channel_id="LongFast",
            channel_num=8,
            defaults={"psk": "AQ=="},
        )

        default_channel.interfaces.add(mqtt_interface)

        self._seed_default_virtual_node()

        self.stdout.write(self.style.SUCCESS("Successfully seeded the database"))

    def _seed_default_virtual_node(self) -> None:
        if not settings.DEFAULT_VIRTUAL_NODE_ENABLED:
            return

        node_id = (settings.DEFAULT_VIRTUAL_NODE_ID or "").strip()
        if not node_id:
            raise CommandError(
                "DEFAULT_VIRTUAL_NODE_ID must be set when DEFAULT_VIRTUAL_NODE_ENABLED is true."
            )

        payload = self._build_virtual_node_payload(node_id)
        existing = Node.objects.filter(node_id=node_id).first()

        try:
            if existing:
                if not existing.is_virtual:
                    raise CommandError(
                        f"Node {node_id} already exists and is not virtual; cannot seed default virtual node."
                    )
                node, secrets = VirtualNodeService.update_virtual_node(
                    existing,
                    payload,
                )
                action = "Updated"
            else:
                node, secrets = VirtualNodeService.create_virtual_node(payload)
                action = "Created"
        except VirtualNodeError as exc:
            raise CommandError(f"Failed to seed default virtual node: {exc}") from exc

        notes = []
        if secrets:
            notes.append("generated new key material")
        if self._apply_seeded_keys(node):
            notes.append("applied seeded key pair")

        note_text = f" ({'; '.join(notes)})" if notes else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{action} default virtual node {node.node_id}{note_text}"
            )
        )

    def _build_virtual_node_payload(self, node_id: str) -> Dict[str, object]:
        payload: Dict[str, object] = {"node_id": node_id}

        short_name = (settings.DEFAULT_VIRTUAL_NODE_SHORT_NAME or "").strip()
        if short_name:
            payload["short_name"] = short_name

        long_name = (settings.DEFAULT_VIRTUAL_NODE_LONG_NAME or "").strip()
        if long_name:
            payload["long_name"] = long_name

        role = (settings.DEFAULT_VIRTUAL_NODE_ROLE or "").strip()
        if role:
            payload["role"] = role

        hw_model = (settings.DEFAULT_VIRTUAL_NODE_HW_MODEL or "").strip()
        if hw_model:
            payload["hw_model"] = hw_model

        payload["is_licensed"] = bool(settings.DEFAULT_VIRTUAL_NODE_IS_LICENSED)
        payload["is_unmessagable"] = bool(settings.DEFAULT_VIRTUAL_NODE_IS_UNMESSAGABLE)

        return payload

    def _apply_seeded_keys(self, node: Node) -> bool:
        public_key = (settings.DEFAULT_VIRTUAL_NODE_PUBLIC_KEY or "").strip()
        private_key = (settings.DEFAULT_VIRTUAL_NODE_PRIVATE_KEY or "").strip()

        if not public_key and not private_key:
            return False

        if not public_key or not private_key:
            raise CommandError(
                "Both DEFAULT_VIRTUAL_NODE_PUBLIC_KEY and DEFAULT_VIRTUAL_NODE_PRIVATE_KEY must be provided together."
            )

        try:
            VirtualNodeService.assign_key_pair(node, public_key, private_key)
        except VirtualNodeError as exc:
            raise CommandError(
                f"Seed virtual node key pair already in use: {exc}"
            ) from exc
        return True
