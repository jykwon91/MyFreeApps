"""Tests for health dashboard route role enforcement."""
import uuid

import pytest
from fastapi import HTTPException

from app.core.context import RequestContext
from app.core.permissions import require_org_role
from app.models.organization.organization_member import OrgRole


def _ctx(role: OrgRole) -> RequestContext:
    return RequestContext(
        organization_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        org_role=role,
    )


class TestResolveEventRoleEnforcement:
    """resolve_event requires OrgRole.OWNER or OrgRole.ADMIN."""

    @pytest.mark.asyncio
    async def test_owner_passes_resolve_event_permission_check(self) -> None:
        checker = require_org_role(OrgRole.OWNER, OrgRole.ADMIN)
        ctx = _ctx(OrgRole.OWNER)
        result = await checker(ctx)
        assert result.org_role == OrgRole.OWNER

    @pytest.mark.asyncio
    async def test_admin_passes_resolve_event_permission_check(self) -> None:
        checker = require_org_role(OrgRole.OWNER, OrgRole.ADMIN)
        ctx = _ctx(OrgRole.ADMIN)
        result = await checker(ctx)
        assert result.org_role == OrgRole.ADMIN

    @pytest.mark.asyncio
    async def test_user_rejected_from_resolve_event(self) -> None:
        checker = require_org_role(OrgRole.OWNER, OrgRole.ADMIN)
        ctx = _ctx(OrgRole.USER)
        with pytest.raises(HTTPException) as exc_info:
            await checker(ctx)
        assert exc_info.value.status_code == 403


class TestRetryFailedDocumentsRoleEnforcement:
    """retry_failed_documents requires OrgRole.OWNER or OrgRole.ADMIN."""

    @pytest.mark.asyncio
    async def test_owner_passes_retry_permission_check(self) -> None:
        checker = require_org_role(OrgRole.OWNER, OrgRole.ADMIN)
        ctx = _ctx(OrgRole.OWNER)
        result = await checker(ctx)
        assert result.org_role == OrgRole.OWNER

    @pytest.mark.asyncio
    async def test_admin_passes_retry_permission_check(self) -> None:
        checker = require_org_role(OrgRole.OWNER, OrgRole.ADMIN)
        ctx = _ctx(OrgRole.ADMIN)
        result = await checker(ctx)
        assert result.org_role == OrgRole.ADMIN

    @pytest.mark.asyncio
    async def test_user_rejected_from_retry_failed(self) -> None:
        checker = require_org_role(OrgRole.OWNER, OrgRole.ADMIN)
        ctx = _ctx(OrgRole.USER)
        with pytest.raises(HTTPException) as exc_info:
            await checker(ctx)
        assert exc_info.value.status_code == 403


class TestHealthDashboardRouteRoleDeclarations:
    """Verify router declares admin/owner guards on the protected routes."""

    def test_resolve_event_route_declares_owner_or_admin_dependency(self) -> None:
        """resolve_event handler uses require_org_role(OWNER, ADMIN)."""
        from fastapi.routing import APIRoute
        from app.api.health_dashboard import router

        resolve_route = next(
            (r for r in router.routes
             if isinstance(r, APIRoute) and r.path.endswith('/resolve')),
            None,
        )
        assert resolve_route is not None
        dep_names = [
            d.call.__name__ if hasattr(d.call, '__name__') else str(d.call)
            for d in resolve_route.dependant.dependencies
        ]
        # require_org_role returns a closure named _check
        assert any('_check' in n for n in dep_names)

    def test_retry_failed_route_declares_owner_or_admin_dependency(self) -> None:
        """retry_failed_documents handler uses require_org_role(OWNER, ADMIN)."""
        from fastapi.routing import APIRoute
        from app.api.health_dashboard import router

        retry_route = next(
            (r for r in router.routes
             if isinstance(r, APIRoute) and r.path.endswith('/retry-failed')),
            None,
        )
        assert retry_route is not None
        dep_names = [
            d.call.__name__ if hasattr(d.call, '__name__') else str(d.call)
            for d in retry_route.dependant.dependencies
        ]
        assert any('_check' in n for n in dep_names)

    def test_get_health_summary_does_not_require_admin(self) -> None:
        """get_health_summary is accessible to all org members (no admin guard)."""
        from fastapi.routing import APIRoute
        from app.api.health_dashboard import router

        summary_route = next(
            (r for r in router.routes
             if isinstance(r, APIRoute) and r.path.endswith('/summary')),
            None,
        )
        assert summary_route is not None
        dep_names = [
            d.call.__name__ if hasattr(d.call, '__name__') else str(d.call)
            for d in summary_route.dependant.dependencies
        ]
        # summary route should NOT have _check (require_org_role closure) in deps
        assert not any('_check' in n for n in dep_names)
