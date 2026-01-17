# Generated manually for TCP interface support

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        (
            "stridetastic_api",
            "0005_rename_stridetastic_last_ac_f5caa6_idx_stridetasti_last_ac_5e7c67_idx_and_more",
        ),
    ]

    operations = [
        # Add TCP choice to the Interface.Names field
        migrations.AlterField(
            model_name="interface",
            name="name",
            field=models.CharField(
                choices=[
                    ("MQTT", "MQTT"),
                    ("SERIAL", "Serial"),
                    ("TCP", "TCP (Network)"),
                ],
                default="MQTT",
                help_text="Type of the interface (MQTT / SERIAL / TCP).",
                max_length=20,
            ),
        ),
        # Add TCP hostname field
        migrations.AddField(
            model_name="interface",
            name="tcp_hostname",
            field=models.CharField(
                blank=True,
                help_text="IP address or hostname of the Meshtastic node.",
                max_length=255,
                null=True,
            ),
        ),
        # Add TCP port field
        migrations.AddField(
            model_name="interface",
            name="tcp_port",
            field=models.IntegerField(
                blank=True,
                default=4403,
                help_text="TCP port for the Meshtastic node (default 4403).",
                null=True,
            ),
        ),
    ]
