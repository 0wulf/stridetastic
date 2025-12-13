from typing import Optional, Dict
import sys
import logging
import time
from django.utils import timezone
from django.conf import settings

from ..interfaces.mqtt_interface import MqttInterface
from ..interfaces.serial_interface import SerialInterface
from ..models.interface_models import Interface
from .publisher_service import PublisherService, PublishableInterface
from .sniffer_service import SnifferService
from .capture_service import CaptureService
from .pki_service import PKIService

class RuntimeInterfaceWrapper:
    """Holds the runtime implementation and metadata for a DB Interface instance."""
    def __init__(self, db_interface: Interface, impl):
        self.db = db_interface
        self.impl = impl

    def start(self):
        try:
            logging.info(
                f"[Interface] Starting '{self.db.display_name}' type={self.db.name} broker={getattr(self.db, 'mqtt_broker_address', None)} topic={getattr(self.db, 'mqtt_topic', None)}"
            )
            self.impl.connect()
            self.impl.start()
            self.db.status = Interface.Status.RUNNING
            self.db.last_connected = timezone.now()
            self.db.last_error = None
            self.db.save(update_fields=["status", "last_connected", "last_error"])
            logging.info(f"Started interface {self.db.display_name}")
        except Exception as e:
            self.db.status = Interface.Status.ERROR
            self.db.last_error = str(e)
            self.db.save(update_fields=["status", "last_error"])
            logging.error(f"Failed to start interface {self.db.display_name}: {e}")

    def stop(self):
        try:
            self.impl.disconnect()
        except Exception:
            pass
        self.db.status = Interface.Status.STOPPED
        self.db.save(update_fields=["status"])
        logging.info(f"Stopped interface {self.db.display_name}")

    def is_connected(self) -> bool:
        try:
            return self.impl.is_connected()
        except Exception:
            return False

