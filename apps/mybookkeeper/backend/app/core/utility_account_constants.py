"""Utility-account-link constants.

``PROVIDER_LABELS`` maps a learned ``sender_domain`` (registrable domain,
sub-mailer-collapsed) to a human-readable provider name stored on the
``utility_account_link`` row for display. A domain not in this map yields a
null ``provider_label`` — the link still works (the lookup key is the domain +
account number), it just lacks a friendly name until the map is extended.

Validated against real notification senders:
  - AT&T:                  update@emailff.att-mail.com, update@emaildl.att-mail.com
  - CenterPoint:           centerpoint.energy@tmr3.com
  - City of Houston Water: cityofhoustonwaterbill@houstontx.gov
"""

PROVIDER_LABELS: dict[str, str] = {
    "att-mail.com": "AT&T",
    "tmr3.com": "CenterPoint",
    "houstontx.gov": "City of Houston Water",
}
