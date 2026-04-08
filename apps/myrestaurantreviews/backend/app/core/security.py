from platform_shared.core.security import create_fernet_suite, create_pii_suite

from app.core.config import settings

_token_suite = create_fernet_suite(
    settings.encryption_key,
    salt=b"myrestaurantreviews-v1",
    info=b"myrestaurantreviews-token-encryption",
)

_pii_suite = create_pii_suite(
    settings.encryption_key,
    salt=b"myrestaurantreviews-v1",
    info=b"myrestaurantreviews-pii-encryption",
)

encrypt_token = _token_suite.encrypt
decrypt_token = _token_suite.decrypt
encrypt_pii = _pii_suite.encrypt
decrypt_pii = _pii_suite.decrypt
