"""Sentry hooks that keep database error text, and the user data in it, out of Sentry.

A database error's message holds row values (``DETAIL:  Key (email)=(...)``,
``Failing row contains (...)``, the argument a driver rejected), and
SQLAlchemy appends the bound parameters. ``send_default_pii`` and
``include_local_variables`` don't cover exception messages, so every event,
breadcrumb and log goes through one of these hooks.

Each hook gathers the exceptions it can reach: the hint's ``exc_info``, the
exception being handled when the hook runs, and every exception among the log
record's attributes (its ``exc_info``, ``msg``, ``args`` and extras), a
breadcrumb's data or a Sentry log's attributes, looking inside mappings,
lists, tuples, sets, deques and dataclass instances at any depth. An
exception held in any other object, in its attributes say, isn't found. The
exception being handled matters for a message built with an f-string or
``str(exc)``, which holds the error's text with no argument object behind it,
and for a Sentry log, whose hook gets no log record. Then:

- an exception entry whose class is withheld gets the summary as its value;
- a log message whose arguments include a withheld exception is formatted
  again with the summary in its place, and ``logentry.params`` to match;
- every string in the payload, dict keys included, goes through
  ``DatabaseErrorContext.scrub_text``, which replaces the known exception
  texts, in each form they're written in, and applies the text fallback;
- in a breadcrumb's data and a Sentry log's attributes, which still hold the
  caller's objects, a mapping is copied to a dict, a tuple, set or deque to a
  list, and a dataclass instance becomes its scrubbed ``repr``.

A failure here sends nothing unscrubbed: Sentry drops an event or a log whose
hook raised, and the breadcrumb hook drops its own breadcrumb when it fails,
because Sentry would keep the breadcrumb as it was.
"""

from __future__ import annotations

import dataclasses
import logging
import sys
from collections import deque
from collections.abc import Collection, Iterable, Mapping

from sentry_sdk.types import Breadcrumb, BreadcrumbHint, Event, Hint, Log
from sentry_sdk.utils import capture_internal_exception, safe_repr, safe_str

from platform_shared.core.dataclass_instance import is_dataclass_instance
from platform_shared.core.database_error_context import DatabaseErrorContext
from platform_shared.core.item_container import is_item_container


def scrub_event(event: Event, hint: Hint) -> Event:
    """``before_send``: an error or log event with every database error message summarised."""
    record = _log_record(hint)
    context = DatabaseErrorContext(
        _exceptions_among(
            [hint.get("exc_info"), sys.exception(), _record_attributes(record)]
        )
    )
    _summarise_exception_entries(event, context)
    if record is not None:
        _reformat_logentry(event, record, context)
    _scrub_payload(event, context)
    return event


def scrub_breadcrumb(crumb: Breadcrumb, hint: BreadcrumbHint) -> Breadcrumb | None:
    """``before_breadcrumb``: a breadcrumb (an INFO+ log line, mostly) with the same
    treatment, or None, which drops it, if that failed."""
    try:
        return _scrubbed_breadcrumb(crumb, hint)
    except Exception:
        capture_internal_exception(sys.exc_info())
        return None


def scrub_log(log: Log, _hint: Hint) -> Log:
    """``before_send_log``: a Sentry log.

    Its hint is empty and Sentry has already turned the record's arguments into
    text, so the exceptions are the ones among its attributes (a record's
    ``extra=`` values) and the one being handled. Once nothing is, an exception
    among the arguments is left to the text fallback.
    """
    context = DatabaseErrorContext(
        _exceptions_among([log.get("attributes"), sys.exception()])
    )
    _scrub_payload(log, context)
    return log


def _scrubbed_breadcrumb(crumb: Breadcrumb, hint: BreadcrumbHint) -> Breadcrumb:
    record = _log_record(hint)
    context = DatabaseErrorContext(
        _exceptions_among(
            [crumb.get("data"), sys.exception(), _record_attributes(record)]
        )
    )
    if record is not None:
        message = _reformatted_message(record, context)
        if message is not None:
            crumb["message"] = message
    _scrub_payload(crumb, context)
    return crumb


def _log_record(hint: Mapping[str, object]) -> logging.LogRecord | None:
    record = hint.get("log_record")
    if isinstance(record, logging.LogRecord):
        return record
    return None


def _record_attributes(record: logging.LogRecord | None) -> dict[str, object] | None:
    """A log record's attributes, which hold its ``msg``, ``args``, ``exc_info`` and
    ``extra=`` values."""
    if record is None:
        return None
    return vars(record)


def _exceptions_among(values: Iterable[object]) -> list[BaseException]:
    """Every exception in ``values``, or among them in a mapping (as a key or a
    value), an item container (see ``is_item_container``) or a dataclass
    instance's fields, at any depth."""
    exceptions: list[BaseException] = []
    # Holding each value looked inside keeps its id from being reused meanwhile.
    visited: dict[int, object] = {}
    pending = deque(values)
    while pending:
        value = pending.popleft()
        if isinstance(value, BaseException):
            exceptions.append(value)
            continue
        if id(value) in visited:
            continue
        if isinstance(value, Mapping):
            pending.extend(value.keys())
            pending.extend(value.values())
        elif is_item_container(value):
            pending.extend(value)
        elif is_dataclass_instance(value):
            # A field with no value yet (``init=False``) gives None.
            pending.extend(
                getattr(value, field.name, None) for field in dataclasses.fields(value)
            )
        else:
            continue
        visited[id(value)] = value
    return exceptions


