"""Two-factor operations for this app: the shared service, bound to its user model.

MyBookkeeper stores the secret and recovery codes as per-user ciphertext, so it
passes its own encrypt and decrypt.
"""
import uuid

from platform_shared.services.totp_account_service import TotpAccountService
from platform_shared.services.totp_service import decrypt_for_user, encrypt_for_user

from app.core.config import settings
from app.db.session import unit_of_work
from app.models.user.user import User

# Part of every enrolled QR code, so it must stay stable.
_TOTP_ISSUER = "MyBookkeeper"


def _encrypt(value: str, user_id: uuid.UUID) -> str:
    return encrypt_for_user(value, settings.encryption_key, user_id)


def _decrypt(value: str, user_id: uuid.UUID) -> str:
    return decrypt_for_user(value, settings.encryption_key, user_id)


accounts = TotpAccountService(
    user_model=User,
    issuer=_TOTP_ISSUER,
    # Lambda for late lookup so tests patching `unit_of_work` take effect.
    unit_of_work_factory=lambda: unit_of_work(),
    encrypt=_encrypt,
    decrypt=_decrypt,
)

setup_totp = accounts.setup_totp
confirm_totp = accounts.confirm_totp
disable_totp = accounts.disable_totp
validate_totp_for_login = accounts.validate_totp_for_login
verify_totp_code = accounts.verify_totp_code
