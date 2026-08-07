"""Build an agent's items list + pre-localize spans skeleton for ANY map, from a chapters dump.

Replaces the per-agent one-off builders (build_batch1/2, build_brimstone_alt, build_phoenix, ...).
With 21 (map, agent) buckets left, another hand-written builder per bucket is how invented data
gets in — the Summit incident where a hand-typed items list carried invented timestamps, names and
abilities that no downstream check could have caught.

  python build_items.py <agent> <map> <chapters_file> [--cards <file>] [--pack <stem>] [--apply]

--cards feeds in what the FOOTAGE says, from a read_cards.py pass: the creator's on-screen title
plate and VALORANT's own location readout. It exists because chapter titles are not always the
source's real titles — three Tseeky Brimstone/Ascent chapters named "A Default" / "A Dice" /
"B Default" are captioned A ANTIPLANT 1 / 2 / B ANTIPLANT on screen and are thrown from A Rafters
and Defender Side Spawn, i.e. the wrong name, wrong stand AND wrong side in every case. Where a
card is present it supplies the stand (author_gave_stand, no --apply-stand needed) and, when it
disagrees with the chapter title, the name.

Emits:
  <scratch>/items_<agent>_<map>.json          workflow input (nn/cs/next/ability/name/target/stand/side)
  scripts/<agent>-spans/<pack>.json           placeholder skeleton the localizer's spans overwrite

Reuses reconcile_agent.py's OWN per-map callout table (imported, not copied) so the title->zone
mapping here cannot drift from the one --apply-stand applies later.

What it deliberately does NOT invent:
  * STAND — unknown unless the title says "from X". Defaults to the target zone as a placeholder
    and is meant to be replaced by `--apply-stand`. Never guessed from map knowledge.
  * ABILITY — when the author does not label it, the item carries the agent's a|b disambiguation
    prose (so the gate is not biased toward one) and the pack carries a provisional slug that
    `--apply-ability` overwrites with the localizer's call.
  * SIDE — resolved in three tiers, and the run ABORTS before it silently guesses. Side is not
    recoverable downstream: the localizer's call is unreliable (practice servers spawn
    attacker-side regardless) and reconcile treats the pack's value as authoritative.
      1. an ATT/DEF prefix — the author's own label, always wins;
      2. a phrase whose side is CONSISTENT across the already-shipped, operator-reviewed corpus
         (see SIDE_PHRASES — every entry carries the n it was measured at, via derive_side.py);
      3. the source's OWN stand partition: if a row's stand callout also appears on rows that
         tiers 1-2 already decided, and every one of those agrees, take that side. This is
         evidence from inside the same video rather than recall about the map — on the Brimstone
         source the 25 "...Plant" rows are thrown from {A Main, A Lobby, A Wine, B Main, B Lobby,
         Mid *} and the 3 antiplant rows from {A Rafters, Defender Side Spawn}, two disjoint sets,
         so the 7 rows the author left unlabelled are placed by where he stood, not by a guess.
         A stand seen on BOTH sides, or on none, resolves nothing and falls through;
      4. `--side-default <attacker|defender>`, which must be passed EXPLICITLY and whose rows are
         listed individually in the output so they can be checked at the eyeball gate.
    With no prefix, no phrase hit, no partition hit and no --side-default, it aborts.

`--side-defer` is the honest answer when a source genuinely never states a side. Bonsai's Ascent
Phoenix guide is the case it was written for: 22 of 28 titles are bare target names, and the footage
does not help either - the on-screen plate carries only Difficulty/Run/Jump, and the round-timer box
shows the planted-spike glyph on exactly ONE chapter (read_hud.py --scan), the one whose title
already said "Plant". Rather than invent 22 sides or abandon 22 good lineups, --side-defer writes
them with side=null and lists every one.

This is safe ONLY because side is not an input to localization: to_workflow_items.py drops side
before the workflow ever sees it, so deferring costs nothing on the long pole and the spans can be
localized while the side question is still open. It is NOT a way to ship: a null side cannot be
accepted (the lineup table's CheckConstraint requires the classification fields on accepted rows),
so a deferred row stays pending_review until a second source or the operator supplies one.
"""
import json
import re
import sys
from pathlib import Path

BE = Path(__file__).resolve().parents[1]  # scripts/ -> backend/
HERE = Path(__file__).resolve().parent

# --- import the live callout tables rather than copying them ---
SRC = (HERE / "reconcile_agent.py").read_text(encoding="utf-8")
HEAD = SRC.split("def extract_json")[0]
BEGIN, END = "# --- BEGIN CLI", "# --- END CLI ---"
HEAD = HEAD.split(BEGIN)[0] + HEAD.split(END, 1)[1]
# exec() gets no module globals of its own, so the exec'd header cannot see a __file__
# and its `Path(__file__).resolve().parents[1]` would raise NameError. Hand it the real
# path of the file being exec'd.
_ns = {"AGENT": "", "APPLY_ABILITY": False, "APPLY_STAND": False, "APPLY": False,
       "__file__": str(HERE / "reconcile_agent.py")}
exec(compile(HEAD, "reconcile_agent.py", "exec"), _ns)
CALLOUTS_BY_MAP, _c2z, _lead = _ns["CALLOUTS_BY_MAP"], _ns["callout_to_zone"], _ns["leading_callout"]
_target_text = _ns["target_text"]


def callout_to_zone(text, table):
    """Zone for a bare callout, judged on the LEADING callout only.

    Same rule the localizer's stand_loc gets: a parenthetical names a neighbouring landmark, not
    the spot. Real case: "DEF Middle Best (Market)" — the primary callout is Middle, but Market is
    its own zone on Ascent and a whole-string scan hits bare "market" before "middle", silently
    retargeting a mid lineup to market.
    """
    return _c2z(_lead(text), table)


def target_zone(title, table):
    """Zone for a chapter TITLE — the leading-callout rule PLUS the stand clause removed.

    A title names two places, and only one of them is the target. "B Default 3 From Market" is a
    molly onto B site thrown from Market; scanning the whole title found `market` and retargeted it
    there. Ascent's titles carry no "from" so this never surfaced; every title in the Sunset sources
    does. The stand lookup below deliberately keeps using callout_to_zone — it is handed the
    from-clause on its own, and stripping it there would leave nothing to match.
    """
    # The table is passed so target_text can also resolve the REVERSED `<STAND> to <TARGET>`
    # grammar, which carries no "from" and otherwise matches the STAND as the target. The split is
    # accepted only when both sides resolve against THIS table, so a title merely containing the
    # word "to" is unaffected. See target_text's docstring and <scratch>/title_grammar.py.
    return _c2z(_target_text(title, table), table)

