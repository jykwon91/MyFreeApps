"""The keys a remembered personal-transfer sender is stored and compared under.

Payment notifications spell one sender several ways ("DAO NGUYEN" in a Zelle
memo, "Dao  Nguyen" in the extracted name), so names are lower-cased with
runs of whitespace collapsed. Handles (Zelle email or phone, Venmo @user) are
lower-cased and trimmed; the empty string means the payment showed none.
"""


def normalize_sender_name(payer_name: str | None) -> str:
    return " ".join((payer_name or "").lower().split())


def normalize_sender_handle(payer_handle: str | None) -> str:
    return (payer_handle or "").lower().strip()
