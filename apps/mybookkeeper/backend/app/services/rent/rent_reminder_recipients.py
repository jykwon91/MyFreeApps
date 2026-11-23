"""Where one tenant's rent reminder goes, worked out once per send."""
from __future__ import annotations

from dataclasses import dataclass

from platform_shared.services.phone_number import to_e164

from app.core.security import phone_lookup_hash

_SMS = "sms"


@dataclass(frozen=True)
class ReminderRecipients:
    """The tenant's addresses as on file, and the number a text goes to.

    ``sms_to`` is the number as texted (E.164), or ``None`` when there is no
    number or it can't be texted. ``phone_hash`` is its lookup code, stored on
    the text's row so the tenant's reply can be matched to it. Both come from
    the same ``to_e164`` result, so the stored code is always the code of the
    number that was texted.
    """

    email: str | None
    phone: str | None
    sms_to: str | None
    phone_hash: str | None

    @classmethod
    def for_tenant(cls, *, email: str | None, phone: str | None) -> ReminderRecipients:
        sms_to = to_e164(phone)
        phone_hash = None
        if sms_to is not None:
            phone_hash = phone_lookup_hash(sms_to)
        return cls(email=email, phone=phone, sms_to=sms_to, phone_hash=phone_hash)

    def phone_hash_for(self, channel: str) -> str | None:
        """The lookup code to store on ``channel``'s row. Only a text has one."""
        if channel != _SMS:
            return None
        return self.phone_hash
