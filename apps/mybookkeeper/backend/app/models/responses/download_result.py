from dataclasses import dataclass


@dataclass
class DownloadResult:
    content: bytes
    media_type: str
    disposition: str
