"""Unit tests for platform_shared.core.dns_failures."""
import socket

import pytest
from platform_shared.core.dns_failures import is_temporary_dns_failure


@pytest.mark.parametrize(
    ("exc", "temporary"),
    [
        pytest.param(
            socket.gaierror(socket.EAI_AGAIN, "Temporary failure in name resolution"), True,
            id="try-again",
        ),
        pytest.param(
            socket.gaierror(socket.EAI_NONAME, "Name or service not known"), False,
            id="no-such-host",
        ),
        # The same number, but not from a host lookup.
        pytest.param(OSError(socket.EAI_AGAIN, "not a lookup"), False, id="other-oserror"),
        pytest.param(TimeoutError("timed out"), False, id="timeout"),
    ],
)
def test_only_a_lookup_that_failed_for_now_is_temporary(exc: BaseException, temporary: bool) -> None:
    assert is_temporary_dns_failure(exc) is temporary
