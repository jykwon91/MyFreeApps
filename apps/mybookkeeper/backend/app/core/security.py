from platform_shared.core.security import create_fernet_suite, create_pii_suite

from app.core.config import settings

_token_suite = create_fernet_suite(
    settings.encryption_key,
    salt=b"mybookkeeper-v1",
    info=b"mybookkeeper-token-encryption",
    legacy_salt=None,
    legacy_info=b"mybookkeeper-token-encryption",
)

_pii_suite = create_pii_suite(
    settings.encryption_key,
    salt=b"mybookkeeper-v1",
    info=b"mybookkeeper-pii-encryption",
)

encrypt_token = _token_suite.encrypt
decrypt_token = _token_suite.decrypt
get_fernet = lambda: _token_suite._fernet  # noqa: E731 — needed for backward compat

encrypt_pii = _pii_suite.encrypt
decrypt_pii = _pii_suite.decrypt
