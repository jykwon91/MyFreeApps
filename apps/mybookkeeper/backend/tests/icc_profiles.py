"""Builds a minimal Display P3 matrix/TRC ICC profile (primaries only, gamma 2.2) for colour tests."""
from __future__ import annotations

import struct


def _s15(value: float) -> bytes:
    return struct.pack(">i", round(value * 65536))


def _xyz(x: float, y: float, z: float) -> bytes:
    return b"XYZ \0\0\0\0" + _s15(x) + _s15(y) + _s15(z)


def _gamma(gamma: float) -> bytes:
    return b"curv\0\0\0\0" + struct.pack(">IH", 1, round(gamma * 256))


def _description(text: str) -> bytes:
    ascii_text = text.encode() + b"\0"
    return b"desc\0\0\0\0" + struct.pack(">I", len(ascii_text)) + ascii_text + b"\0" * 77


def display_p3_profile() -> bytes:
    tags = [
        (b"desc", _description("Test Display P3")),
        (b"wtpt", _xyz(0.9642, 1.0, 0.8249)),
        (b"rXYZ", _xyz(0.5151, 0.2412, -0.0011)),
        (b"gXYZ", _xyz(0.2920, 0.6922, 0.0419)),
        (b"bXYZ", _xyz(0.1571, 0.0666, 0.7841)),
        (b"rTRC", _gamma(2.2)),
        (b"gTRC", _gamma(2.2)),
        (b"bTRC", _gamma(2.2)),
        (b"cprt", b"text\0\0\0\0test profile\0"),
    ]
    table, body = b"", b""
    data_start = 128 + 4 + 12 * len(tags)
    for signature, data in tags:
        table += signature + struct.pack(">II", data_start + len(body), len(data))
        body += data + b"\0" * (-len(data) % 4)
    header = struct.pack(">I4sI4s4s4s", data_start + len(body), b"\0\0\0\0", 0x02100000, b"mntr", b"RGB ", b"XYZ ")
    header += b"\0" * 12 + b"acsp" + b"\0" * 28
    header += _s15(0.9642) + _s15(1.0) + _s15(0.8249)
    return header.ljust(128, b"\0") + struct.pack(">I", len(tags)) + table + body