def _summarise_exception_entries(event: Event, context: DatabaseErrorContext) -> None:
    exception = event.get("exception")
    if not isinstance(exception, dict):
        return
    entries = exception.get("values")
    if not isinstance(entries, list):
        return
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        type_name = entry.get("type")
        if not isinstance(type_name, str):
            continue
        module = entry.get("module")
        if not isinstance(module, str):
            module = None
        replacement = context.replacement_for_exception_value(
            module, type_name, entry.get("value")
        )
        if replacement is not None:
            entry["value"] = replacement


def _reformat_logentry(
    event: Event, record: logging.LogRecord, context: DatabaseErrorContext
) -> None:
    logentry = event.get("logentry")
    message = _reformatted_message(record, context)
    if not isinstance(logentry, Mapping) or message is None:
        return
    event["logentry"] = {
        **logentry,
        "formatted": message,
        "params": _replaced_params(logentry.get("params"), record.args, context),
    }


def _reformatted_message(
    record: logging.LogRecord, context: DatabaseErrorContext
) -> str | None:
    """The record's message formatted with each withheld exception argument's replacement,
    or None if no argument is withheld (or the record's ``msg`` isn't a format string)."""
    if not isinstance(record.msg, str):
        return None
    if isinstance(record.args, Mapping):
        replaced_mapping = {
            key: _replaced(value, context, value) for key, value in record.args.items()
        }
        if all(replaced_mapping[key] is value for key, value in record.args.items()):
            return None
        return record.msg % replaced_mapping
    if isinstance(record.args, tuple) and record.args:
        replaced_args = tuple(_replaced(arg, context, arg) for arg in record.args)
        if all(new is old for new, old in zip(replaced_args, record.args)):
            return None
        return record.msg % replaced_args
    return None


def _replaced_params(
    params: object, args: object, context: DatabaseErrorContext
) -> object:
    """Sentry's copy of the record's args, with each withheld exception's entry replaced.

    Every other entry keeps Sentry's copy: the event was serialised before
    ``before_send`` and is not again, and the record's own object (a UUID, say)
    may not be JSON.
    """
    if isinstance(params, list) and isinstance(args, tuple):
        return [
            _replaced(arg, context, param) for param, arg in zip(params, args)
        ] + params[len(args) :]
    if isinstance(params, Mapping) and isinstance(args, Mapping):
        return {
            key: _replaced(args.get(key), context, param)
            for key, param in params.items()
        }
    return params


def _replaced(value: object, context: DatabaseErrorContext, kept: object) -> object:
    """``value``'s replacement if it's a withheld exception, otherwise ``kept``."""
    replacement = context.replacement_for(value)
    if replacement is None:
        return kept
    return replacement


def _scrub_payload(payload: object, context: DatabaseErrorContext) -> None:
    """Replace each top-level value of a Sentry payload with its scrubbed copy.

    Copies rather than edits nested containers: a breadcrumb's ``data`` holds the
    caller's own ``extra=`` objects.
    """
    if isinstance(payload, dict):
        memo: dict[int, object] = {}
        for key, value in list(payload.items()):
            payload[key] = _scrubbed(value, context, memo)


def _scrubbed(
    value: object, context: DatabaseErrorContext, memo: dict[int, object]
) -> object:
    if isinstance(value, str):
        return context.scrub_text(value)
    if isinstance(value, BaseException):
        replacement = context.replacement_for(value)
        if replacement is not None:
            return replacement
        return context.scrub_text(safe_repr(value))
    if isinstance(value, Mapping) or is_item_container(value):
        return _scrubbed_container(value, context, memo)
    if is_dataclass_instance(value):
        # Sentry writes a dataclass instance as its repr, which holds each
        # field's repr.
        return context.scrub_text(safe_repr(value))
    return value


def _scrubbed_container(
    container: Mapping[object, object] | Collection[object],
    context: DatabaseErrorContext,
    memo: dict[int, object],
) -> object:
    """A scrubbed copy of a mapping or an item container, made once per container, so
    a container held twice, or holding itself, is copied once."""
    if id(container) in memo:
        return memo[id(container)]
    if isinstance(container, Mapping):
        # Sentry writes any mapping as a dict.
        scrubbed_dict: dict[str, object] = {}
        memo[id(container)] = scrubbed_dict
        for key, item in container.items():
            scrubbed_dict[_scrubbed_key(key, context)] = _scrubbed(item, context, memo)
        return scrubbed_dict
    # A tuple, set or deque becomes a list. Sentry writes tuples and sets as
    # lists, and would write a deque as its repr, which only text
    # replacement could scrub.
    scrubbed_list: list[object] = []
    memo[id(container)] = scrubbed_list
    scrubbed_list.extend(_scrubbed(item, context, memo) for item in container)
    return scrubbed_list


def _scrubbed_key(key: object, context: DatabaseErrorContext) -> str:
    """A dict key as Sentry writes one, ``str(key)``, scrubbed."""
    replacement = context.replacement_for(key)
    if replacement is not None:
        return replacement
    return context.scrub_text(safe_str(key))


__all__ = ["scrub_breadcrumb", "scrub_event", "scrub_log"]