UNLABELLED = {
    "fade": ("haunt", "haunt|seize - the author does NOT label it, so the LANDING may legitimately "
             "be EITHER a hovering opened watching EYE (haunt) OR a flat spreading ground INK POOL "
             "(seize); judge the deploy onset, not which of the two it is"),
    "phoenix": ("hot-hands", "curveball|hot-hands - the author does NOT label it, so the LANDING "
                "may legitimately be EITHER a white FLASH burst in the air from a curving orb "
                "(curveball) OR an orange ground FIRE pool from a straight lob (hot-hands); judge "
                "the deploy onset, not which of the two it is"),
    # Viper is the first agent whose hedge is reached by DESIGN rather than by the author being
    # silent. Snapiex brackets the utility in all 14 titles, so ABILITY_WORDS resolves 11 outright;
    # the other 3 are bracketed "[Toxic Screen - Poison Cloud]" and match TWO patterns, which the
    # len(hits)==1 guard turns into this hedge. That is the right answer, not a miss: those chapters
    # genuinely deploy two utilities, and picking whichever pattern sat higher in the table would be
    # a coin flip recorded as a fact. The localizer reports which deploy it actually pinned.
    "viper": ("toxic-screen", "toxic-screen|poison-cloud|snake-bite - this chapter is a COMBO: the "
              "author's own title brackets TWO utilities, and both are deployed. A toxic screen is "
              "a long WALL of green gas that rises along a line from emitters; a poison cloud is a "
              "thrown orb that blooms into one SPHERE of green gas at the spot it lands; a snake "
              "bite is a canister that shatters into a flat corrosive ACID POOL on the ground. "
              "Localize the CLEAREST single complete deploy, name which one you pinned, and say in "
              "NOTES roughly when the other is deployed so it is not silently lost"),
    "brimstone": ("brim-incendiary", "brim-incendiary|sky-smoke - the author does NOT label it, so "
                  "the LANDING may legitimately be EITHER an orange burning MOLLY pool "
                  "(brim-incendiary) OR a large dome SMOKE bloom (sky-smoke); judge the deploy "
                  "onset, not which of the two it is"),
    # KAY/O is the first THREE-way agent here. The hedge is correspondingly weaker than a two-way
    # one, which is the argument for never reaching it: every plate on the Sunset source names the
    # utility outright, so ABILITY_WORDS resolves all 41 rows and this string stays unused.
    "kay-o": ("flashdrive", "flashdrive|zero-point|fragment - the author does NOT label it, so the "
              "LANDING may legitimately be a white FLASH burst in the air from a thrown disc "
              "(flashdrive), a KNIFE that sticks where it lands and opens a wide green suppression "
              "dome (zero-point), or a bouncing grenade that settles into repeated explosive "
              "PULSES on the ground (fragment); judge the deploy onset, not which of the three"),
    # Sova's two throwables are far easier to tell apart on the LANDING than any other agent's pair
    # here — one hovers and sweeps, the other detonates and is gone — so the hedge is unusually
    # strong. It should still never be reached: the Sunset plate labels all 33.
    "sova": ("recon", "recon|shock - the author does NOT label it, so the LANDING may legitimately "
             "be EITHER a bolt that STICKS to a surface and emits repeating expanding SCAN pulses "
             "that tag enemies through walls (recon) OR a dart that DETONATES on impact in a single "
             "electric burst doing damage and leaving nothing behind (shock); judge the deploy "
             "onset, not which of the two it is"),
}

# Phrase -> side, measured against the shipped corpus with derive_side.py (1128 lineups, 2026-07-29).
# Only phrases that came back CONSISTENT are here; a SPLIT phrase is evidence of nothing and is
# deliberately absent so it falls through to --side-default instead of borrowing a majority.
#
# ORDER MATTERS — first match wins, so every compound sits above the bare word it contains.
# "Afterplant" is the case that forces it: `\bplant\b` does NOT match inside it (no word boundary),
# so without its own entry an afterplant molly reaches the bare-plant rule only by accident of
# spacing — "After Plant" would resolve and "Afterplant" would abort.
SIDE_PHRASES = [
    (r"\bafter[- ]?plant\b", "side_a",
     "3/3 shipped 'afterplant' lineups are attacker — thrown by the side that planted"),
    (r"\bpost[- ]?plant\b", "side_a", "24/24 shipped 'post plant'/'postplant' lineups are attacker"),
    (r"\banti[- ]?plant\b", "side_b",
     "denies the enemy plant; 3/3 shipped 'antiplant' and 70/70 'retake' lineups are defender"),
    (r"\bretake\b", "side_b", "70/70 shipped 'retake' lineups are defender"),
    (r"\bexecute\b", "side_a", "5/5 shipped 'execute' lineups are attacker — the attacking entry"),
    (r"\bplant\b", "side_a", "48/48 shipped 'plant' lineups are attacker (post-plant utility)"),
]

# The creator's on-screen ability line NAMES the utility, which resolves the a|b ambiguity that
# UNLABELLED exists to hedge: Brimstone's Sunset plate reads "Afterplant Molly" on all 23 of its
# afterplant rows, and a molly is the incendiary, not the sky smoke. Only words that pick exactly
# ONE of an agent's two candidates are listed — anything else falls through to the hedge prose so
# the localizer's gate still decides rather than being told a wrong answer confidently.
ABILITY_WORDS = {
    "brimstone": [(r"\b(molly|molotov|incendiary|incend|fire)\b", "brim-incendiary"),
                  (r"\b(smoke|smokes|sky)\b", "sky-smoke")],
    "phoenix": [(r"\b(molly|molotov|hot.?hands|fire)\b", "hot-hands"),
                (r"\b(flash|curveball|curve)\b", "curveball")],
    "fade": [(r"\b(haunt|eye)\b", "haunt"), (r"\b(seize|ink)\b", "seize")],
    # Deliberately ONLY the three official ability names, with no loose synonym. The temptation is
    # to add "wall" for the screen, "orb"/"smoke" for the cloud and "molly" for the snake bite, as
    # the other agents' tables do — but this source's whole ability signal is a bracket that spells
    # the names out, and a loose synonym can only ever make a row match a SECOND pattern and fall to
    # the hedge. The narrow table is what keeps 11 of 14 rows author-labelled. Add a synonym only if
    # a future source actually needs it, and check the combo titles still resolve to exactly two.
    "viper": [(r"\b(snake.?bite)\b", "snake-bite"),
              (r"\b(poison.?cloud)\b", "poison-cloud"),
              (r"\b(toxic.?screen)\b", "toxic-screen")],
    # First agent with THREE candidates. Order is irrelevant here — the resolver collects the SET of
    # matching patterns against the plate's role line only and demands exactly one, so a plate naming
    # two utilities falls back to the hedge instead of picking whichever sits higher. That guard is
    # what makes a three-way table safe: KAY/O's Sunset plates read exactly "Attacker Flash",
    # "Defender Knife", "Attacker Molly" — one word each. (Titles are NOT searched for ability words,
    # which is just as well: a chapter in the FLASH section is titled "...Pop Flash For Nerds" and a
    # title-searching resolver would have to disentangle that from the knife section's own titles.)
    "kay-o": [(r"\b(knife|zero.?point|suppress\w*)\b", "zero-point"),
              (r"\b(molly|molotov|frag|fragment|grenade|nade)\b", "fragment"),
              (r"\b(flash|flashdrive|pop.?flash)\b", "flashdrive")],
    # `dart` is deliberately NOT in the recon pattern even though "recon dart" is common speech,
    # because Sova's OTHER ability is literally called Shock Dart: the Sunset plates read "Attacker
    # Recon" and "Att Shock Dart", so a `dart` alternative would make every shock row match BOTH
    # patterns, hit the len(hits)==1 guard, and silently demote all 7 of them to the hedge. Matching
    # narrowly on the words that pick exactly one ability is the whole contract of this table.
    "sova": [(r"\b(recon|recon.?bolt|bolt)\b", "recon"),
             (r"\b(shock|shock.?dart)\b", "shock")],
}

