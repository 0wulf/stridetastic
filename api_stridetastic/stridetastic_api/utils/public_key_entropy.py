from __future__ import annotations

import base64
import binascii
import hashlib
from typing import Optional

LOW_ENTROPY_HASHES: tuple[bytes, ...] = (
    bytes.fromhex("f47ecc17e6b4a322eceed9084f3963ea8075e124ce05366963b2cbc028d3348b"),
    bytes.fromhex("5a9ea2a68aa666c15f550064a3a6fe71c0bb82c3323d7a7ae36efdddad3a66b9"),
    bytes.fromhex("b3df3b2e67b6d5f8df762c455e2ebd16c5f867aa15f8920bdf5a6650ac0dbb2f"),
    bytes.fromhex("3b8f863a381f7739a94eef91185a62e1aa9d36eace60358d9d1ff4b8c9136a5d"),
    bytes.fromhex("367e2de1845f425229110a2564546a6bfdb665ff151a5171224057f6919b6458"),
    bytes.fromhex("1677eba45291fb26cf8fd7d9d15dc4687375edc59558ee9056d42f3129f78c1f"),
    bytes.fromhex("318ca95eed3c12bf979c478e989dc23e86239029c8b020f8b1b0aa192acf0a54"),
    bytes.fromhex("a48a990e51dc1220f313f52b3ae24342c65298cdbbcab131a0d4d630f327fb49"),
    bytes.fromhex("d23f138d22048d075958a0f955cf30a02e2fca8020e4dea1add958b3432b2270"),
    bytes.fromhex("4041ec6ad2d603e49a9ebd6c0a9b75a4bcab6fa795ff2df6e9b9ab4c0c1cd03b"),
    bytes.fromhex("2249322b00f922fa1702e96482f04d1bc704fcdc8c5eb6d916d637ce59aa0949"),
    bytes.fromhex("486f1e48978864ace8eb30a3c3e1cf9739a6555b5fbf18b73adfa875e79de01e"),
    bytes.fromhex("09b4e26d2898c9476646bfff581791aac3bf4a9d0b88b1f103dd61d7ba9e6498"),
    bytes.fromhex("393984e0222f7d78451872b413d2012f3ca1b0fe39d0f13c72d6ef54d57722a0"),
    bytes.fromhex("0ada5fecff5cc02e5fc48d03e58059d35d4986e98df6f616353df99b29559e64"),
    bytes.fromhex("0856f0d7ef77d6111c8f952d3cdfb122bf609be5a9c06e4b01dcd15744b2a5cf"),
    bytes.fromhex("2cb27785d6b7489cfebc802660f46dce1131a21e330a6d2b00fa0c90958f5c6b"),
    bytes.fromhex("fa59c86e94ee75c99ab0fe893640c9994a3bf4aa1224a20ff9d108cb7819aae5"),
    bytes.fromhex("6e427a4a8c616222a189d3a4c219a38353a77a0a89e25452623de7ca8cf66a60"),
    bytes.fromhex("20272fba0c99d729f31135899d0e24a1c3cbdf8af1c6fed0d79f92d68f59bfe4"),
    bytes.fromhex("9170b47cfbffa0596a251ca99ee943815d74b1b10928004aafe3fca94e27764c"),
    bytes.fromhex("85fe7cecb67874c3ece1327fb0b70274f923d8e7fa14e6ee6644b18ca52f7ed2"),
    bytes.fromhex("8e66657b3b6f7ecc57b457eacc83f5aaf765a3ce937213c1b6467b2945b5c893"),
    bytes.fromhex("cc11fb1aaba131876ac6de8887a9b95937828db2ccd897409a5c8f4055cb4c3e"),
)

LOW_ENTROPY_HASH_SET = frozenset(LOW_ENTROPY_HASHES)


def _decode_public_key_material(public_key: str) -> bytes:
    """Best-effort decoding for public key material."""
    stripped = public_key.strip()
    if not stripped:
        return public_key.encode("utf-8", "ignore")

    try:
        return base64.b64decode(stripped, validate=True)
    except (binascii.Error, ValueError):
        pass

    hex_candidate = stripped.replace(":", "").replace("-", "")
    if (
        hex_candidate
        and len(hex_candidate) % 2 == 0
        and all(ch in "0123456789abcdefABCDEF" for ch in hex_candidate)
    ):
        try:
            return bytes.fromhex(hex_candidate)
        except ValueError:
            pass

    return stripped.encode("utf-8", "ignore")


def _hash_material(material: bytes) -> bytes:
    return hashlib.sha256(material).digest()


def is_low_entropy_public_key(public_key: Optional[str]) -> bool:
    if not public_key:
        return False

    material = _decode_public_key_material(public_key)
    if not material:
        return False

    return _hash_material(material) in LOW_ENTROPY_HASH_SET
