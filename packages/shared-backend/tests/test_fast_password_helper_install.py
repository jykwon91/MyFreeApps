"""``install_fast_password_helper`` must work however modules were imported first.

Each case runs in a fresh interpreter, because the install patches fastapi-users
process-wide and the point is the import order the process saw before it.
"""
from __future__ import annotations

import subprocess
import sys
import textwrap

import pytest

_FASTAPI_USERS_FIRST = "import fastapi_users.password, fastapi_users.manager"
_FACTORIES_FIRST = "import platform_shared.testing.factories"
_FASTAPI_USERS_THEN_FACTORIES = f"{_FASTAPI_USERS_FIRST}\n{_FACTORIES_FIRST}"
_FACTORIES_THEN_FASTAPI_USERS = f"{_FACTORIES_FIRST}\n{_FASTAPI_USERS_FIRST}"

_CHECKS = textwrap.dedent(
    """
    import fastapi_users.password as password
    from fastapi_users.manager import BaseUserManager
    from platform_shared.testing.factories import _FastPasswordHelper, hash_test_password, install_fast_password_helper

    install_fast_password_helper()
    install_fast_password_helper()

    assert password.PasswordHelper is _FastPasswordHelper
    assert isinstance(BaseUserManager.password_helper, _FastPasswordHelper)
    hashed = password.PasswordHelper().hash("pw")
    assert hashed == hash_test_password("pw")

    class Manager(BaseUserManager):
        pass

    assert isinstance(Manager(user_db=None).password_helper, _FastPasswordHelper)
    """
)


def _run(script: str) -> None:
    result = subprocess.run(
        [sys.executable, "-c", script], capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(
    "imports_first",
    [_FASTAPI_USERS_FIRST, _FACTORIES_FIRST, _FASTAPI_USERS_THEN_FACTORIES, _FACTORIES_THEN_FASTAPI_USERS],
    ids=["fastapi_users_first", "factories_first", "fastapi_users_then_factories", "factories_then_fastapi_users"],
)
def test_install_works_whatever_was_imported_first(imports_first: str) -> None:
    _run(f"{imports_first}\n{_CHECKS}")


def test_importing_factories_alone_installs_nothing() -> None:
    _run(
        textwrap.dedent(
            """
            import fastapi_users.password as password
            import platform_shared.testing.factories as factories

            assert password.PasswordHelper is not factories._FastPasswordHelper
            """
        )
    )


def test_a_module_that_bound_password_helper_before_the_install_keeps_the_real_class() -> None:
    """The trap the conftests avoid by installing first: this is why the call comes before any app import."""
    _run(
        textwrap.dedent(
            """
            from fastapi_users.password import PasswordHelper as bound_early
            from platform_shared.testing.factories import _FastPasswordHelper, install_fast_password_helper

            install_fast_password_helper()

            assert bound_early is not _FastPasswordHelper
            """
        )
    )