argv = sys.argv[1:]
APPLY = "--apply" in argv
if APPLY:
    argv.remove("--apply")
# Chapters to leave out, by cs. The abort on unmapped titles is right by default — an unmapped title
# usually means the callout TABLE is short, and dropping the row would hide that. But some chapters
# genuinely are not placeable lineups and never will be: nic.vallabh's breeze/Phoenix source ends on
# "Bonus Trick 1"/"Bonus Trick 2", which name no callout because they are not throws at a map
# location. Excluding those has to be EXPLICIT and printed, never a silent filter, which is the whole
# reason the abort exists.
DROP = set()
if "--drop" in argv:
    i = argv.index("--drop")
    DROP = {int(x) for x in argv[i + 1].split(",") if x.strip()}
    argv = argv[:i] + argv[i + 2:]
NUMBER_DUPES = "--number-duplicates" in argv
if NUMBER_DUPES:
    argv.remove("--number-duplicates")
SIDE_DEFER = "--side-defer" in argv
if SIDE_DEFER:
    argv.remove("--side-defer")
SIDE_DEFAULT = None
if "--side-default" in argv:
    i = argv.index("--side-default")
    v = argv[i + 1].lower()
    SIDE_DEFAULT = {"attacker": "side_a", "defender": "side_b"}.get(v)
    if SIDE_DEFAULT is None:
        raise SystemExit(f"ABORT - --side-default must be 'attacker' or 'defender', got {v!r}")
    argv = argv[:i] + argv[i + 2:]
# Which field names the lineup, when the default longest-wins heuristic picks the wrong one.
# KAY/O's Sunset source is why this exists: it is sectioned by UTILITY, and the plate RENUMBERS
# inside each section while dropping the chapter's qualifiers — plate "MIDDLE 1"/"MIDDLE 3" against
# chapters "Mid Support 1"/"Top Mid Self Peek". Those share no token, so pick_name reads them as a
# conflict and takes the plate, losing "Support" and "Self Peek" on 8 rows. The plate is still used
# for side, ability and promo detection; only the NAME comes from the chapter.
NAME_FROM = "auto"
if "--name-from" in argv:
    i = argv.index("--name-from")
    NAME_FROM = argv[i + 1].lower()
    if NAME_FROM not in ("auto", "chapter", "plate"):
        raise SystemExit(f"ABORT - --name-from must be auto|chapter|plate, got {NAME_FROM!r}")
    argv = argv[:i] + argv[i + 2:]
CARDS_FILE = None
if "--cards" in argv:
    i = argv.index("--cards")
    CARDS_FILE, argv = Path(argv[i + 1]), argv[:i] + argv[i + 2:]
PACK = "PACKDEFAULT"
if "--pack" in argv:
    i = argv.index("--pack")
    PACK, argv = argv[i + 1], argv[:i] + argv[i + 2:]
if len(argv) < 3:
    raise SystemExit(__doc__)
AGENT, MAP, CH_FILE = argv[0], argv[1], Path(argv[2])
if PACK == "PACKDEFAULT":
    PACK = MAP

TABLE = CALLOUTS_BY_MAP.get(MAP)
if TABLE is None:
    raise SystemExit(f"ABORT - no callout table for map {MAP!r}; add one to reconcile_agent.py's "
                     f"CALLOUTS_BY_MAP first (derive_callouts.py {MAP}).")
if AGENT not in UNLABELLED:
    raise SystemExit(f"ABORT - no ability convention for agent {AGENT!r}; add it to UNLABELLED.")
PROVISIONAL, ABILITY_PROSE = UNLABELLED[AGENT]

ch = json.loads(CH_FILE.read_text(encoding="utf-8"))
chapters = ch["chapters"]
duration = ch.get("duration") or (chapters[-1]["end"] if chapters else 0)

# An intro chapter is the channel's title card, not a lineup. Recognise it by content, not by
# position: some sources open on a real lineup (Bonsai's Ascent Phoenix does).
# "outro" is spelled out rather than folded into the intro alternation because \bintro\b cannot match
# it — o-u-t-r-o does not contain the substring. Both HEHE XD sources close on a bare "OUTRO"/"Outro"
# chapter, which reached the callout lookup and failed it, and a promo chapter in `unmapped` makes a
# complete table look like it is missing an entry (the exact confusion is_title_card warns about).
INTRO = re.compile(r"\b(intro|introduction|outro|best .*lineups|lineups? (guide|ascent|\d{4})|"
                   r"valorant guide|subscribe|discord|untitled chapter)\b", re.I)


# Matched against the WHOLE title, not searched within it. AiltonVG closes on a chapter titled just
# "End", and a loose \bend\b in INTRO would be a landmine near real callouts — Lotus carries "C Bend"
# and Breeze "A Bend". Anchoring means only a chapter that says nothing but "end" is dropped.
BARE_END = re.compile(r"^\s*(the\s+)?end(ing)?\s*$", re.I)


def is_title_card(t):
    """A chapter that names the MAP alongside the word 'lineups' is the channel's title card.

    Covers both word orders the sources use — "KAYO Lineups Sunset" and "VIPER SUNSET LINEUPS" —
    which a single anchored regex kept getting wrong. Requiring the map name is what keeps it from
    eating a real lineup: no actual lineup title repeats the map it is already filed under.

    These have to be recognised HERE rather than left to fail the callout lookup, because `unmapped`
    is the signal that the TABLE is missing an entry. A promo chapter landing in that list makes a
    complete table look incomplete, and the fix for it (add a callout) would be wrong.
    """
    return bool(re.search(r"\blineups?\b", t, re.I)) and bool(re.search(rf"\b{re.escape(MAP)}\b",
                                                                       t, re.I))

