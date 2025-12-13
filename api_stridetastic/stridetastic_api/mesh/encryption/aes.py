import logging
import base64

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

from meshtastic.protobuf import mesh_pb2

from ..utils import generate_hash, ensure_aes_key


def encrypt_message(channel, key, mesh_packet, encoded_message, node_number):
    key = ensure_aes_key(key)
    mesh_packet.channel = generate_hash(channel, key)
    key_bytes = base64.b64decode(key.encode('ascii'))
    nonce_packet_id = mesh_packet.id.to_bytes(8, "little")
    nonce_from_node = node_number.to_bytes(8, "little")
    nonce = nonce_packet_id + nonce_from_node
    cipher = Cipher(algorithms.AES(key_bytes), modes.CTR(nonce), backend=default_backend())
    encryptor = cipher.encryptor()
    encrypted_bytes = encryptor.update(encoded_message.SerializeToString()) + encryptor.finalize()
    return encrypted_bytes


def decrypt_packet(mp, key: str):
    key = ensure_aes_key(key)
    try:
        key_bytes = base64.b64decode(key.encode('ascii'))
        nonce_packet_id = getattr(mp, "id").to_bytes(8, "little")
        nonce_from_node = getattr(mp, "from").to_bytes(8, "little")
        nonce = nonce_packet_id + nonce_from_node
        cipher = Cipher(algorithms.AES(key_bytes), modes.CTR(nonce), backend=default_backend())
        decryptor = cipher.decryptor()
        bytes_ = decryptor.update(getattr(mp, "encrypted")) + decryptor.finalize()
        data = mesh_pb2.Data()
        data.ParseFromString(bytes_)
        logging.info(f"[Decrypt] Decrypted data: {data}")
        return data
    except Exception as e:
        logging.info(f"[Decrypt] Error: {e}")
        return None
