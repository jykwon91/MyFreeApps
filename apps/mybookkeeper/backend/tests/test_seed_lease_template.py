"""The test-only lease-template seed stores its file the way a real upload does.

Endpoints such as suggest-placeholders download the template's file from
object storage, so a seeded template must have a real object behind its file
row, and deleting the template must remove that object.
"""
from contextlib import asynccontextmanager
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.context import RequestContext
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.repositories.leases import lease_template_file_repo, lease_template_repo
from app.test_helpers.seed import (
    _SeedLeaseTemplateRequest,
    hard_delete_lease_template,
    seed_lease_template,
)

SOURCE_TEXT = "Tenant: [TENANT FULL NAME]\nRent: [MONTHLY RENT]\n"


@pytest.fixture()
def objects() -> dict[str, bytes]:
    return {}


@pytest.fixture()
def storage(objects: dict[str, bytes]) -> MagicMock:
    fake = MagicMock()
    fake.upload_file.side_effect = lambda key, content, _ct: objects.__setitem__(key, content)
    fake.download_file.side_effect = lambda key: objects[key]
    fake.delete_file.side_effect = lambda key: objects.pop(key, None)
    return fake


@pytest.fixture(autouse=True)
def _wire(db: AsyncSession, storage: MagicMock):
    @asynccontextmanager
    async def _fake_uow():
        yield db

    original = settings.allow_test_admin_promotion
    settings.allow_test_admin_promotion = True
    try:
        with (
            patch("app.test_helpers.seed.unit_of_work", _fake_uow),
            patch("app.test_helpers.seed.get_storage", return_value=storage),
        ):
            yield
    finally:
        settings.allow_test_admin_promotion = original


@pytest.fixture()
def ctx(test_org, test_user: User) -> RequestContext:
    return RequestContext(
        user_id=test_user.id,
        organization_id=test_org.id,
        org_role=OrgRole.OWNER,
    )


@pytest.mark.asyncio
async def test_seed_stores_the_source_text_where_the_file_row_points(
    db: AsyncSession, ctx: RequestContext, storage: MagicMock,
) -> None:
    result = await seed_lease_template(
        payload=_SeedLeaseTemplateRequest(name="Seeded", source_text=SOURCE_TEXT),
        ctx=ctx,
    )

    files = await lease_template_file_repo.list_for_template(db, template_id=result.id)
    assert len(files) == 1
    assert storage.download_file(files[0].storage_key) == SOURCE_TEXT.encode("utf-8")
    assert files[0].size_bytes == len(SOURCE_TEXT.encode("utf-8"))


@pytest.mark.asyncio
async def test_delete_removes_the_template_and_its_stored_file(
    db: AsyncSession, ctx: RequestContext, objects: dict[str, bytes],
) -> None:
    result = await seed_lease_template(
        payload=_SeedLeaseTemplateRequest(name="Seeded", source_text=SOURCE_TEXT),
        ctx=ctx,
    )
    assert len(objects) == 1

    await hard_delete_lease_template(template_id=result.id, ctx=ctx)

    assert objects == {}
    assert await lease_template_repo.get(
        db,
        template_id=result.id,
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        include_deleted=True,
    ) is None


@pytest.mark.asyncio
async def test_a_failed_database_write_removes_the_uploaded_file(
    ctx: RequestContext, objects: dict[str, bytes],
) -> None:
    with (
        patch(
            "app.test_helpers.seed.lease_template_file_repo.create",
            side_effect=RuntimeError("db write failed"),
        ),
        pytest.raises(RuntimeError, match="db write failed"),
    ):
        await seed_lease_template(
            payload=_SeedLeaseTemplateRequest(name="Seeded", source_text=SOURCE_TEXT),
            ctx=ctx,
        )

    assert objects == {}
