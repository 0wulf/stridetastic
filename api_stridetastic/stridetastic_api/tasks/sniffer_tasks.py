from celery import shared_task
from stridetastic_api.interfaces.mqtt_interface import MqttInterface
from stridetastic_api.interfaces.serial_interface import SerialInterface


# @shared_task
def run_mqtt_interface(
    broker_address,
    port,
    topic,
    username,
    password,
    tls,
    ca_certs,
):
    mqtt_interface = MqttInterface(
        broker_address=broker_address,
        port=port,
        topic=topic,
        username=username,
        password=password,
        tls=tls,
        ca_certs=ca_certs,
    )
    mqtt_interface.connect()
    mqtt_interface.start()
    return mqtt_interface


@shared_task
def run_serial_interface(
    port,
    baudrate,
):
    serial_interface = SerialInterface(
        port=port,
        baudrate=baudrate,
    )
    serial_interface.connect()
    serial_interface.start()
