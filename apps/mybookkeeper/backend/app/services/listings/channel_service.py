"""Channel catalogue service — the shared, tenant-independent list of channels.

Separate from ``channel_listing_service`` (which manages per-listing
(listing, channel) pairs): the catalogue is public reference data that powers
the "Add channel" dropdown.
"""
from app.db.session import AsyncSessionLocal
from app.repositories import channel_repo
from app.schemas.listings.channel_response import ChannelResponse


async def list_channels() -> list[ChannelResponse]:
    """Return every channel known to the system."""
    async with AsyncSessionLocal() as db:
        rows = await channel_repo.list_all(db)
    return [ChannelResponse.model_validate(row) for row in rows]
