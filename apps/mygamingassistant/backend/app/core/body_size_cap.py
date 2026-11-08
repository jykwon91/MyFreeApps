"""ASGI middleware capping the request body of ONE route before anything parses it.

FastAPI reads and parses the JSON body before route dependencies run, so a
size check in the route is too late: the whole body is already in memory and
decoded. This reads at most ``max_bytes + 1`` bytes from the socket for the
given path — answering 413 with a fixed code as soon as ``Content-Length`` or
the bytes received say it's too big — then replays the buffered body to the
app. Other paths pass straight through.
"""
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

from starlette.responses import JSONResponse

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

_CONTENT_LENGTH = b"content-length"


def _path_without_root(scope: Scope) -> str:
    path = scope.get("path", "")
    root_path = scope.get("root_path", "")
    if root_path and path.startswith(root_path):
        return path[len(root_path) :]
    return path


def _declared_length(scope: Scope) -> int | None:
    for name, value in scope.get("headers", []):
        if name.lower() == _CONTENT_LENGTH:
            try:
                return int(value)
            except ValueError:
                return None
    return None


class BodySizeCapMiddleware:
    def __init__(self, app: ASGIApp, *, path: str, max_bytes: int, detail: str) -> None:
        self.app = app
        self.path = path
        self.max_bytes = max_bytes
        self.detail = detail

    async def _too_large(self, scope: Scope, receive: Receive, send: Send) -> None:
        await JSONResponse({"detail": self.detail}, status_code=413)(scope, receive, send)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http" or _path_without_root(scope) != self.path:
            await self.app(scope, receive, send)
            return
        declared = _declared_length(scope)
        if declared is not None and declared > self.max_bytes:
            await self._too_large(scope, receive, send)
            return
        chunks: list[bytes] = []
        received = 0
        more_body = True
        while more_body:
            message = await receive()
            if message.get("type") != "http.request":
                # Client went away; let the app see the disconnect.
                await self.app(scope, _replay([], message, receive), send)
                return
            chunk = message.get("body", b"")
            received += len(chunk)
            if received > self.max_bytes:
                await self._too_large(scope, receive, send)
                return
            chunks.append(chunk)
            more_body = bool(message.get("more_body", False))
        await self.app(scope, _replay(chunks, None, receive), send)


def _replay(chunks: list[bytes], pending: Message | None, receive: Receive) -> Receive:
    """A ``receive`` that hands the buffered body over once, then defers to the real one."""
    sent = False

    async def replay() -> Message:
        nonlocal sent
        if not sent:
            sent = True
            if pending is not None:
                return pending
            return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
        return await receive()

    return replay