# The leading `[(\[]?\s*` is not cosmetic: HEHE XD's Lotus Brimstone source marks its four defender
# rows "(DEFENCIVE) C MAIN FROM B SITE". The paren made this anchored pattern miss the author's own
# label on every one of them, and tier 1b missed it too (see SIDE_WORD_DEF), so the rows fell all the
# way through to the abort — the one thing this tier exists to prevent. A wrapper character around
# the label is formatting, not content.
SIDE_PREFIX = re.compile(r"^\s*[(\[]?\s*(ATT|ATTACK(?:ER)?|DEF|DEFEN(?:SE|DER|CE|CIVE))\b", re.I)
# `.+$` deliberately takes the whole tail — a stand can be several words ("from Defender Side
# Spawn") — but it stops at a bracket/paren because a trailing annotation is not part of the
# callout. Snapiex titles the utility that way: "A Main / Middle from Elbow [Toxic Screen]" was
# capturing "Elbow [Toxic Screen]" as the stand. That still RESOLVED (the zone lookup reads only the
# leading callout), which is exactly why it needed fixing here rather than being caught downstream —
# the wrong string was stored and then reused verbatim by the stand-partition tier and the duplicate
# name qualifier, where it compares unequal to a plain "Elbow" and reads as a different stand.
FROM_RE = re.compile(r"\bfrom\s+([^(\[]+)", re.I)

# Separator set and evidence gate are deliberately IDENTICAL to reconcile_agent.target_text — see its
# "THE REVERSED GRAMMAR" docstring. That function already splits `<STAND> to|- <TARGET>` and returns
# the right half; this returns the LEFT half of the same accepted split, so the two can never
# disagree about where the boundary is.
REVERSED_SEP = re.compile(r"\s+(?:to|[-–—>]|→)\s+", re.I)


def reversed_stand(title, table):
    """The STAND named by the reversed `<STAND> to <TARGET>` grammar, or None.

    Without this, a reversed-grammar title yields no stand at all: stand_callout is fed only by
    FROM_RE, which needs the word "from", so every row from such a source fell back to the
    placeholder (stand = target) and would have needed a whole --apply-stand pass to recover a stand
    the author had written down in the title all along. Quible's four sources and nic.vallabh's
    breeze/Phoenix source are all reversed-grammar (see <scratch>/title_grammar.py) — 40-odd rows.

    Same evidence gate as target_text: accepted ONLY when both halves independently resolve against
    THIS map's table, so a title that merely contains a dash or the word "to" is left alone.
    """
    s = re.sub(r"^\s*[\[(][^\])]*[\])]\s*", "", str(title or ""))
    s = re.split(r"[(\[]", s, maxsplit=1)[0]
    if not s.strip() or re.search(r"\bfrom\b", s, flags=re.I):
        return None
    parts = REVERSED_SEP.split(s, maxsplit=1)
    if len(parts) == 2 and all(callout_to_zone(p, table) for p in parts):
        return parts[0].strip()
    return None

# The author naming a side ANYWHERE in the title, not just as a prefix. "Default" is the word these
# must not eat, and they don't — it is defa-, not defen-.
SIDE_WORD_ATT = re.compile(r"\battack(?:er|ers|ing)?\b", re.I)
# `cive` covers HEHE XD's consistent "DEFENCIVE" misspelling. SIDE_PREFIX already carried it, so the
# spelling was known — it just was not mirrored here, and tier 1b is the branch that actually runs
# when the label is not at the very start of the title. Keep the two alternations in step.
SIDE_WORD_DEF = re.compile(r"\bdefen(?:se|ce|der|ders|ding|sive|cive)\b", re.I)


def side_text(title):
    """The title with its "from <stand>" clause removed, for the side scan only.

    A side word inside the from-clause describes where the player STANDS, not the lineup's role —
    "... From Attacker Side Spawn" is a location, and reading it as the author declaring a side
    would be the same conflation `target_text` exists to prevent on the target. Brackets are
    deliberately KEPT (unlike target_text): a parenthetical is exactly where a creator puts
    "(defense side)", so stripping them here would discard the evidence being looked for.

    The REVERSED grammar needs the same treatment, and for a live reason: Quible's haven/Brimstone
    source has a chapter "Defender Spawn - B Site", where "Defender" is the STAND's name. With only
    the from-clause stripped, tier 1b would read that as the author declaring the side and label the
    row side_b on the strength of a location — the precise conflation this function exists to
    prevent, arriving through the one grammar it did not cover. Only the half that the evidence gate
    accepted as the stand is removed, so a genuine side word elsewhere in the title still counts.
    """
    t = str(title or "")
    lead = reversed_stand(t, TABLE)
    if lead:
        # ...but the strip must not eat a side word the location does not NEED. AiltonVG's
        # breeze/Fade source titles its mid lineups "Mid Attack - Mid Info 1" and "Defense Mid -
        # Info mid". Both halves resolve (mid / mid), so the whole left half was being deleted —
        # taking the author's own ATTACK/DEFENSE word with it — and all three mid rows shipped
        # side-unresolved while the A- and B-site rows (whose right half "Lineup 1" resolves to
        # nothing) kept theirs. The distinguishing test is whether the lead still resolves with the
        # side word REMOVED: "Mid Attack" -> "Mid" still resolves, so the word is a role label and
        # survives; "Defender Spawn" -> "Spawn" does not resolve, so the word is part of the
        # location's name and is discarded exactly as before.
        bare = SIDE_WORD_DEF.sub(" ", SIDE_WORD_ATT.sub(" ", lead)).strip()
        keep = ""
        if bare and callout_to_zone(bare, TABLE):
            keep = " ".join(m.group(0) for m in
                            list(SIDE_WORD_ATT.finditer(lead)) + list(SIDE_WORD_DEF.finditer(lead)))
        t = t.replace(lead, " %s " % keep, 1)
    return re.split(r"\bfrom\b", t, maxsplit=1, flags=re.I)[0]

CARDS = {}
if CARDS_FILE:
    doc = json.loads(CARDS_FILE.read_text(encoding="utf-8"))
    if doc.get("video_id") != ch["video_id"]:
        raise SystemExit(f"ABORT - cards file is for video {doc.get('video_id')!r}, chapters are "
                         f"for {ch['video_id']!r}")
    CARDS = {int(c["cs"]): c for c in doc["cards"]}


# A plate reading only "<SITE> [n]" is a CATEGORY heading, not a name. This creator splits the
# information across the plate's two lines — "A SITE / Execute Molly", "A SITE 1 / Antiplant Molly"
# — while the chapter title carries the whole thing ("A Execute Molly", "A Anti Plant 1 From A
# Link"). Taking the name line alone there would both lose the utility and COLLIDE: cs 445 and cs
# 486 are different lineups whose plates both read "A SITE".
BARE_SITE = re.compile(r"^\s*[ab]\s*site\s*\d*\s*$", re.I)


