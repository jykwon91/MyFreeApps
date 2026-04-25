"""Tests that org endpoints verify org_id matches the caller's context."""
import uuid

import pytest
from fastapi import HTTPException

from app.api.organizations import _verify_org_access
from app.core.context import RequestContext
from app.models.organization.organization_member import OrgRole


class TestVerifyOrgAccess:
    def test_matching_org_id_passes(self) -> None:
        org_id = uuid.uuid4()
        ctx = RequestContext(
            organization_id=org_id,
            user_id=uuid.uuid4(),
            org_role=OrgRole.OWNER,
        )
        _verify_org_access(org_id, ctx)

    def test_mismatched_org_id_raises_403(self) -> None:
        ctx = RequestContext(
            organization_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            org_role=OrgRole.OWNER,
        )
        with pytest.raises(HTTPException) as exc_info:
            _verify_org_access(uuid.uuid4(), ctx)
        assert exc_info.value.status_code == 403
