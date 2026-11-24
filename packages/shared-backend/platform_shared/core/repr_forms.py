"""How ``repr`` writes a string that is part of a longer one."""

from __future__ import annotations


def repr_forms(text: str) -> tuple[str, str]:
    """``text`` as Python's ``repr`` writes it inside a string: first when that
    ``repr`` quotes with ``'``, then when it quotes with ``"``.

    ``repr`` escapes backslashes and control characters either way. It quotes
    with ``'`` unless the string holds a ``'`` and no ``"``, and when it quotes
    with ``'`` it also escapes each ``'``. ``%r`` and a list's or tuple's text
    write the ``repr`` of each string they hold, which may be ``text`` itself
    or a longer string holding it, so ``text`` can come out either way.
    """
    written = repr(text)
    body = written[1:-1]
    if written.startswith('"'):
        # It holds a ' and no ". A longer string holding it is quoted with '
        # only if it holds a " as well, and then each ' is escaped.
        return body.replace("'", "\\'"), body
    # It holds no ', or holds a " as well, so no longer string holding it is
    # quoted with ".
    return body, body


__all__ = ["repr_forms"]
