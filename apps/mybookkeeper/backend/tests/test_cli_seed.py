"""The test-user seed CLI hashes with the same PasswordHelper the login path verifies with (no passlib)."""
from unittest.mock import MagicMock, patch

from fastapi_users.password import PasswordHelper

from app.cli import seed


def test_create_test_user_stores_verifiable_bcrypt_hash() -> None:
    session = MagicMock()
    with patch.object(seed, "SyncSession") as sync_session:
        sync_session.return_value.__enter__.return_value = session
        seed.cmd_create_test_user(MagicMock(role="user"))

    user_params = next(
        call.args[1]
        for call in session.execute.call_args_list
        if "hashed" in call.args[1]
    )
    hashed = user_params["hashed"]
    assert hashed != seed.TEST_PASSWORD
    verified, _ = PasswordHelper().verify_and_update(seed.TEST_PASSWORD, hashed)
    assert verified
