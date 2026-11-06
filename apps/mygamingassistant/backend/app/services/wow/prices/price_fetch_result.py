"""What a price provider's fetch returned: new prices, or "nothing changed"."""
from dataclasses import dataclass, field

from app.services.wow.prices.provider_price import ProviderPrice


@dataclass(frozen=True)
class PriceFetchResult:
    # True on a 304 (or the provider's equivalent): keep what's stored.
    not_modified: bool
    prices: list[ProviderPrice] = field(default_factory=list)
    # Validators to send next time (HTTP ETag / Last-Modified), when the source has them.
    etag: str | None = None
    last_modified: str | None = None
