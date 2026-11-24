"""The database errors reachable from some exceptions, and how to write them without their values."""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable

from sentry_sdk.utils import safe_repr, safe_str
from sqlalchemy.exc import StatementError

from platform_shared.core.database_error_constants import (
    DRIVER_TEXT_ATTRIBUTES,
    MIN_KNOWN_TEXT_LENGTH,
    WITHHELD_MARKER,
)
from platform_shared.core.database_error_detection import is_database_error
from platform_shared.core.database_error_summary import summarize_database_error
from platform_shared.core.database_error_text_fallback import withhold_database_text
from platform_shared.core.exception_class_module import exception_class_module
from platform_shared.core.repr_forms import repr_forms


class DatabaseErrorContext:
    """The exceptions whose text must not leave the process, found from some starting ones.

    Every exception reachable through ``__cause__``, ``__context__``, a statement
    error's ``orig`` or an exception group's members is looked at. Withheld:

    - every database error (see ``is_database_error``);
    - every exception reachable from a withheld one through ``__cause__``,
      ``orig`` or a group's members, because drivers raise the error that
      rejected a value ``from`` the one holding it (asyncpg's codec
      ``ValueError`` holds the value).

    Not withheld:

    - an exception reached from a withheld one only through ``__context__``.
      It was being handled when the database error was raised, like the app
      error whose handling ran the failing query, so its text is the app's
      and it is often the root cause.
    - an exception above a database error (an app error raised ``from`` it).
      Its own text is the app's too.

    Any database text either one repeats is caught by :meth:`scrub_text`.

    A database error is written as its summary, any other withheld exception
    as ``WITHHELD_MARKER``.
    """

    def __init__(self, roots: Iterable[BaseException]) -> None:
        # Holding the withheld exceptions keeps their ids valid for lookups.
        self._withheld: list[BaseException] = []
        self._replacements: dict[int, str] = {}
        self._texts: dict[int, list[str]] = {}
        self._by_type: dict[tuple[str | None, str], list[BaseException]] = {}
        # The exceptions looked at and not withheld, by class, to tell their
        # Sentry exception entries from the withheld ones'.
        self._kept_by_type: dict[tuple[str | None, str], list[BaseException]] = {}
        self._collect(roots)
        self._known_texts = self._known_text_replacements()

    def replacement_for(self, value: object) -> str | None:
        """What to send instead of ``value``, or None if it isn't a withheld exception."""
        if isinstance(value, BaseException):
            return self._replacements.get(id(value))
        return None

    def replacement_for_exception_value(
        self,
        module: str | None,
        type_name: str,
        value: object,
    ) -> str | None:
        """What to send as a Sentry exception entry's ``value``, given the entry's class.

        Sentry names a class by ``__module__`` (None for builtins) and
        ``__qualname__``, and writes an exception's text as its entry's value,
        followed by any notes, one per line. An entry whose class no withheld
        exception has is left alone. Otherwise:

        - a value that is a withheld exception's text gets that one's replacement;
        - a value that is the text of an exception of the class that isn't
          withheld is left alone: the app's ``ValueError``, say, being handled
          when asyncpg's codec raised a ``ValueError`` of its own;
        - any other value gets the first withheld one's replacement. Each is
          value-free.
        """
        key = (module, type_name)
        candidates = self._by_type.get(key)
        if not candidates:
            return None
        if isinstance(value, str):
            for exc in candidates:
                if _is_entry_value_of(value, self._texts[id(exc)]):
                    return self._replacements[id(exc)]
            for exc in self._kept_by_type.get(key, []):
                if _is_entry_value_of(value, _texts(exc)):
                    return None
        return self._replacements[id(candidates[0])]

    def scrub_text(self, text: str) -> str:
        """``text`` with each withheld exception's text replaced, then the text fallback applied.

        The texts are replaced longest first, so one that holds another (an
        error's ``str``, which holds its driver's DETAIL line) is replaced whole.
        """
        for known, replacement in self._known_texts:
            text = text.replace(known, replacement)
        return withhold_database_text(text)

    def _collect(self, roots: Iterable[BaseException]) -> None:
        queue: deque[tuple[BaseException, bool]] = deque(
            (root, False) for root in roots
        )
        visited: set[tuple[int, bool]] = set()
        seen: dict[int, BaseException] = {}
        while queue:
            exc, beneath_withheld = queue.popleft()
            if (id(exc), beneath_withheld) in visited:
                continue
            visited.add((id(exc), beneath_withheld))
            seen[id(exc)] = exc
            database_error = is_database_error(exc)
            withheld = database_error or beneath_withheld
            if withheld:
                self._withhold(exc, database_error)
            for inner, part_of_exc in _inner_exceptions(exc):
                queue.append((inner, withheld and part_of_exc))
        for exc in seen.values():
            if id(exc) not in self._replacements:
                for key in _sentry_type_keys(type(exc)):
                    self._kept_by_type.setdefault(key, []).append(exc)

    def _withhold(self, exc: BaseException, database_error: bool) -> None:
        if id(exc) in self._replacements:
            return
        replacement = WITHHELD_MARKER
        if database_error:
            replacement = summarize_database_error(exc)
        self._withheld.append(exc)
        self._replacements[id(exc)] = replacement
        self._texts[id(exc)] = _texts(exc)
        for key in _sentry_type_keys(type(exc)):
            self._by_type.setdefault(key, []).append(exc)

    def _known_text_replacements(self) -> list[tuple[str, str]]:
        """Each withheld exception's texts with what replaces them, longest first: as
        they are and both ways ``repr`` can write them (see ``repr_forms``), the
        replacement written the same way."""
        known: dict[str, str] = {}
        for exc in self._withheld:
            replacement = self._replacements[id(exc)]
            for text in self._texts[id(exc)]:
                if len(text) < MIN_KNOWN_TEXT_LENGTH:
                    continue
                known.setdefault(text, replacement)
                for form, replacement_form in zip(
                    repr_forms(text), repr_forms(replacement), strict=True
                ):
                    known.setdefault(form, replacement_form)
        return sorted(known.items(), key=lambda item: len(item[0]), reverse=True)


