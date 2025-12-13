from unfold.admin import ModelAdmin
from django.contrib import admin
from ..models.interface_models import Interface

@admin.register(Interface)
class InterfaceAdmin(ModelAdmin):
    list_display = (
        "display_name",
        "name",
        "is_enabled",
        "status",
        "last_connected",
        "last_error",
    )

    list_filter = (
        "name",
        "is_enabled",
        "status",
    )

    readonly_fields = (
        "name",
        "status",
        "last_connected",
        "last_error",
    )

    fieldsets = (
        (None, {
            'fields': ('display_name', 'name', 'is_enabled', 'status', 'last_connected', 'last_error')
        }),
        ('MQTT Configuration', {
            'fields': ('mqtt_broker_address', 'mqtt_port', 'mqtt_topic', 'mqtt_base_topic', 'mqtt_username', 'mqtt_password', 'mqtt_tls', 'mqtt_ca_certs')
        }),
        ('Serial Configuration', {
            'fields': ('serial_port', 'serial_baudrate', 'serial_node')
        }),
    )
