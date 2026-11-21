"""A local HTTP server that answers every request with one fixed S3-style reply.

Lets tests drive the real minio-py client and urllib3 retry stack, through
public APIs only, against a MinIO that is failing in a chosen way.
"""
from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from tests.fake_s3_reply import FakeS3Reply


def s3_error_xml(code: str, message: str = "error") -> bytes:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<Error><Code>{code}</Code><Message>{message}</Message>"
        "<Resource>/bucket/key</Resource><RequestId>req-1</RequestId></Error>"
    ).encode()


class _ReplyHandler(BaseHTTPRequestHandler):
    def __init__(self, reply: FakeS3Reply, *args: Any) -> None:
        self._reply = reply
        super().__init__(*args)

    def _answer(self) -> None:
        reply = self._reply
        length = int(self.headers.get("Content-Length") or 0)
        if length:
            self.rfile.read(length)
        reply.requests.append(self.command)
        self.send_response(reply.status)
        self.send_header("Content-Type", reply.content_type)
        self.send_header("Content-Length", str(len(reply.body)))
        for name, value in reply.headers.items():
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(reply.body)

    do_GET = do_PUT = do_DELETE = do_HEAD = do_POST = _answer

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        pass


@contextmanager
def fake_s3_server(reply: FakeS3Reply) -> Iterator[str]:
    """Serve ``reply`` to every request; yields the ``host:port`` endpoint."""
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(_ReplyHandler, reply))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