def _inner_exceptions(exc: BaseException) -> list[tuple[BaseException, bool]]:
    """The exceptions ``exc`` leads to, each with whether it is part of ``exc`` (and so
    withheld with it) or only what was being handled when ``exc`` was raised."""
    inner: list[tuple[BaseException | None, bool]] = [
        (exc.__cause__, True),
        (exc.__context__, False),
    ]
    if isinstance(exc, StatementError):
        inner.append((exc.orig, True))
    if isinstance(exc, BaseExceptionGroup):
        inner.extend((member, True) for member in exc.exceptions)
    return [
        (candidate, part_of_exc)
        for candidate, part_of_exc in inner
        if candidate is not None
    ]


def _is_entry_value_of(value: str, texts: list[str]) -> bool:
    """Whether a Sentry exception entry's ``value`` is one of an exception's ``texts``,
    alone or followed by the exception's notes."""
    return any(value == text or value.startswith(f"{text}\n") for text in texts)


def _texts(exc: BaseException) -> list[str]:
    """How an exception's text appears elsewhere: ``str``, ``repr`` (Sentry's form for an
    exception in log params or extras), and the driver fields a caller might log alone.

    Read the way Sentry reads them, so an exception whose ``__str__`` raises
    gives the same stand-in text Sentry sends for it.
    """
    texts = [safe_str(exc), safe_repr(exc)]
    for attribute in DRIVER_TEXT_ATTRIBUTES:
        value = getattr(exc, attribute, None)
        if isinstance(value, str):
            texts.append(value)
    return [text for text in texts if text]


def _sentry_type_keys(cls: type[BaseException]) -> set[tuple[str | None, str]]:
    module = exception_class_module(cls)
    return {(module, cls.__qualname__), (module, cls.__name__)}


__all__ = ["DatabaseErrorContext"]