def pick_name(title, card):
    """Chapter title vs the on-screen plate. The longer one wins when one contains the other
    (the chapter often adds a real qualifier: plate "A Default 1" vs chapter "A Default Plant 1",
    and "Plant" is exactly the word the side evidence rests on). When they genuinely CONFLICT the
    plate wins — it is what the creator put in the video, the chapter title is a later index."""
    if NAME_FROM == "chapter":
        return title, "chapter (--name-from chapter)"
    if NAME_FROM == "plate" and card:
        return card, "card (--name-from plate)"
    if not card:
        return title, "chapter"
    if BARE_SITE.match(card):
        return title, "chapter (plate name line is a bare site label)"
    a, b = set(re.findall(r"[a-z0-9]+", title.lower())), set(re.findall(r"[a-z0-9]+", card.lower()))
    if b < a:
        return title, "chapter (superset of card)"
    if a < b or a == b:
        return card, "card"
    return card, "card (CONFLICTS with chapter %r)" % title


def is_promo(c):
    """Intro / outro / channel plug — anything that is not a lineup.

    Judged on the on-screen PLATE as well as the chapter title, because a creator will happily give
    a promo chapter a lineup-shaped name: the Brimstone/Sunset outro is titled "The Most Important
    Lineup" while its plate reads SUBSCRIBE / Like & Comment. Title-only, that chapter builds into
    a real row and gets localized — 30s of an outro screen sent to the gate as a lineup.
    """
    plate = (CARDS.get(int(c["cs"])) or {}).get("name") or ""
    for t in (c["title"] or "", plate):
        if t and (INTRO.search(t) or is_title_card(t) or BARE_END.match(t)):
            return True
    return False


rows, skipped, unmapped, ambiguous_side = [], [], [], []
target_fallbacks, target_conflicts, reversed_refused = [], [], []
kept = [c for c in chapters if not is_promo(c) and int(c["cs"]) not in DROP]
for c in chapters:
    if c not in kept:
        skipped.append(c["title"])
dropped = [c for c in chapters if int(c["cs"]) in DROP]
if DROP and len(dropped) != len(DROP):
    raise SystemExit(f"ABORT - --drop named cs {sorted(DROP)} but only "
                     f"{sorted(int(c['cs']) for c in dropped)} exist in this chapter list. A cs that "
                     f"matches nothing means the wrong source or a typo, and would drop nothing "
                     f"while looking like it had.")

for i, c in enumerate(kept):
    cs, chapter_title = int(c["cs"]), (c["title"] or "").strip()
    nxt = int(kept[i + 1]["cs"]) if i + 1 < len(kept) else int(c.get("end") or duration)
    card = CARDS.get(cs)
    title, name_src = pick_name(chapter_title, (card or {}).get("name"))

    # Side tiers 1-2 here; tier 3 (the source's own stand partition) needs every row first.
    plate_role = (card or {}).get("ability")
    # Matched against side_text, not the raw title, for the same reason tier 1b is: in the reversed
    # grammar the STAND leads the title, so "Defender Spawn - B Site" put the word "Defender" in the
    # one position this anchored pattern trusts absolutely, and the row was labelled side_b off a
    # location. side_text removes only the half the evidence gate accepted as the stand, and an
    # anchored prefix can be lost by that strip ONLY when the prefix is itself the stand's first
    # word — which is exactly the case to reject.
    m = SIDE_PREFIX.match(side_text(title))
    side, side_src = None, None
    if m:
        side, side_src = ("side_a" if m.group(1).lower().startswith("att") else "side_b"), "prefix"
    else:
        # Tier 1b: the author names the side ANYWHERE in the title, not just as a prefix. Both
        # Sunset Phoenix sources do ("A Attack plant 1", "A Site - Defender Molly") and neither
        # matches SIDE_PREFIX, which is anchored. This has to outrank SIDE_PHRASES below:
        # "A Defense plant 1" hits `\bplant\b` -> attacker, i.e. the corpus heuristic would have
        # OVERTURNED the author's own word. Author label beats inference — the same rule that
        # governs side/ability everywhere else in this pipeline.
        # The PLATE's second line is scanned here too, not just the title. Tseeky's Sunset Fade
        # source prints "Attacker Haunt" / "Defender Haunt" under every name — the author stating
        # the side outright, on screen, on all 27 rows — and a title-only scan would see none of it
        # and fall through to inferring from words like "Retake".
        st = f"{side_text(title)} {side_text(chapter_title)}"
        att = SIDE_WORD_ATT.search(f"{st} {side_text(plate_role)}")
        dfn = SIDE_WORD_DEF.search(f"{st} {side_text(plate_role)}")
        if att and not dfn:
            side, side_src = "side_a", "author states 'attack/attacker' on the title plate or title"
        elif dfn and not att:
            side, side_src = "side_b", "author states 'defense/defender' on the title plate or title"
        elif att and dfn:
            # Naming both is not evidence of either. Fall through to the later tiers rather than
            # pick whichever matched first.
            ambiguous_side.append((cs, title))
        # Tiers 1c then 2, same phrase table, different evidence. The PLATE is scanned first and
        # separately from the title: "Antiplant Molly" printed on screen is the author naming the
        # utility's role, whereas the same word inferred from a chapter title is a weaker claim, and
        # the printed provenance should say which one a row is resting on. Where a source labels
        # every row on the plate (Brimstone/Sunset does) the title tier never fires at all.
        if side is None:
            for where, text in (("title plate", plate_role), ("title", st)):
                if not text:
                    continue
                for pat, s, why in SIDE_PHRASES:
                    if re.search(pat, text, re.I):
                        side, side_src = s, f"{where} — {why}"
                        break
                if side:
                    break

    # The NAME and the CHAPTER TITLE are two descriptions of the SAME lineup, and the callout can
    # live in either one. pick_name optimises for a readable name, not for a resolvable target, so
    # when its choice carries no callout the other field still gets a turn. Sova/Sunset is the case
    # that forces it: the shock-dart section's plates read "B TRAPS 1" (and "traps" is not a callout
    # anywhere) while the chapter titles read "Attacker Shock Dart For Cypher Trips On B 1", whose
    # `cypher trips on b` IS an explicit Sunset table entry. Without the fallback those 6 rows abort
    # the build and the obvious "fix" is to invent a `traps` callout — inventing a zone to paper over
    # a field-selection bug.
    # This is also what makes check_table_coverage.py's verdict TRUE rather than merely optimistic:
    # that script judges CHAPTER TITLES, so it passed this source clean while the builder went on to
    # drop 6 rows. Front-runner and builder now agree on what "mapped" means.
    t_name = target_zone(title, TABLE)
    t_chap = (target_zone(chapter_title, TABLE)
              if chapter_title and chapter_title != title else t_name)
    target, target_src = t_name, "name"
    if t_name and t_chap and t_name != t_chap:
        # Both resolve and they disagree. The CHAPTER wins: a plate is very often a section-numbered
        # CATEGORY rather than a destination — "A INFO 4" against the chapter's "A Main Mid Round
        # Info", the same failure BARE_SITE already guards for "A SITE 2" — so the fuller chapter
        # title is the better witness for WHERE the utility goes. The plate stays authoritative for
        # side and ability, which it states outright instead of implying.
        target, target_src = t_chap, f"chapter title (DISAGREES with name {title!r} -> {t_name})"
        target_conflicts.append((cs, title, t_name, chapter_title, t_chap))
    elif not t_name and t_chap:
        target, target_src = t_chap, f"chapter title (the name {title!r} carries no callout)"
        target_fallbacks.append((cs, title, chapter_title, t_chap))
    if not target:
        unmapped.append((cs, title))
        continue

    # STAND: the card's in-game location readout when there is one, else only when the author
    # states it in the title. Otherwise placeholder = target, replaced by --apply-stand. This is
    # the field most likely to be wrong, so it is never inferred from map knowledge here.
    fm = FROM_RE.search(title)
    rev = reversed_stand(title, TABLE)
    stand_callout = (card or {}).get("stand") or (fm.group(1).strip() if fm else None) or rev

    # A refused reversed split is SILENT and mis-targets: with no "from" and no accepted split, the
    # whole title is matched and the first table hit wins — which in `<STAND> - <TARGET>` order is
    # the STAND. "B Main - Stair" recorded target=b-main because "Stair" is not in the haven table,
    # and nothing downstream can see it: the title DOES resolve, so check_callouts.py reports zero
    # unmapped and the row looks healthy. Only the operator's eyeball would ever catch it, one pin
    # at a time. Warn here instead — the unresolved half is almost always a real callout missing
    # from the table, which is a one-line fix once you know to make it.
    # ...but only when the unresolved half is a PLACE that the table is missing, not a role label.
    # A third grammar writes `<TARGET> - <SIDE+ABILITY>` ("C Site - Defender Molly", 37 rows across
    # Quible's three Phoenix sources), which is structurally identical to a refused reversed split:
    # left half resolves, right half does not. There the fallback is already RIGHT — the left half
    # genuinely is the target, and tier 1b reads "Defender" as the author's side label. Warning on
    # those would bury the one real case ("B Main - Stair") in 37 false ones, and the obvious "fix"
    # for them — adding "Defender Molly" to the callout table — would be actively wrong.
    if not fm and rev is None and REVERSED_SEP.search(re.split(r"[(\[]", title, maxsplit=1)[0]):
        halves = REVERSED_SEP.split(re.split(r"[(\[]", title, maxsplit=1)[0], maxsplit=1)
        bad = [h.strip() for h in halves if not callout_to_zone(h, TABLE)]
        role_pats = [SIDE_WORD_ATT, SIDE_WORD_DEF] + [re.compile(p) for p, _ in
                                                      ABILITY_WORDS.get(AGENT, [])]
        # Require the LEFT half to resolve as well. Only then is the mis-target real: the fallback
        # scans the whole string and takes the first hit, so a left half that resolves IS what the
        # target silently becomes. When the left half does not resolve either, the fallback keeps
        # searching and lands on whatever does — bare "C - Attacker Molly" on Lotus still reaches
        # c-site correctly — so there is nothing to warn about and saying so would just train the
        # reader to skip this whole block.
        left_ok = bool(callout_to_zone(halves[0], TABLE))
        if bad and left_ok and not all(any(p.search(h) for p in role_pats) for h in bad):
            reversed_refused.append((cs, title, bad))
    stand = (callout_to_zone(stand_callout, TABLE) if stand_callout else None) or target
    if stand_callout and not callout_to_zone(stand_callout, TABLE):
        unmapped.append((cs, f"[stand] {stand_callout}"))
        continue

    # ABILITY: the plate's own words when they name exactly one of the agent's two candidates,
    # else the a|b hedge prose so the gate decides. Never guessed from the chapter title — a title
    # says where the utility goes, not which utility it is.
    slug, ability_prose, ability_src = PROVISIONAL, ABILITY_PROSE, None
    if plate_role:
        hits = {s for pat, s in ABILITY_WORDS.get(AGENT, []) if re.search(pat, plate_role, re.I)}
        if len(hits) == 1:
            slug = next(iter(hits))
            ability_prose = (f"{slug} - the author LABELS it {plate_role!r} on the on-screen "
                             f"title plate; verify the landing matches that utility")
            ability_src = f"plate {plate_role!r}"

    rows.append({"nn": f"{len(rows) + 1:02d}", "cs": cs, "next": nxt, "ability": ability_prose,
                 "name": title, "target": target, "stand": stand, "side": side,
                 "chapter_title": chapter_title, "target_src": target_src,
                 "author_gave_stand": bool(stand_callout), "name_src": name_src,
                 "stand_callout": stand_callout, "side_src": side_src,
                 "ability_slug": slug, "ability_src": ability_src})

