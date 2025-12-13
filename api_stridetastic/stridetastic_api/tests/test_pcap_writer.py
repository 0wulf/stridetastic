import struct

from stridetastic_api.utils.pcap_writer import PcapNgWriter


def _iter_pcapng_blocks(data: bytes):
	offset = 0
	length = len(data)
	while offset < length:
		block_type, block_total_length = struct.unpack_from("<II", data, offset)
		body_length = block_total_length - 12
		body_start = offset + 8
		body_end = body_start + body_length
		yield block_type, data[body_start:body_end]
		offset += block_total_length


def test_pcapng_writer_emits_mesh_and_data_blocks(tmp_path):
	output_path = tmp_path / "capture.pcapng"
	mesh_payload = b"\x08\x96\x01"
	data_payload = b"\x12\x03abc"

	writer = PcapNgWriter(output_path)
	writer.write_mesh_packet(mesh_payload)
	writer.write_data_packet(data_payload)
	writer.close()

	binary = output_path.read_bytes()
	blocks = list(_iter_pcapng_blocks(binary))
	assert len(blocks) == 4
	assert [block_type for block_type, _ in blocks] == [
		0x0A0D0D0A,  # Section Header Block
		0x00000001,  # Interface Description Block
		0x00000006,  # Enhanced Packet Block (MeshPacket)
		0x00000006,  # Enhanced Packet Block (Data payload)
	]

	mesh_block = blocks[2][1]
	mesh_interface_id, _, _, mesh_captured_len, mesh_original_len = struct.unpack_from("<IIIII", mesh_block, 0)
	assert mesh_interface_id == 0
	assert mesh_captured_len == mesh_original_len == len(mesh_payload)
	mesh_data = mesh_block[20 : 20 + mesh_captured_len]
	assert mesh_data == mesh_payload
	mesh_options_offset = 20 + ((mesh_captured_len + 3) & ~0x03)
	mesh_opt_code, mesh_opt_length = struct.unpack_from("<HH", mesh_block, mesh_options_offset)
	assert mesh_opt_code == 1
	mesh_comment = mesh_block[mesh_options_offset + 4 : mesh_options_offset + 4 + mesh_opt_length].decode()
	assert mesh_comment == "type=meshtastic.MeshPacket"
	mesh_end_option_offset = mesh_options_offset + 4 + ((mesh_opt_length + 3) & ~0x03)
	mesh_end_option = mesh_block[mesh_end_option_offset : mesh_end_option_offset + 4]
	assert mesh_end_option == struct.pack("<HH", 0, 0)

	data_block = blocks[3][1]
	data_interface_id, _, _, data_captured_len, data_original_len = struct.unpack_from("<IIIII", data_block, 0)
	assert data_interface_id == 1
	assert data_captured_len == data_original_len == len(data_payload)
	data_data = data_block[20 : 20 + data_captured_len]
	assert data_data == data_payload
	data_options_offset = 20 + ((data_captured_len + 3) & ~0x03)
	data_opt_code, data_opt_length = struct.unpack_from("<HH", data_block, data_options_offset)
	assert data_opt_code == 1
	data_comment = data_block[data_options_offset + 4 : data_options_offset + 4 + data_opt_length].decode()
	assert data_comment == "type=meshtastic.Data"
	data_end_option_offset = data_options_offset + 4 + ((data_opt_length + 3) & ~0x03)
	data_end_option = data_block[data_end_option_offset : data_end_option_offset + 4]
	assert data_end_option == struct.pack("<HH", 0, 0)


def test_pcapng_writer_context_manager(tmp_path):
	output_path = tmp_path / "context.pcapng"
	mesh_payload = b"\x00"

	with PcapNgWriter(output_path) as writer:
		writer.write_mesh_packet(mesh_payload)

	assert output_path.exists()
	file_size = output_path.stat().st_size
	assert writer.bytes_written == file_size
