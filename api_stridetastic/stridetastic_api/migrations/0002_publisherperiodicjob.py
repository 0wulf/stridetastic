import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        (
            "stridetastic_api",
            "0001_initial",
        ),
    ]

    operations = [
        migrations.CreateModel(
            name="PublisherPeriodicJob",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=128)),
                ("description", models.TextField(blank=True, default="")),
                ("enabled", models.BooleanField(default=True)),
                (
                    "payload_type",
                    models.CharField(
                        choices=[
                            ("text", "Text Message"),
                            ("position", "Position"),
                            ("nodeinfo", "Node Info"),
                            ("traceroute", "Traceroute"),
                        ],
                        max_length=32,
                    ),
                ),
                ("from_node", models.CharField(max_length=32)),
                ("to_node", models.CharField(max_length=32)),
                ("channel_name", models.CharField(max_length=64)),
                ("channel_key", models.TextField(blank=True, default="")),
                (
                    "gateway_node",
                    models.CharField(blank=True, default="", max_length=32),
                ),
                ("hop_limit", models.PositiveSmallIntegerField(default=3)),
                ("hop_start", models.PositiveSmallIntegerField(default=3)),
                ("want_ack", models.BooleanField(default=False)),
                ("pki_encrypted", models.BooleanField(default=False)),
                ("payload_options", models.JSONField(blank=True, default=dict)),
                (
                    "period_seconds",
                    models.PositiveIntegerField(
                        default=300, help_text="Execution period in seconds."
                    ),
                ),
                (
                    "next_run_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                ("last_run_at", models.DateTimeField(blank=True, null=True)),
                (
                    "last_status",
                    models.CharField(
                        choices=[
                            ("idle", "Idle"),
                            ("success", "Success"),
                            ("error", "Error"),
                            ("skipped", "Skipped"),
                        ],
                        default="idle",
                        max_length=16,
                    ),
                ),
                ("last_error_message", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "interface",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="periodic_publisher_jobs",
                        to="stridetastic_api.interface",
                    ),
                ),
            ],
            options={
                "ordering": ("-updated_at",),
                "verbose_name": "Periodic Publisher Job",
                "verbose_name_plural": "Periodic Publisher Jobs",
            },
        ),
        migrations.AddIndex(
            model_name="publisherperiodicjob",
            index=models.Index(
                fields=("enabled", "next_run_at"), name="periodic_publish_due_idx"
            ),
        ),
    ]
