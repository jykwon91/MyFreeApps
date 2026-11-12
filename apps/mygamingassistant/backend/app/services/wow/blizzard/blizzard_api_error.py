"""Blizzard's API couldn't answer: why, with its own error code when it sent one."""


class BlizzardApiError(Exception):
    def __init__(self, reason: str, *, status_code: int | None = None, code: str | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        # The HTTP status when Blizzard answered; None for network / parse / config failures.
        self.status_code = status_code
        # Blizzard's own error code when it sent one: the API's ``type``
        # (e.g. ``BLZWEBAPI00000404``) or the OAuth ``error`` (e.g. ``invalid_client``).
        self.code = code

    def summary(self) -> str:
        parts = [f"HTTP {self.status_code}" if self.status_code is not None else None, self.code]
        prefix = " ".join(p for p in parts if p)
        return f"{prefix}: {self.reason}" if prefix else self.reason
