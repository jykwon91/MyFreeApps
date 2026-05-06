"""Demo-account orchestration.

This module is the single entry point for demo-account lifecycle:
creating, listing, deleting. The admin-gated routes in ``app.api.demo``
delegate here.

What's HERE:

  - Generate a fresh email + password if the operator didn't supply one.
  - Hash the password via the same ``PasswordHelper`` fastapi-users
    uses for real signups, so the resulting row is indistinguishable
    from a real one (apart from ``is_demo=True``).
  - Drive the seed data: profile, work history, education, skills,
    one ``resume_upload_jobs`` row in status=complete, three companies,
    four applications across the typical pipeline stages.
  - Translate repository LookupErrors into the ``LookupError`` /
    ``ValueError`` shape the route layer maps to 404 / 409.

What's NOT here:

  - Direct DB mutation (``db.add`` / ``db.execute``). All persistence
    goes through ``app.repositories.demo.demo_repository``.
  - Permission gating. The route layer applies ``require_admin``;
    this service trusts that the caller has already been authorised.

Mirrors the MBK demo service shape but adapted for MJH's per-user (no
org) data model.
"""
from __future__ import annotations

import logging
import uuid

from fastapi_users.password import PasswordHelper

from app.db.session import unit_of_work
from app.repositories.demo import demo_repository as demo_repo
from app.schemas.demo.demo import (
    DemoCreateResponse,
    DemoCredentials,
    DemoDeleteResponse,
    DemoUserListResponse,
    DemoUserSummary,
)
from app.services.demo.demo_constants import (
    DEMO_APPLICATIONS,
    DEMO_COMPANIES,
    DEMO_DEFAULT_DISPLAY_NAME,
    DEMO_EDUCATION,
    DEMO_PROFILE,
    DEMO_RESUME_CONTENT_TYPE,
    DEMO_RESUME_FILENAME,
    DEMO_SKILLS,
    DEMO_WORK_HISTORY,
    generate_demo_password,
    make_demo_email,
    make_resume_object_key,
    make_resume_parsed_fields,
)

logger = logging.getLogger(__name__)

_password_helper = PasswordHelper()
_DEMO_PARSER_VERSION = "demo-seed-v1"


async def create_demo_user(
    *,
    email: str | None = None,
    display_name: str | None = None,
) -> DemoCreateResponse:
    """Create a fully-seeded demo user account.

    The operation runs in a single ``unit_of_work`` transaction so the
    user, profile, work history, skills, companies, applications, and
    events all commit together — or none of them do. A partial demo
    account is worse than none at all, since the demo would render
    half-empty screens that look like bugs to a stranger.

    Args:
        email: Optional override. When ``None`` the service auto-
            generates ``demo+<uuid>@myjobhunter.local``.
        display_name: Optional override. When ``None`` the service
            uses ``DEMO_DEFAULT_DISPLAY_NAME``.

    Raises:
        ValueError: When ``email`` is supplied and already exists in
            ``users``. The route layer maps this to HTTP 409.
    """
    final_email = (email or make_demo_email()).strip().lower()
    final_display_name = (display_name or DEMO_DEFAULT_DISPLAY_NAME).strip()
    if not final_display_name:
        final_display_name = DEMO_DEFAULT_DISPLAY_NAME

    password = generate_demo_password()
    hashed = _password_helper.hash(password)

    async with unit_of_work() as db:
        existing = await demo_repo.get_user_by_email(db, final_email)
        if existing is not None:
            raise ValueError(
                f"A user with email '{final_email}' already exists. "
                "Pick a different email or delete the existing account first."
            )

        user = await demo_repo.create_demo_user(
            db,
            email=final_email,
            hashed_password=hashed,
            display_name=final_display_name,
        )

        profile = await demo_repo.create_profile(
            db, user_id=user.id, seed=DEMO_PROFILE,
        )
        await demo_repo.create_work_history(
            db, user_id=user.id, profile_id=profile.id, seeds=DEMO_WORK_HISTORY,
        )
        await demo_repo.create_education(
            db, user_id=user.id, profile_id=profile.id, seeds=DEMO_EDUCATION,
        )
        await demo_repo.create_skills(
            db, user_id=user.id, profile_id=profile.id, seeds=DEMO_SKILLS,
        )
        await demo_repo.create_resume_upload_job(
            db,
            user_id=user.id,
            profile_id=profile.id,
            file_path=make_resume_object_key(),
            file_filename=DEMO_RESUME_FILENAME,
            file_content_type=DEMO_RESUME_CONTENT_TYPE,
            parsed_fields=make_resume_parsed_fields(),
            parser_version=_DEMO_PARSER_VERSION,
        )

        companies = await demo_repo.create_companies(
            db, user_id=user.id, seeds=DEMO_COMPANIES,
        )
        company_ids = [c.id for c in companies]
        await demo_repo.create_applications_with_events(
            db,
            user_id=user.id,
            company_ids=company_ids,
            seeds=DEMO_APPLICATIONS,
        )

        user_id = user.id

    logger.info(
        "DEMO_ACTION created demo user user_id=%s email=%s",
        user_id, final_email,
    )

    return DemoCreateResponse(
        message=f"Demo user '{final_display_name}' created with seed data.",
        credentials=DemoCredentials(email=final_email, password=password),
        user_id=user_id,
    )


async def list_demo_users() -> DemoUserListResponse:
    """Return every demo user with summary counts.

    Order is most-recently-created first so the operator's freshly-
    created demo lands at the top of the table.
    """
    async with unit_of_work() as db:
        rows = await demo_repo.list_demo_user_summaries(db)

    summaries = [DemoUserSummary(**row) for row in rows]
    return DemoUserListResponse(users=summaries, total=len(summaries))


async def delete_demo_user(user_id: uuid.UUID) -> DemoDeleteResponse:
    """Delete a demo user and every cascade-able row they own.

    The repository's ``delete_demo_user_cascade`` enforces ``is_demo=True``
    at the SQL layer — the service-layer pre-check + the SQL guard are
    belt and braces against ever wiping a real account.

    Raises:
        LookupError: When the id doesn't match a ``is_demo=True`` row.
            The route layer maps this to HTTP 404.
    """
    async with unit_of_work() as db:
        target = await demo_repo.get_demo_user_by_id(db, user_id)
        if target is None:
            raise LookupError(
                f"No demo user with id {user_id} exists. "
                "It may have already been deleted, or the id refers to "
                "a real (non-demo) account."
            )
        await demo_repo.delete_demo_user_cascade(db, user_id=user_id)

    logger.info("DEMO_ACTION deleted demo user user_id=%s", user_id)
    return DemoDeleteResponse(
        message=f"Demo user {user_id} deleted successfully.",
    )