# --- side tier 3: the source's own stand partition -------------------------------------------
# Only meaningful when the cards gave real stand callouts; a placeholder stand is a copy of the
# target and would partition on nothing.
by_stand, n_labelled = {}, {}
for r in rows:
    if r["side"] and r["stand_callout"]:
        k = r["stand_callout"].strip().lower()
        by_stand.setdefault(k, set()).add(r["side"])
        n_labelled[k] = n_labelled.get(k, 0) + 1

# A partition needs BOTH classes present to be a partition. When every title-labelled row in a source
# carries the same side, "this stand is only ever defender" and "only defender rows happen to be
# labelled" are the same observation, and the tier would sweep the unlabelled majority into that one
# side while reporting it as evidence. HEHE XD's Lotus Brimstone source is the case: it marks exactly
# four rows "(DEFENCIVE)" and leaves the other 24 bare, so the labels are EXCEPTION marks, not a
# sample — the stands they name (B Site, A Site) also appear on bare rows, which would have inherited
# defender from a set that never had an attacker row to contrast against. Same failure this campaign
# already hit cross-source on Viper/Sunset (117/117 attacker, but zero defender Viper rows existed),
# caught there by check_side_independence.py; this is the within-source form of it.
_classes = {s for sides in by_stand.values() for s in sides}
if len(_classes) < 2:
    if by_stand:
        print(f"  !! stand partition DISABLED — all {sum(n_labelled.values())} title-labelled row(s) "
              f"are {next(iter(_classes))}. With no contrasting side the partition would assign by "
              f"absence of evidence, not evidence. Falling through to --side-default/--side-defer.")
    by_stand = {}

for r in rows:
    if r["side"]:
        continue
    k = (r["stand_callout"] or "").strip().lower()
    seen = by_stand.get(k, set())
    if len(seen) == 1:
        r["side"] = next(iter(seen))
        r["side_src"] = (f"stand partition — the stand is {r['side']} on every one of the "
                         f"{n_labelled[k]} title-labelled rows that share it")
    elif SIDE_DEFAULT is not None:
        r["side"], r["side_src"] = SIDE_DEFAULT, "--side-default"
    elif SIDE_DEFER:
        r["side"], r["side_src"] = None, "--side-defer"
    else:
        why = ("appears on BOTH sides in this source" if len(seen) > 1
               else "appears on no side-labelled row in this source")
        raise SystemExit(
            f"ABORT - chapter {r['cs']} {r['name']!r} carries no ATT/DEF prefix, no phrase whose "
            f"side is consistent in the shipped corpus, and its stand "
            f"{r['stand_callout']!r} {why}. Side cannot be recovered downstream (the localizer's "
            f"call is unreliable on practice servers). Run `derive_side.py <phrase>` for this "
            f"source's vocabulary; if the evidence is genuinely absent, decide it and pass "
            f"--side-default explicitly.")

