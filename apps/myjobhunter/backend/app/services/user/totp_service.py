"""Two-factor operations for this app: the shared service, bound to its user model."""
from platform_shared.services.totp_account_service import TotpAccountService

from app.core.config import settings
from app.db.session import unit_of_work
from app.models.user.user import User

accounts = TotpAccountService(
    user_model=User,
    issuer=settings.totp_issuer,
    # Lambda for late lookup so tests patching `unit_of_work` take effect.
    unit_of_work_factory=lambda: unit_of_work(),
)

setup_totp = accounts.setup_totp
confirm_totp = accounts.confirm_totp
disable_totp = accounts.disable_totp
validate_totp_for_login = accounts.validate_totp_for_login
verify_totp_code = accounts.verify_totp_code