class ServiceManager:
    """Centralized service manager for coordinating interfaces and services"""
    _instance: Optional['ServiceManager'] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, '_initialized'):
            return
        self._runtime_interfaces: Dict[int, RuntimeInterfaceWrapper] = {}
        self._publisher_service: Optional[PublisherService] = None
        self._sniffer_service: Optional[SnifferService] = None
        self._capture_service: Optional[CaptureService] = None
        self._pki_service: Optional[PKIService] = None
        self._process_role = self._detect_process_role()
        self._allow_interface_runtime = self._process_role == "celery_worker"
        self._initialized = True

    # ---- Interface Management ----
    def reset_interfaces_to_init(self):
        if not self._allow_interface_runtime:
            return
        # Set all enabled interfaces to INIT status at startup
        Interface.objects.filter(is_enabled=True).exclude(status=Interface.Status.INIT).update(status=Interface.Status.INIT)
        # Set all disabled interfaces to STOPPED
        Interface.objects.filter(is_enabled=False).exclude(status=Interface.Status.STOPPED).update(status=Interface.Status.STOPPED)

    def load_enabled_interfaces(self):
        if not self._allow_interface_runtime:
            logging.info("Interface load skipped (process role %s)", self._process_role)
            return
        self.reset_interfaces_to_init()
        for iface in Interface.objects.filter(is_enabled=True):
            if iface.id not in self._runtime_interfaces:
                self._runtime_interfaces[iface.id] = RuntimeInterfaceWrapper(
                    db_interface=iface,
                    impl=self._build_interface_impl(iface)
                )
        if not self._runtime_interfaces:
            # Auto-create a default MQTT interface if none present, so the system works out-of-the-box
            logging.warning("No enabled interfaces found. Creating a default MQTT interface (auto).")
            default_iface = Interface.objects.create(
                name=Interface.Names.MQTT,
                display_name="mqtt-default",
                is_enabled=True,
                mqtt_broker_address=getattr(settings, 'MQTT_BROKER_ADDRESS', 'mqtt.meshtastic.org'),
                mqtt_port=getattr(settings, 'MQTT_BROKER_PORT', 1883),
                mqtt_topic=getattr(settings, 'MQTT_TOPIC', 'msh/#'),
                mqtt_base_topic=getattr(settings, 'MQTT_BASE_TOPIC', 'msh/US/2/e'),
                mqtt_username=getattr(settings, 'MQTT_USERNAME', ''),
                mqtt_password=getattr(settings, 'MQTT_PASSWORD', ''),
                mqtt_tls=getattr(settings, 'MQTT_TLS', False),
                mqtt_ca_certs=getattr(settings, 'MQTT_CA_CERTS', None),
            )
            self._runtime_interfaces[default_iface.id] = RuntimeInterfaceWrapper(
                db_interface=default_iface,
                impl=self._build_interface_impl(default_iface)
            )
        logging.info(
            f"Loaded {len(self._runtime_interfaces)} interface instances: " + ", ".join(
                f"{w.db.id}:{w.db.display_name}({w.db.name}) topic={getattr(w.db,'mqtt_topic', None)} status={w.db.status}" for w in self._runtime_interfaces.values()
            )
        )

    def start_all(self):
        if not self._allow_interface_runtime:
            return
        for wrapper in self._runtime_interfaces.values():
            if wrapper.db.status not in (Interface.Status.RUNNING, Interface.Status.CONNECTING):
                wrapper.start()

    def stop_all(self):
        if not self._allow_interface_runtime:
            return
        # Stop all runtime interfaces in memory
        for wrapper in self._runtime_interfaces.values():
            wrapper.stop()
        # Ensure all interfaces in DB are marked as STOPPED
        Interface.objects.exclude(status=Interface.Status.STOPPED).update(status=Interface.Status.STOPPED)
        if self._capture_service:
            self._capture_service.stop_all()

    def reload_interface(self, interface_id: int):
        if not self._allow_interface_runtime:
            return
        wrapper = self._runtime_interfaces.get(interface_id)
        if wrapper:
            wrapper.stop()
        db_iface = Interface.objects.filter(id=interface_id).first()
        if not db_iface:
            self._runtime_interfaces.pop(interface_id, None)
            return
        new_wrapper = RuntimeInterfaceWrapper(db_interface=db_iface, impl=self._build_interface_impl(db_iface))
        self._runtime_interfaces[interface_id] = new_wrapper
        if db_iface.is_enabled:
            new_wrapper.start()
            if self._publisher_service:
                self._configure_publisher_reactive_runtime()
        else:
            # If disabled, ensure status is STOPPED
            if db_iface.status != Interface.Status.STOPPED:
                db_iface.status = Interface.Status.STOPPED
                db_iface.save(update_fields=["status"])
    def shutdown(self):
        """Call this on container/service shutdown to ensure all interfaces are stopped and states are correct."""
        self.stop_all()
        logging.info("ServiceManager shutdown: all interfaces stopped and states updated.")

    def _build_interface_impl(self, iface: Interface):
        if iface.name == Interface.Names.MQTT:
            return MqttInterface(
                broker_address=iface.mqtt_broker_address or settings.MQTT_BROKER_ADDRESS,
                port=iface.mqtt_port or settings.MQTT_BROKER_PORT,
                topic=iface.mqtt_topic or settings.MQTT_TOPIC,
                username=iface.mqtt_username or settings.MQTT_USERNAME,
                password=iface.mqtt_password or settings.MQTT_PASSWORD,
                tls=iface.mqtt_tls if iface.mqtt_tls is not None else getattr(settings, 'MQTT_TLS', False),
                ca_certs=iface.mqtt_ca_certs or getattr(settings, 'MQTT_CA_CERTS', None),
                interface_id=iface.id,
            )
        elif iface.name == Interface.Names.SERIAL:
            return SerialInterface(
                port=iface.serial_port or getattr(settings, 'SERIAL_PORT', None),
                baudrate=iface.serial_baudrate or getattr(settings, 'SERIAL_BAUDRATE', 9600),
                interface_id=iface.id,
            )
        else:
            raise ValueError(f"Unsupported interface type: {iface.name}")

    def get_publishable_mqtt(self) -> Optional[PublishableInterface]:
        # Return first running MQTT interface
        for w in self._runtime_interfaces.values():
            if w.db.name == Interface.Names.MQTT and w.db.status == Interface.Status.RUNNING:
                return w.impl
        return None

    def _resolve_reactive_publisher(self):
        """Resolve publisher and base topic for current reactive config."""
        if not self._publisher_service:
            return None, None
        config = self._publisher_service.load_reactive_config()
        preferred_interfaces = list(config.listen_interfaces.all())
        for iface in preferred_interfaces:
            wrapper = self.get_running_mqtt_interface(iface.id)
            if wrapper:
                return wrapper.impl, wrapper.db.mqtt_base_topic
        publisher = self.get_publishable_mqtt()
        base_topic = None
        if publisher:
            # Attempt to infer base topic from first matching interface
            for w in self._runtime_interfaces.values():
                if w.impl is publisher:
                    base_topic = w.db.mqtt_base_topic
                    break
        return publisher, base_topic

    def _configure_publisher_reactive_runtime(self):
        if not self._publisher_service:
            return
        publisher, base_topic = self._resolve_reactive_publisher()
        config = self._publisher_service.load_reactive_config()
        self._publisher_service.configure_reactive_runtime(
            publisher=publisher,
            base_topic=base_topic,
            config=config,
        )
        if config.enabled:
            self._publisher_service.start_reactive_service()
        else:
            self._publisher_service.stop_reactive_service()

    def refresh_publisher_reactive_runtime(self):
        """Re-evaluate reactive publisher runtime after config or interface changes."""
        self._configure_publisher_reactive_runtime()

    # ---- Publisher Service ----
    def initialize_publisher_service(self) -> PublisherService:
        pki_service = self.initialize_pki_service()
        if self._publisher_service is None:
            publisher = self.get_publishable_mqtt()
            self._publisher_service = PublisherService(publisher=publisher, pki_service=pki_service)
            logging.info("Publisher service initialized")
        else:
            # Update publisher if a new one is available
            publisher = self.get_publishable_mqtt()
            if publisher and not self._publisher_service._publisher:
                self._publisher_service.set_publisher(publisher)
            self._publisher_service.set_pki_service(pki_service)
        self._configure_publisher_reactive_runtime()
        return self._publisher_service

    def get_publisher_service(self) -> Optional[PublisherService]:
        return self._publisher_service

    # ---- PKI Service ----
    def initialize_pki_service(self) -> PKIService:
        if self._pki_service is None:
            self._pki_service = PKIService()
            logging.info("PKI service initialized")
        if self._capture_service is not None:
            self._capture_service.set_pki_service(self._pki_service)
        return self._pki_service

    def get_pki_service(self) -> Optional[PKIService]:
        return self._pki_service

    # ---- Sniffer Service ----
    def initialize_sniffer_service(self) -> SnifferService:
        if self._sniffer_service is None:
            mqtt_iface = self.get_publishable_mqtt()
            serial_cfg = None  # Serial interface runs in its own Celery task, optionally
            self._sniffer_service = SnifferService(
                mqtt_interface=mqtt_iface,
                serial_config=serial_cfg,
            )
            logging.info("Sniffer service initialized")
        return self._sniffer_service

    def get_sniffer_service(self) -> Optional[SnifferService]:
        return self._sniffer_service

    # ---- Capture Service ----
    def initialize_capture_service(self) -> CaptureService:
        if self._capture_service is None:
            enable_writer = self._process_role == "celery_worker"
            pki_service = self.initialize_pki_service()
            max_bytes = getattr(settings, "CAPTURE_MAX_FILESIZE", None)
            self._capture_service = CaptureService(
                enable_writer=enable_writer,
                pki_service=pki_service,
                max_bytes=max_bytes,
            )
            logging.info("Capture service initialized")
        return self._capture_service

    def get_capture_service(self) -> Optional[CaptureService]:
        return self._capture_service

    # ---- Initialization entrypoint ----
    def bootstrap(self):
        if self._allow_interface_runtime:
            self.load_enabled_interfaces()
            self.start_all()
            # Log current known interface state; connections establish on demand per process.
            for w in self._runtime_interfaces.values():
                logging.info(
                    "[InterfaceStatus] id=%s name=%s type=%s status=%s connected=%s topic=%s",
                    getattr(w.db, "id", None),
                    getattr(w.db, "display_name", None),
                    getattr(w.db, "name", None),
                    getattr(w.db, "status", None),
                    w.is_connected(),
                    getattr(w.db, "mqtt_topic", None),
                )
        else:
            logging.info("ServiceManager bootstrap: interface runtime disabled in process role %s", self._process_role)
        self.initialize_pki_service()
        self.initialize_publisher_service()
        self.initialize_sniffer_service()
        self.initialize_capture_service()

    @classmethod
    def get_instance(cls) -> 'ServiceManager':
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_runtime_interface(self, interface_id: int) -> Optional[RuntimeInterfaceWrapper]:
        return self._runtime_interfaces.get(interface_id)

    def get_running_mqtt_interface(self, interface_id: int) -> Optional[RuntimeInterfaceWrapper]:
        wrapper = self.get_runtime_interface(interface_id)
        if not wrapper:
            return None
        if wrapper.db.name != Interface.Names.MQTT:
            return None
        if wrapper.db.status != Interface.Status.RUNNING:
            return None
        return wrapper

    def resolve_publish_context(self, interface_id: int) -> tuple[Optional[PublishableInterface], Optional[str], Optional[str]]:
        """Resolve a publishable interface implementation and base topic for a given interface id."""
        if not self._allow_interface_runtime:
            return None, None, "Interface operations not permitted in this process"
        wrapper = self.get_runtime_interface(interface_id)
        if not wrapper:
            db_iface = Interface.objects.filter(id=interface_id).first()
            if not db_iface:
                return None, None, "Interface not found"
            if not db_iface.is_enabled:
                return None, None, "Interface disabled"
            wrapper = RuntimeInterfaceWrapper(db_interface=db_iface, impl=self._build_interface_impl(db_iface))
            self._runtime_interfaces[interface_id] = wrapper
        if wrapper.db.name != Interface.Names.MQTT:
            return None, None, "Interface type not supported for publishing"
        need_restart = wrapper.db.status != Interface.Status.RUNNING
        if not need_restart and hasattr(wrapper.impl, "is_connected"):
            try:
                need_restart = not wrapper.impl.is_connected()
            except Exception:
                need_restart = True
        if need_restart:
            try:
                if wrapper.db.status == Interface.Status.RUNNING:
                    try:
                        wrapper.stop()
                    except Exception:
                        pass
                wrapper.start()
            except Exception:
                pass
            if wrapper.db.status != Interface.Status.RUNNING:
                return None, None, "Interface not running"
            if hasattr(wrapper.impl, "is_connected"):
                connected = False
                try:
                    connected = wrapper.impl.is_connected()
                except Exception:
                    connected = False
                if not connected:
                    for _ in range(20):  # wait up to ~2 seconds for async connect callbacks
                        time.sleep(0.1)
                        try:
                            if wrapper.impl.is_connected():
                                connected = True
                                break
                        except Exception:
                            break
                if not connected:
                    return None, None, "Interface not connected"
        base_topic = wrapper.db.mqtt_base_topic or None
        return wrapper.impl, base_topic, None

    @staticmethod
    def _detect_process_role() -> str:
        argv = sys.argv
        if argv and argv[0].endswith("celery"):
            if "worker" in argv:
                return "celery_worker"
            if "beat" in argv:
                return "celery_beat"
            return "celery"
        return "web"
