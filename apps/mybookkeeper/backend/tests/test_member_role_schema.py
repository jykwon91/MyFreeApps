"""Tests for MemberRoleUpdate and InviteCreate Pydantic schema validation."""
import pytest
from pydantic import ValidationError

from app.schemas.organization.organization import InviteCreate, MemberRoleUpdate


class TestMemberRoleUpdate:
    def test_valid_admin(self) -> None:
        body = MemberRoleUpdate(org_role="admin")
        assert body.org_role == "admin"

    def test_valid_user(self) -> None:
        body = MemberRoleUpdate(org_role="user")
        assert body.org_role == "user"

    def test_valid_viewer(self) -> None:
        body = MemberRoleUpdate(org_role="viewer")
        assert body.org_role == "viewer"

    def test_rejects_owner(self) -> None:
        with pytest.raises(ValidationError):
            MemberRoleUpdate(org_role="owner")

    def test_rejects_editor(self) -> None:
        with pytest.raises(ValidationError):
            MemberRoleUpdate(org_role="editor")

    def test_rejects_arbitrary_string(self) -> None:
        with pytest.raises(ValidationError):
            MemberRoleUpdate(org_role="superadmin")

    def test_rejects_empty(self) -> None:
        with pytest.raises(ValidationError):
            MemberRoleUpdate(org_role="")


class TestInviteCreate:
    def test_valid_admin(self) -> None:
        body = InviteCreate(email="test@example.com", org_role="admin")
        assert body.org_role == "admin"

    def test_valid_user(self) -> None:
        body = InviteCreate(email="test@example.com", org_role="user")
        assert body.org_role == "user"

    def test_valid_viewer(self) -> None:
        body = InviteCreate(email="test@example.com", org_role="viewer")
        assert body.org_role == "viewer"

    def test_rejects_owner(self) -> None:
        with pytest.raises(ValidationError):
            InviteCreate(email="test@example.com", org_role="owner")

    def test_rejects_arbitrary_string(self) -> None:
        with pytest.raises(ValidationError):
            InviteCreate(email="test@example.com", org_role="editor")
