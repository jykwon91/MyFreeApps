"""Unit tests for platform_shared.core.auth_messages."""
from platform_shared.core.auth_messages import RATE_LIMIT_GENERIC_DETAIL


class TestRateLimitMessage:
    def test_message_is_generic(self) -> None:
        """The message must not leak which gate fired (account-lockout vs per-IP)."""
        assert RATE_LIMIT_GENERIC_DETAIL == "Too many attempts"

    def test_message_does_not_mention_specifics(self) -> None:
        lower = RATE_LIMIT_GENERIC_DETAIL.lower()
        forbidden = ("locked", "lockout", "ip", "minutes", "until", "wait", "seconds")
        for word in forbidden:
            assert word not in lower, (
                f"Rate-limit message must stay generic; {word!r} would let callers infer the gate."
            )
