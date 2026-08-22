"""Callout -> zone matching: the four pure helpers, plus a re-export of the tables.

Split out of reconcile_agent.py: these are constant data plus four side-effect-free string
functions, and they have three consumers — reconcile_agent.py, build_items.py and
test_callouts.py. The other two used to reach them by exec()ing reconcile's source with its
CLI block excised by sentinel, which meant any change to reconcile's module-level code could
break them in ways no import graph showed. Importing a real module makes that a normal
dependency.

The per-map tables themselves now live in ``lineup_callout_tables.py`` — they are the half
that grows with every new map, and this module was already past the 500-LOC no-growth line.
They are re-exported here unchanged, so ``from lineup_callouts import CALLOUTS_BY_MAP`` (or
any individual ``*_CALLOUTS``) still resolves exactly as it did.

Everything here must stay PURE: no argv, no filesystem, no reconcile CLI globals. That is what
lets the table be imported by a builder that runs before reconcile ever does.
"""
import re

from lineup_callout_tables import (  # noqa: F401  (re-exported for existing importers)
    ABYSS_CALLOUTS,
    ASCENT_CALLOUTS,
    BREEZE_CALLOUTS,
    CALLOUTS_BY_MAP,
    HAVEN_CALLOUTS,
    LOTUS_CALLOUTS,
    SPLIT_CALLOUTS,
    SUMMIT_CALLOUTS,
    SUNSET_CALLOUTS,
)


def leading_callout(text):
    """Localizers report stand_loc as '<callout> (<clarification>)'. Only the LEADING callout
    names the spot; the parenthetical usually names a NEIGHBOURING landmark and must not win.

    Real case: 'B Site (at the B Main doorway/mouth)' â€” the player stands at B SITE, near the
    B Main mouth. Matching the whole string hit 'b main' first (it precedes 'b site' in the
    longest-first table) and would have moved a correct b-site stand to b-main.

    Brackets get the same treatment as parens: Snapiex's Viper/Sunset source writes the ABILITY in
    brackets ('A Corner [Snake Bite]', 'B Main / Middle from B [Toxic Screen]'), which is not a
    callout at all and left those rows unmappable."""
    s = str(text or "")
    head = re.split(r"[(\[]", s, maxsplit=1)[0].strip()
    return head or s


def target_text(title, table=None):
    """The part of a chapter title that names the TARGET, with the stand clause removed.

    `callout_to_zone` returns the FIRST table entry it finds anywhere in the string, so any callout
    mentioned in a title competes to be the target — including the one after "from", which names
    where the player STANDS. Ascent never exposed this because its titles carry no "from"; every
    title in Tseeky's Sunset Brimstone source does, and "B Default 3 From Market" resolved to
    `market` instead of `b-site`. Ordering the table so every target term precedes every stand term
    would "fix" the two known cases by coincidence and silently break on the next source.

    Same shape as leading_callout()'s parenthetical strip, for the same reason: cut the clause that
    is known not to name this field, then match.

    THE REVERSED GRAMMAR. Some creators write `<STAND> to <TARGET>` — the opposite order — and such
    a title carries no "from", so the whole string used to be matched and the first table hit (the
    STAND) won. Every lineup from such a source would ship with stand and target SWAPPED, and the
    only symptom is wrong pins at the operator's eyeball gate. Found on nic.vallabh's breeze/Phoenix
    source (15 of 18 titles, e.g. 'A Lobby to A Shop'), which is the ONLY one of the 12 post-Sunset
    sources that writes this way — see `<scratch>/title_grammar.py`, and re-run it on any new source.

    Gated on EVIDENCE, not on the word alone: the split is accepted only when `table` is supplied
    and BOTH sides independently resolve to a zone. "to" is an ordinary English word, and a bare
    `\\bto\\b` split would happily mangle a title that merely contains it.

    Separators are `to`, arrows, AND the spaced dash — the same set build_phoenix.split_title uses.
    The dash was left out at first, on the worry that AiltonVG's 'Site A Attack - Lineup 1' would
    lose its 'Site A'. The evidence gate already prevents that ('Lineup 1' resolves to nothing, so
    the split is refused and the whole string is matched), and Quible's Haven sources write the
    reversed grammar with a dash rather than "to" ('A Wine - A Site'), so excluding it would have
    silently mis-targeted those. The dash must be WHITESPACE-DELIMITED so hyphenated callouts like
    'Anti-Plant' are untouched.

    THE LEADING TAG. The parenthetical strip assumes the bracket opens a TRAILING clarification, so
    it keeps everything BEFORE the first bracket. hoverboarD tags the ability at the FRONT instead
    ('[Def Eye] A Tree to A Main/Rubble'), and for those the text before the first bracket is the
    empty string — every one of that creator's rows resolved to no target at all. It showed up as 34
    of 64 unresolved titles on the Lotus coverage check, and hoverboarD is a source on four maps, so
    this was suppressing rows well beyond Lotus. Strip a LEADING tag first, and if the trailing strip
    somehow still empties the string, fall back to the raw title rather than returning ''.
    """
    s = re.sub(r"^\s*[\[(][^\])]*[\])]\s*", "", str(title or ""))
    s = re.split(r"[(\[]", s, maxsplit=1)[0]
    if not s.strip():
        s = str(title or "")
    if re.search(r"\bfrom\b", s, flags=re.I):
        return re.split(r"\bfrom\b", s, maxsplit=1, flags=re.I)[0].strip() or s.strip()
    if table:
        parts = re.split(r"\s+(?:to|[-–—>]|→)\s+", s, maxsplit=1, flags=re.I)
        if len(parts) == 2 and all(_first_table_hit(p, table) for p in parts):
            return parts[1].strip()
    return s.strip()


def _first_table_hit(text, table):
    t = re.sub(r"[^a-z0-9 ]+", " ", str(text or "").lower())
    t = re.sub(r"\s+", " ", t).strip()
    if not t:
        return None
    for word, slug in table:
        if re.search(rf"\b{re.escape(word)}\b", t):
            return slug
    return None


def callout_to_zone(text, table):
    """Map a free-text callout onto a coarse zone slug for THIS map; None when unrecognizable.

    A SLASH joins two adjacent areas one throw covers, and the FIRST names the destination:
    "B Market/B Site God Arrow" lands in Market on the way through to B. A whole-string scan cannot
    express that, because the loop below returns the first entry found by TABLE ORDER, not by
    position in the text — `b site` sits above `b market` in the Sunset table, so that title
    silently resolved to b-site. Trying the first slash segment on its own is what makes
    "first one wins" a rule instead of an accident of how the table happens to be sorted. The two
    slash cases already pinned in test_callouts ("A Main/Site", "B Gym/CT") both passed only because
    the ordering happened to agree.

    The whole string is still tried when the first segment resolves to nothing, which is what keeps
    the OTHER slash idiom working: "A/Mid Info" is one compressed callout, its first segment is a
    bare "A" that matches nothing, and the table carries `a mid info` outright.

    The split is looked for only BEFORE any paren/bracket, so a slash inside a clarification cannot
    trigger it — "B Site (at the B Main doorway/mouth)" must keep resolving on the whole string, and
    splitting at that slash would hand the lookup "B Site (at the B Main doorway" and move a correct
    b-site stand to b-main. Callers strip parentheticals via leading_callout/target_text before
    calling here anyway; this is the belt to that suspenders.
    """
    head = re.split(r"[(\[]", str(text or ""), maxsplit=1)[0]
    if "/" in head:
        return _first_table_hit(head.split("/", 1)[0], table) or _first_table_hit(text, table)
    return _first_table_hit(text, table)
