"""TypedDicts for Gmail API data shapes and email processing results."""

from typing import Literal, TypedDict


class EmailBodyData(TypedDict):
    subject: str
    body: str


class EmailSource(TypedDict, total=False):
    attachment_id: str
    filename: str | None
    content_type: str


class EmailSourcesData(TypedDict):
    subject: str
    from_address: str | None
    headers: dict[str, str]
    body_preview: str | None
    sources: list[EmailSource]


class Attachment(TypedDict):
    filename: str
    content_type: str
    data: bytes


class ParsedEml(TypedDict):
    body: str | None
    attachments: list[Attachment]


# -- Email processor operation results --

type DiscoverStatus = Literal["skipped", "nothing_new", "queued"]
type FetchStatus = Literal["fetched", "nothing_to_fetch", "failed"]
type ExtractStatus = Literal["done", "nothing_to_extract", "failed"]


class DiscoverResultDict(TypedDict, total=False):
    status: str
    reason: str
    count: int
    sync_log_id: int


class DiscoverResult:
    __slots__ = ("status", "reason", "count", "sync_log_id")

    def __init__(
        self,
        status: DiscoverStatus,
        *,
        reason: str | None = None,
        count: int = 0,
        sync_log_id: int | None = None,
    ) -> None:
        self.status = status
        self.reason = reason
        self.count = count
        self.sync_log_id = sync_log_id

    def to_dict(self) -> DiscoverResultDict:
        d = DiscoverResultDict(status=self.status)
        if self.reason is not None:
            d["reason"] = self.reason
        if self.count:
            d["count"] = self.count
        if self.sync_log_id is not None:
            d["sync_log_id"] = self.sync_log_id
        return d


class FetchResult:
    __slots__ = ("status", "error")

    def __init__(self, status: FetchStatus, *, error: str | None = None) -> None:
        self.status = status
        self.error = error


class ExtractResult:
    __slots__ = ("status", "records_added", "error")

    def __init__(
        self,
        status: ExtractStatus,
        *,
        records_added: int = 0,
        error: str | None = None,
    ) -> None:
        self.status = status
        self.records_added = records_added
        self.error = error
