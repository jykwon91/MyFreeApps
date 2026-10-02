"""Files on an interaction's reply — :class:`DiscordRestClient`'s method for them.

A mixin the client inherits, kept apart so ``client.py`` stays small.  Discord
takes attachments as ``multipart/form-data``: the message JSON goes in a
``payload_json`` part, each file in a ``files[n]`` part, and the payload's
``attachments`` list names each file by its ``n``.  A refusal raises
``DiscordApiError`` with Discord's ``code``; a channel where the bot can't
attach files answers ``MISSING_PERMISSIONS`` (50013).

https://discord.com/developers/docs/reference#uploading-files
https://discord.com/developers/docs/interactions/receiving-and-responding#edit-original-interaction-response
"""
import json
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import httpx


@dataclass(frozen=True)
class DiscordFile:
    """One file to attach: the name Discord shows, its bytes, and their media type."""

    filename: str
    content: bytes
    content_type: str = "text/csv; charset=utf-8"


class InteractionFiles:
    """Editing an interaction's original response with files attached."""

    if TYPE_CHECKING:

        async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response: ...

        def _raise_for_status(self, resp: httpx.Response, route: str) -> None: ...

        @staticmethod
        def _safe_payload(payload: dict[str, Any]) -> dict[str, Any]: ...

    async def edit_original_interaction_response_with_files(
        self,
        application_id: str,
        interaction_token: str,
        payload: dict[str, Any],
        files: Sequence[DiscordFile],
    ) -> dict[str, Any]:
        """PATCH /webhooks/{application_id}/{interaction_token}/messages/@original as multipart.

        *payload* is the message (``allowed_mentions`` defaults to none, as on
        every message this client sends); *files* become its attachments, in
        order.  The bytes are in memory, so a 429 retry sends the same parts
        again.
        """
        path = f"/webhooks/{application_id}/{interaction_token}/messages/@original"
        message = {
            **self._safe_payload(payload),
            "attachments": [{"id": index, "filename": file.filename} for index, file in enumerate(files)],
        }
        parts = {
            f"files[{index}]": (file.filename, file.content, file.content_type) for index, file in enumerate(files)
        }
        resp = await self._request("PATCH", path, data={"payload_json": json.dumps(message)}, files=parts)
        self._raise_for_status(resp, path)
        result = resp.json()
        assert result is not None, "edit_original_interaction_response_with_files must return a message"
        return result
