import os
import sys

from django.apps import AppConfig


class StridetasticApiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "stridetastic_api"

    def ready(self):
        if not self._should_start_services():
            return

        self.register_signals()
        self.start_services()

    def _is_celery_worker(self) -> bool:
        return any(arg == "worker" for arg in sys.argv)

    def _should_start_services(self) -> bool:
        """Check if services should be started"""
        if self._is_celery_worker():
            return True
        return False

    def register_signals(self):
        """Registra todas las señales de la aplicación"""
        # Importa las señales para que se registren
        from .signals import user_signals  # noqa

    def start_services(self):
        """Initialize and start all services"""
        if not self._is_celery_worker():
            return

        from .services.service_manager import ServiceManager

        try:
            service_manager = ServiceManager.get_instance()
            service_manager.bootstrap()
            os.environ["MQTT_SUBSCRIBER_STARTED"] = "True"

        except Exception as e:
            import logging

            logging.error(f"Failed to start services: {e}")
            os.environ["MQTT_SUBSCRIBER_STARTED"] = "True"
