"""TOTP enrollment and login routes. The routes live in ``platform_shared``."""
from fastapi import Depends
from platform_shared.api.totp_router import build_totp_router

from app.core.auth import current_active_user, get_jwt_strategy, get_user_manager
from app.core.rate_limit import (
    check_login_rate_limit,
    check_totp_account_not_locked,
    check_totp_rate_limit,
)
from app.db.session import get_db
from app.services.user import totp_service

router = build_totp_router(
    current_active_user=current_active_user,
    get_user_manager=get_user_manager,
    get_db=get_db,
    get_jwt_strategy=get_jwt_strategy,
    totp_service=totp_service,
    login_dependencies=[
        Depends(check_login_rate_limit),
        Depends(check_totp_rate_limit),
        Depends(check_totp_account_not_locked),
    ],
)
