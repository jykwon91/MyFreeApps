"""A price provider couldn't give us prices. The stored ones stay."""


class PriceFetchError(Exception):
    def __init__(self, reason: str, *, status_code: int | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        # The HTTP status when the source answered; None for network / parse failures.
        self.status_code = status_code

    def summary(self) -> str:
        if self.status_code is None:
            return self.reason
        return f"HTTP {self.status_code}: {self.reason}"
