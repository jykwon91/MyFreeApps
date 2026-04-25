"""Demo user management — create, reset, delete, and list."""

import logging
import uuid

from fastapi_users.password import PasswordHelper

from app.core.config import settings
from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories.demo import demo_repo
from app.schemas.demo.demo import (
    DemoCreateResponse,
    DemoCredentials,
    DemoDeleteResponse,
    DemoResetResponse,
    DemoUserListResponse,
    DemoUserSummary,
)
from app.services.demo.demo_constants import (
    DEMO_DOCUMENTS,
    DEMO_PROPERTIES,
    DEMO_TAX_DOCUMENTS,
    DEMO_TRANSACTIONS,
    generate_demo_password,
    make_demo_display_name,
    make_demo_email,
    make_demo_org_name,
)
from app.services.demo.demo_email_service import send_demo_invite
from app.services.demo.demo_pdf_generator import DemoDocumentPdfGenerator, DemoTaxPdfGenerator
from app.services.tax import tax_recompute_service

logger = logging.getLogger(__name__)

_password_helper = PasswordHelper()
_tax_pdf_generator = DemoTaxPdfGenerator()
_doc_pdf_generator = DemoDocumentPdfGenerator()


async def create_demo_user(
    tag: str,
    recipient_email: str | None = None,
) -> DemoCreateResponse:
    """Create a tagged demo user, org, properties, transactions, documents, and tax return."""
    email = make_demo_email(tag)
    org_name = make_demo_org_name(tag)
    display_name = make_demo_display_name(tag)

    async with unit_of_work() as db:
        existing = await demo_repo.get_user_by_email(db, email)
        if existing:
            raise ValueError(f"Demo user with tag '{tag}' already exists. Use reset instead.")

        password = generate_demo_password()
        hashed = _password_helper.hash(password)
        user = await demo_repo.create_user(db, email, hashed, display_name)
        org = await demo_repo.create_org_with_member(
            db, org_name, user.id, is_demo=True, demo_tag=tag,
        )
        await demo_repo.create_tax_profile(db, org.id)
        property_ids = await demo_repo.create_properties(db, user.id, org.id, DEMO_PROPERTIES)
        transactions = await demo_repo.create_transactions(
            db, user.id, org.id, property_ids, DEMO_TRANSACTIONS,
        )
        await demo_repo.create_documents_with_links(
            db, user.id, org.id, property_ids, DEMO_PROPERTIES,
            transactions, DEMO_DOCUMENTS, _doc_pdf_generator,
        )
        tax_docs = await demo_repo.create_tax_documents(
            db, user.id, org.id, property_ids, DEMO_TAX_DOCUMENTS, _tax_pdf_generator,
        )
        tax_return = await demo_repo.create_tax_return(db, org.id)
        await demo_repo.create_tax_form_instances(
            db, tax_return.id, tax_docs, DEMO_TAX_DOCUMENTS,
        )
        org_id = org.id
        tax_return_id = tax_return.id

    # Recompute outside the seed transaction — populates Schedule E and
    # other computed forms from the 322 transactions.
    await tax_recompute_service.recompute(org_id, tax_return_id)

    email_sent = False
    if recipient_email:
        app_url = settings.app_url or settings.frontend_url or "https://mybookkeeper.app"
        email_sent = send_demo_invite(
            recipient_email=recipient_email,
            display_name=tag,
            login_email=email,
            password=password,
            app_url=app_url,
        )

    logger.info("DEMO_ACTION created tagged demo user tag=%s email_sent=%s", tag, email_sent)
    return DemoCreateResponse(
        message=f"Demo user '{tag}' created with seed data",
        credentials=DemoCredentials(email=email, password=password),
        email_sent=email_sent,
    )


async def list_demo_users() -> DemoUserListResponse:
    """Return all demo users with their org and upload counts."""
    async with AsyncSessionLocal() as db:
        users_data = await demo_repo.list_demo_users(db)

    users = [DemoUserSummary(**item) for item in users_data]
    return DemoUserListResponse(users=users, total=len(users))


async def delete_demo_user(user_id: uuid.UUID) -> DemoDeleteResponse:
    """Permanently delete a demo user and all their data."""
    async with AsyncSessionLocal() as db:
        user = await demo_repo.get_user_by_id(db, user_id)
        if not user:
            raise LookupError(f"User {user_id} not found")
        org = await demo_repo.get_org_by_user(db, user_id)
        if not org:
            raise LookupError(f"No organization found for user {user_id}")
        if not org.is_demo:
            raise ValueError(f"User {user_id} does not belong to a demo organization")
        org_id = org.id

    async with unit_of_work() as db:
        await demo_repo.delete_demo_user_completely(db, user_id, org_id)

    logger.info("DEMO_ACTION deleted demo user user_id=%s org_id=%s", user_id, org_id)
    return DemoDeleteResponse(message=f"Demo user {user_id} deleted successfully")


async def reset_demo_user(user_id: uuid.UUID) -> DemoResetResponse:
    """Wipe and re-seed a specific demo user's data, generating a new password."""
    async with AsyncSessionLocal() as db:
        user = await demo_repo.get_user_by_id(db, user_id)
        if not user:
            raise LookupError(f"User {user_id} not found")
        org = await demo_repo.get_org_by_user(db, user_id)
        if not org:
            raise LookupError(f"No organization found for user {user_id}")
        if not org.is_demo:
            raise ValueError(f"User {user_id} does not belong to a demo organization")
        tag = org.demo_tag or ""
        email = user.email
        org_id = org.id

    async with unit_of_work() as db:
        await demo_repo.delete_all_demo_data(db, user_id, org_id)

    async with unit_of_work() as db:
        password = generate_demo_password()
        hashed = _password_helper.hash(password)
        existing_user = await demo_repo.get_user_by_id(db, user_id)
        if existing_user:
            existing_user.hashed_password = hashed
        property_ids = await demo_repo.create_properties(db, user_id, org_id, DEMO_PROPERTIES)
        transactions = await demo_repo.create_transactions(
            db, user_id, org_id, property_ids, DEMO_TRANSACTIONS,
        )
        await demo_repo.create_documents_with_links(
            db, user_id, org_id, property_ids, DEMO_PROPERTIES,
            transactions, DEMO_DOCUMENTS, _doc_pdf_generator,
        )
        tax_docs = await demo_repo.create_tax_documents(
            db, user_id, org_id, property_ids, DEMO_TAX_DOCUMENTS, _tax_pdf_generator,
        )
        tax_return = await demo_repo.create_tax_return(db, org_id)
        await demo_repo.create_tax_form_instances(
            db, tax_return.id, tax_docs, DEMO_TAX_DOCUMENTS,
        )
        tax_return_id = tax_return.id

    await tax_recompute_service.recompute(org_id, tax_return_id)

    logger.info("DEMO_ACTION reset tagged demo user user_id=%s tag=%s", user_id, tag)
    return DemoResetResponse(
        message=f"Demo user '{tag}' reset successfully",
        email=email,
        password=password,
    )
