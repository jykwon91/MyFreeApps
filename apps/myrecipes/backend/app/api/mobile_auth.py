"""Mobile sign-in routes. The routes live in ``platform_shared``."""
from fastapi import Depends
from platform_shared.api.mobile_auth_router import build_mobile_auth_router
from platform_shared.services.refresh_session_service import RefreshSessionService

from app.core.auth import current_active_user, get_user_manager
from app.core.config import settings
from app.core.rate_limit import (
    check_login_rate_limit,
    check_totp_account_not_locked,
    check_totp_rate_limit,
)
from app.db.session import get_db, unit_of_work
from app.models.user.refresh_session import RefreshSession
from app.models.user.user import User
from app.services.user import totp_service

router = build_mobile_auth_router(
    secret_key=settings.secret_key,
    session_service=RefreshSessionService(
        session_model=RefreshSession, user_model=User, signing_key=settings.secret_key,
        unit_of_work_factory=unit_of_work,
    ),
    current_active_user=current_active_user,
    get_user_manager=get_user_manager,
    get_db=get_db,
    totp_service=totp_service,
    login_dependencies=[
        Depends(check_login_rate_limit),
        Depends(check_totp_rate_limit),
        Depends(check_totp_account_not_locked),
    ],
)