# A name that repeats is not a name. BARE_SITE handles the known way a plate turns into a category,
# but it is a per-source observation, so check the invariant it exists to protect rather than trust
# that one rule covers every future source. Reported, not fatal — two chapters CAN legitimately
# carry the same text, and the operator's eyeball gate is where that gets judged.
dupes = {}
for r in rows:
    dupes.setdefault(r["name"].strip().lower(), []).append(r)
dupes = {k: v for k, v in dupes.items() if len(v) > 1}
# Neither name source fixes a collision the SOURCE itself has: KAY/O's Sunset video is sectioned by
# utility and reuses "A Main" for its flash and its knife, and "B Main 1" for an attacker flash and a
# defender flash — plate and chapter collide identically. Qualify with the field that actually
# differs, in the author's own vocabulary (the plate's role line), rather than inventing a number.
# Only touches rows already proven to collide; a row with a unique name is never renamed.
SIDE_WORD = {"side_a": "Attacker", "side_b": "Defender"}


def utility_word(r):
    """The author's own word for the utility — ability_src is "plate 'Attacker Knife'"."""
    m = re.search(r"'([^']*)'", r["ability_src"] or "")
    words = (m.group(1) if m else "").split()
    return words[-1] if words else (r["ability_slug"] or "")


for k, rs in dupes.items():
    # Test the QUALIFIER for distinctness, not the field it is derived from. "plate 'Attacker
    # Flash'" and "plate 'Defender Flash'" are different strings that both reduce to "Flash", so
    # checking the raw field passed and then renamed both rows to "B Main 1 (Flash)" — a collision
    # dressed up as a fix, which is worse than the collision.
    # STAND is the third axis because a source can repeat a name across rows that share BOTH the
    # ability and the side, which exhausts the other two. nic.vallabh's sibling Sunset Phoenix
    # source is the case: six chapters named only "A Site - Attacker Molly" / "A Site - Defender
    # Molly", i.e. three rows per side with one utility — ability and side are constant WITHIN each
    # colliding group by construction, so neither can ever separate them. The stand does: VALORANT's
    # own location readout puts the three defender rows in A Main / A Link / Defender Side Spawn.
    # That is the author's vocabulary in the same sense the other two axes are (the game's own words
    # rather than the editor's), not an invented ordinal, and it is the field a viewer actually needs
    # to tell two same-target lineups apart. It is tried LAST because when a source does label the
    # utility or the side, that label is the more direct answer to "why are these two different".
    AXES = (("ability", utility_word),
            ("side", lambda r: SIDE_WORD.get(r["side"], "")),
            ("stand", lambda r: f"from {r['stand_callout']}" if r["stand_callout"] else ""))

    def qualify(axis, targets, quals):
        for r, q in zip(targets, quals):
            r["name"] = f"{r['name']} ({q})"
            r["name_src"] += (f" +qualified by {axis} (name collided with cs "
                              + ", ".join(str(o["cs"]) for o in rs if o is not r) + ")")

    whole = next(((a, qs) for a, qs in ((a, [f(r) for r in rs]) for a, f in AXES)
                  if all(qs) and len(set(qs)) == len(qs)), None)
    if whole:
        qualify(whole[0], rs, whole[1])
        continue
    # No axis separates the WHOLE group, so qualify the rows one can separate instead of leaving
    # every row bare. Phoenix/Sunset is the case: three rows named "A Site - Attacker Molly" stand
    # in A Lobby, A Elbow and A Elbow. The all-or-nothing rule above rejects that axis over the
    # A Elbow tie and then leaves all THREE indistinguishable — including the A Lobby row, which was
    # never ambiguous. Renaming only the rows whose qualifier is unique cannot recreate the failure
    # the all-or-nothing rule guards against (two rows renamed to the SAME thing), because a
    # qualifier that repeats is exactly what disqualifies a row here. The genuinely tied rows keep
    # the bare name and are still reported below as unresolved, which is the honest outcome: they
    # differ on nothing this source states.
    best = max((( [i for i, q in enumerate(qs) if q and qs.count(q) == 1], a, qs)
                for a, qs in ((a, [f(r) for r in rs]) for a, f in AXES)), key=lambda t: len(t[0]))
    idx, axis, qs = best
    if idx:
        qualify(axis, [rs[i] for i in idx], [qs[i] for i in idx])
    # Last resort, and OFF unless asked for: number the rows no stated field can separate. Quible's
    # four sources are why it exists — the titles carry stand and target and nothing else, so four
    # chapters are all "A Lobby - A Site", and every axis above is constant across them by
    # construction (one utility, one deferred side, one stand). The footage cannot break the tie
    # either: this creator opens each lineup with a camera flythrough, so the location readout at
    # +3.0s and +9.0s reports wherever the camera drifted (C Long, Mid Window, A Garden on an A Wine
    # / A Lobby video) rather than the stand, and there is no on-screen plate at all.
    # An ordinal is genuinely weaker than the other three axes, which is why it is opt-in and why it
    # says "1st in source" rather than dressing itself up as a callout: it states the one thing that
    # IS true and checkable — this is the Nth such lineup in this video, in the author's own order.
    # The alternative is dropping four real lineups because their author gave them one name.
    if NUMBER_DUPES:
        still = [r for r in rs if r["name"].strip().lower() == k]
        for n, r in enumerate(still, 1):
            r["name"] = f"{r['name']} ({n} of {len(still)} in source)"
            r["name_src"] += f" +numbered by source order (--number-duplicates; cs={r['cs']})"
if dupes:
    print(f"!! {len(dupes)} name(s) were used by more than one lineup:")
    for k, rs in dupes.items():
        for r in rs:
            fixed = r["name"].strip().lower() != k
            print(f"   {'fixed' if fixed else '!!!!!'} cs={r['cs']:<5} {r['name']!r}  "
                  f"[{r['name_src']}]  chapter={r['chapter_title']!r}")
    if any(r["name"].strip().lower() == k for k, rs in dupes.items() for r in rs):
        print("   rows still sharing a name differ on NEITHER ability, side NOR stand — they ship "
              "indistinguishable; fix the name source or split them by hand. Two rows this alike "
              "may also be the SAME lineup filmed twice: check before shipping both.")

