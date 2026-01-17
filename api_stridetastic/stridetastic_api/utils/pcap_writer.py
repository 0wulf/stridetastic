from __future__ import annotations

import os
import struct
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Optional


class PcapNgWriter:
    """PCAP-NG writer that encodes Meshtastic protobuf payloads on a single interface.

    Each Enhanced Packet Block carries a frame comment describing the protobuf
    message type (e.g. ``type=meshtastic.MeshPacket``). The Wireshark dissector can
    read this comment to drive protobuf decoding while keeping the capture format
    compact and standards compliant.
    """

    _SECTION_HEADER_BLOCK = 0x0A0D0D0A
    _INTERFACE_DESCRIPTION_BLOCK = 0x00000001
    _ENHANCED_PACKET_BLOCK = 0x00000006
    _BYTE_ORDER_MAGIC = 0x1A2B3C4D
    _VERSION_MAJOR = 1
    _VERSION_MINOR = 0
    _DEFAULT_SNAPLEN = 0xFFFF

    _LINKTYPE = 162  # DLT_USER15 reserved for Meshtastic captures

    _IF_NAME_OPTION = 2
    _IF_DESCRIPTION_OPTION = 3
    _IF_TSRESOL_OPTION = 9
    _IF_FILTER_OPTION = 11
    _IF_PROTOCOLS_OPTION = 19

    _EPB_COMMENT_OPTION = 1

    _TS_RESOLUTION = 1_000_000  # microsecond resolution

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self._lock = threading.Lock()
        self._file = self.path.open("wb")
        self._bytes_written = 0
        self._next_interface_id = 0
        self._write_section_header_block()
        self._mesh_interface_id = self._write_interface_description_block(
            self._LINKTYPE,
            "meshtastic",
            "protobuf.meshtastic.MeshPacket",
        )
        self._data_interface_id = self._write_interface_description_block(
            self._LINKTYPE,
            "meshtastic-data",
            "protobuf.meshtastic.Data",
        )

    def _write_block(self, block_type: int, body: bytes) -> None:
        block_total_length = 12 + len(body)
        block = struct.pack("<II", block_type, block_total_length)
        block += body
        block += struct.pack("<I", block_total_length)
        self._file.write(block)
        self._file.flush()
        self._bytes_written += len(block)

    def _write_section_header_block(self) -> None:
        body = struct.pack(
            "<IHHq",
            self._BYTE_ORDER_MAGIC,
            self._VERSION_MAJOR,
            self._VERSION_MINOR,
            -1,
        )
        # Align to 32-bit boundary (already aligned) and append end-of-options field.
        body += struct.pack("<HH", 0, 0)
        self._write_block(self._SECTION_HEADER_BLOCK, body)

    def _encode_option(self, code: int, value: bytes) -> bytes:
        length = len(value)
        padded_length = (length + 3) & ~0x03
        padding = b"\x00" * (padded_length - length)
        return struct.pack("<HH", code, length) + value + padding

    def _write_interface_description_block(
        self, link_type: int, name: str, proto_hint: str
    ) -> int:
        options = self._encode_option(self._IF_NAME_OPTION, name.encode("utf-8"))
        description = f"proto:{proto_hint}".encode("utf-8")
        options += self._encode_option(self._IF_DESCRIPTION_OPTION, description)
        filter_body = struct.pack("<H", 0) + description
        options += self._encode_option(self._IF_FILTER_OPTION, filter_body)
        opzioni_protocol = proto_hint.encode("utf-8")
        options += self._encode_option(self._IF_PROTOCOLS_OPTION, opzioni_protocol)
        options += self._encode_option(self._IF_TSRESOL_OPTION, b"\x06")
        options += struct.pack("<HH", 0, 0)
        body = struct.pack("<HHi", link_type, 0, self._DEFAULT_SNAPLEN)
        body += options
        interface_id = self._next_interface_id
        self._write_block(self._INTERFACE_DESCRIPTION_BLOCK, body)
        self._next_interface_id += 1
        return interface_id

    def _write_enhanced_packet_block(
        self,
        interface_id: int,
        message_type: Optional[str],
        payload: bytes,
        timestamp: Optional[datetime] = None,
    ) -> None:
        if not isinstance(payload, (bytes, bytearray)):
            raise TypeError("Payload must be bytes")

        ts = timestamp or datetime.fromtimestamp(time.time())
        total_ticks = int(ts.timestamp() * self._TS_RESOLUTION)
        timestamp_high = (total_ticks >> 32) & 0xFFFFFFFF
        timestamp_low = total_ticks & 0xFFFFFFFF
        captured_length = len(payload)
        padded_length = (captured_length + 3) & ~0x03
        padding = b"\x00" * (padded_length - captured_length)
        body = struct.pack(
            "<IIIII",
            interface_id,
            timestamp_high,
            timestamp_low,
            captured_length,
            captured_length,
        )
        body += bytes(payload) + padding

        if message_type:
            comment_bytes = f"type={message_type}".encode("utf-8")
            body += self._encode_option(self._EPB_COMMENT_OPTION, comment_bytes)

        # End of options
        body += struct.pack("<HH", 0, 0)
        self._write_block(self._ENHANCED_PACKET_BLOCK, body)

    def write_packet(
        self,
        *,
        message_type: str,
        payload: bytes,
        interface_id: Optional[int] = None,
        timestamp: Optional[datetime] = None,
    ) -> None:
        if not message_type:
            raise ValueError("message_type must be a non-empty string")
        if interface_id is None:
            interface_id = self._mesh_interface_id
        with self._lock:
            self._write_enhanced_packet_block(
                interface_id=interface_id,
                message_type=message_type,
                payload=payload,
                timestamp=timestamp,
            )

    def write_mesh_packet(
        self, payload: bytes, timestamp: Optional[datetime] = None
    ) -> None:
        self.write_packet(
            message_type="meshtastic.MeshPacket",
            payload=payload,
            interface_id=self._mesh_interface_id,
            timestamp=timestamp,
        )

    def write_data_packet(
        self, payload: bytes, timestamp: Optional[datetime] = None
    ) -> None:
        self.write_packet(
            message_type="meshtastic.Data",
            payload=payload,
            interface_id=self._data_interface_id,
            timestamp=timestamp,
        )

    def close(self) -> None:
        with self._lock:
            if not self._file.closed:
                self._file.flush()
                self._file.close()

    @property
    def bytes_written(self) -> int:
        if self._file.closed:
            return os.path.getsize(self.path)
        return self._bytes_written

    def __enter__(self) -> "PcapNgWriter":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
