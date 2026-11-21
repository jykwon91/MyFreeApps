REDACTED_URL_HASH_LENGTH: int = 8

# A URL ends at whitespace or a quote/bracket that httpx and Python wrap URLs in
# inside exception messages (``for url 'https://...'``).
URL_IN_TEXT_PATTERN: str = r"https?://[^\s'\"<>)\]]+"