if reversed_refused:
    print(f"!! {len(reversed_refused)} title(s) look like the reversed `<STAND> - <TARGET>` grammar "
          f"but one half does not resolve, so the split was REFUSED and the target fell back to the "
          f"first table hit — which in this word order is the STAND. Add the missing callout to "
          f"this map's table in reconcile_agent.py, or confirm the row is not reversed grammar:")
    for cs, t, bad in reversed_refused:
        print(f"   cs={cs:<5} {t!r}   unresolved half/halves: {bad}")

if target_conflicts:
    print(f"!! {len(target_conflicts)} row(s) where the NAME and the CHAPTER TITLE resolve to "
          f"DIFFERENT zones — the chapter won; verify each at the eyeball gate:")
    for cs, nm, zn, ct, zc in target_conflicts:
        print(f"   cs={cs:<5} name={nm!r} -> {zn}   BUT chapter={ct!r} -> {zc}  (using {zc})")

if target_fallbacks:
    # Never silent: the target is the field that decides where a lineup is drawn on the minimap, so
    # a row whose target came from the OTHER field than its name is exactly what the operator's
    # eyeball gate should be pointed at first.
    print(f"-- {len(target_fallbacks)} row(s) took the TARGET from the chapter title because the "
          f"chosen name carries no callout — check these at the eyeball gate:")
    for cs, nm, ct, z in target_fallbacks:
        print(f"   cs={cs:<5} name={nm!r} -> {z}   via chapter={ct!r}")

if dropped:
    print(f"!! {len(dropped)} chapter(s) EXCLUDED by --drop — these are not in the pack and will "
          f"never be localized; confirm each is genuinely not a placeable lineup:")
    for c in dropped:
        print(f"   cs={int(c['cs']):<5} {c['title']!r}")

if unmapped:
    print(f"!! {len(unmapped)} chapter(s) whose title maps to NO zone on {MAP} - "
          f"extend the callout table, do not drop them silently:")
    for cs, t in unmapped:
        print(f"   cs={cs:<5} {t}")
    raise SystemExit("ABORT - refusing to build a partial item list")


def placeholder_spans(cs, end):
    e = float(end)
    st = min(cs + 1.0, e - 4.0) if e - cs > 6 else cs + 0.5
    return {"stand": [round(st, 2), round(st + 2, 2)],
            "aim": [round(st + 2, 2), round(st + 2.4, 2)],
            "throw": [round(st + 2.4, 2), round(st + 2.9, 2)],
            "landing": [round(min(st + 4.5, e - 0.5), 2), round(min(st + 5.5, e), 2)]}


items_path = HERE / f"items_{AGENT}_{MAP}.json"
pack_path = BE / "scripts" / f"{AGENT}-spans" / f"{PACK}.json"
pack = {"video_id": ch["video_id"], "map_slug": MAP,
        "author": ch.get("uploader") or "unknown",
        "lineups": [{"cs": r["cs"], "title": r["name"], "ability": r["ability_slug"],
                     "technique": "standing", "target": r["target"], "stand": r["stand"],
                     "side": r["side"], "spans": placeholder_spans(r["cs"], r["next"])}
                    for r in rows]}

print(f"{AGENT} / {MAP} / {ch['video_id']} [{pack.get('author')}]")
print(f"  chapters={len(chapters)}  intro-skipped={len(skipped)}  lineups={len(rows)}")
for r in rows:
    star = f"  [{r['stand_callout']}]" if r["author_gave_stand"] else \
        "  (stand=placeholder, needs --apply-stand)"
    print(f"  {r['nn']} cs={r['cs']:<5} {r['side']}  {r['stand']:9}->{r['target']:9} "
          f"{r['name'][:40]:40}{star}")
n_auth = sum(1 for r in rows if r["author_gave_stand"])
print(f"\n  stand is known on {n_auth}/{len(rows)} rows; the rest REQUIRE --apply-stand")
renamed = [r for r in rows if r["name_src"].startswith("card (CONFLICTS")]
if renamed:
    print(f"\n  !! {len(renamed)} row(s) where the on-screen plate CONTRADICTS the chapter title "
          f"— the plate wins:")
    for r in renamed:
        print(f"     cs={r['cs']:<5} {r['name']:20} {r['name_src']}")
if skipped:
    print(f"  intro chapters skipped: {skipped}")
if ambiguous_side:
    print(f"\n  !! {len(ambiguous_side)} title(s) name BOTH sides — side came from a later tier, "
          f"check these at the eyeball gate:")
    for cs, t in ambiguous_side:
        print(f"     cs={cs:<5} {t}")

n_lab = sum(1 for r in rows if r["ability_src"])
print(f"\n  ability is AUTHOR-LABELLED on {n_lab}/{len(rows)} rows"
      + ("" if n_lab == len(rows) else f"; the other {len(rows) - n_lab} carry the {AGENT} a|b hedge "
                                       f"and need --apply-ability from the localizer"))
by_ability = {}
for r in rows:
    by_ability.setdefault((r["ability_slug"], r["ability_src"]), []).append(r["nn"])
for (slug, src), nns in sorted(by_ability.items(), key=lambda kv: -len(kv[1])):
    print(f"     {slug:16} x{len(nns):<3} {src or 'PROVISIONAL — the gate decides'}")

# Side provenance, loudest first: rows resting on --side-default (decided, not evidenced) or
# --side-defer (not decided at all) are the ones to raise at the operator's eyeball gate.
LOUD = ("--side-default", "--side-defer")
prov = {}
for r in rows:
    prov.setdefault(r["side_src"], []).append(r)
for src in sorted(prov, key=lambda s: (s not in LOUD, s)):
    rs = prov[src]
    tag = {"--side-default": "!! DECIDED, NOT EVIDENCED",
           "--side-defer": "!! UNRESOLVED - stays pending_review until a side is supplied"}
    print(f"\n  side from {src} — {len(rs)}/{len(rows)} rows   "
          f"{tag.get(src, 'evidence: ' + src)}")
    if src in LOUD or src.startswith("stand partition"):
        for r in rs:
            print(f"     {r['nn']} cs={r['cs']:<5} {str(r['side']):7}  {r['name']}")
if SIDE_DEFER and any(r["side"] is None for r in rows):
    n = sum(1 for r in rows if r["side"] is None)
    print(f"\n  NOTE: {n} row(s) carry side=null. Localization is unaffected (to_workflow_items.py "
          f"drops side), but accept will leave them pending_review. Resolve from a second source "
          f"for this agent/map, or at the eyeball gate, before shipping.")

if not APPLY:
    print("\nDRY RUN - re-run with --apply to write the items file and the skeleton pack.")
    sys.exit(0)
if pack_path.exists():
    raise SystemExit(f"ABORT - {pack_path} already exists; writing would destroy localized spans. "
                     f"Use --pack <other-stem> or move it aside deliberately.")
pack_path.parent.mkdir(parents=True, exist_ok=True)
items_path.write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
pack_path.write_text(json.dumps(pack, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"\n-> {items_path}\n-> {pack_path}")
