"""Derive a per-(agent, map) localizer instructions file from an existing one.

The instructions files are ~85% agent-general (ability signatures, the 4 events, mode-invariance,
the honesty contract, tooling) and ~15% map/source-specific (which map, which creator, which
callouts, which title-grammar examples). With 21 buckets left, hand-writing a fresh 134-line doc per
bucket invites drift in the GENERAL part — which is where the hard-won rules live. This copies the
source doc and rewrites only the map/source-specific spans, leaving everything else byte-identical,
and prints a full diff so the rewrite is auditable before it is written.

  python make_instructions.py FADE summit ascent [--apply]

Two kinds of rewrite:
  * the map NAME, as a word, anywhere (title line, prose, "the Summit callouts").
  * BLOCKS — a markdown bullet whose first line contains a marker, through its indented
    continuation lines. Callout lists and title-grammar examples wrap across 2-3 lines, so a
    line-at-a-time rewrite would swap the first line and silently leave the rest naming the old
    map's callouts. That is the specific failure this handles.
"""
import difflib
import re
import sys
import tempfile
from pathlib import Path

# The docs are UTF-8 (arrows, em dashes); this console is cp1252 and would die printing the diff.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BE = Path(__file__).resolve().parents[1]  # scripts/ -> backend/

# The corpus this rewrites documents WITH -- see make_instructions_data.py. Sibling import:
# these scripts run as `python scripts/make_instructions.py`, so scripts/ is sys.path[0].
from make_instructions_data import EXAMPLES, MAPS  # noqa: E402

APPLY = "--apply" in sys.argv


def opt(flag):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else None


VIDEO, CREATOR = opt("--video"), opt("--creator")
pos = [a for a in sys.argv[1:] if not a.startswith("--")]
if VIDEO:
    pos = [p for p in pos if p != VIDEO]
if CREATOR:
    pos = [p for p in pos if p != CREATOR]
if len(pos) < 3:
    raise SystemExit(__doc__)
AGENT, SRC_MAP, DST_MAP = pos[0], pos[1].lower(), pos[2].lower()

cfg = MAPS.get(DST_MAP)
if cfg is None:
    raise SystemExit(f"ABORT - no callouts for {DST_MAP!r}. Add an entry to MAPS (derive it with "
                     f"`derive_callouts.py {DST_MAP}`) rather than shipping a doc that still lists "
                     f"{SRC_MAP}'s callouts.")
examples = EXAMPLES.get((AGENT, DST_MAP))
if examples is None:
    raise SystemExit(f"ABORT - no title-grammar examples for ({AGENT}, {DST_MAP}). Paste REAL "
                     f"chapter titles from THAT source into EXAMPLES; the {SRC_MAP} examples "
                     f"describe a different source's grammar and would mislead the localizer.")

src = BE / "scripts" / f"LOCALIZE_INSTRUCTIONS_{AGENT}.md"
dst = BE / "scripts" / f"LOCALIZE_INSTRUCTIONS_{AGENT}_{DST_MAP.upper()}.md"
if not src.exists():
    raise SystemExit(f"ABORT - {src} not found")

before = src.read_text(encoding="utf-8")
lines = before.splitlines()


NEW_BLOCK = re.compile(r"^\s*(?:[-*#>]|```|\d+\.)")


def block_span(marker):
    """[start, end) of the markdown block containing `marker`, incl. its wrapped continuation lines.

    Continuation is "not blank and not the start of a new block" — NOT "indented". Markdown wraps
    a bullet's overflow indented but a paragraph's overflow at column 0, and an indent-only rule
    silently kept the old map's example titles while rewriting the sentence that introduced them.
    """
    hits = [i for i, ln in enumerate(lines) if marker in ln]
    if len(hits) != 1:
        raise SystemExit(f"ABORT - marker {marker!r} matched {len(hits)} lines; expected exactly 1. "
                         f"The source doc changed shape - re-check before rewriting it blind.")
    i = hits[0]
    j = i + 1
    while j < len(lines) and lines[j].strip() and not NEW_BLOCK.match(lines[j]):
        j += 1
    return i, j


def wrap(text, width=99, indent="  "):
    out, cur = [], ""
    for word in text.split(" "):
        if cur and len(cur) + 1 + len(word) > width:
            out.append(cur)
            cur = indent + word
        else:
            cur = f"{cur} {word}" if cur else word
    return out + ([cur] if cur else [])


# Rewrite the wrapped blocks first (by index, from the bottom, so earlier spans stay valid).
CALLOUT_MARK = "callouts you may see"
# Finding the block and writing its lead-in are different jobs. The Phoenix doc says "Chapter
# titles on THESE SOURCES read" (it was built from two videos) where the others say "on this
# source", so a single exact string both finds and writes was guaranteed to miss one of them.
# Match on the stable prefix; always write the canonical singular form.
EXAMPLE_FIND = "Chapter titles on th"
EXAMPLE_WRITE = "Chapter titles on this source read"
blocks = []
i, j = block_span(CALLOUT_MARK)
blocks.append((i, j, wrap(f"- {DST_MAP.capitalize()} callouts you may see: {cfg['callouts']}")
               + wrap(f"- {cfg['note']}")))
i, j = block_span(EXAMPLE_FIND)
# The lead-in states the source's title GRAMMAR, so it is source-specific too: the Summit
# Brimstone doc says titles read "<TARGET> from <STAND>", which is false of the Ascent source
# (its titles are bare target names and the stand comes from the in-game readout). Keeping the
# old lead-in and swapping only the examples after "e.g." left a doc whose first clause
# contradicted its own examples. A dict entry replaces the lead-in; a plain string keeps it.
head = lines[i].split(" — e.g.")[0].rstrip()
spec = examples if isinstance(examples, dict) else {}
if spec:
    head = f"{EXAMPLE_WRITE} {spec['grammar']}"
    examples = spec["examples"]
blocks.append((i, j, wrap(f"{head} — e.g. {examples}", indent="")))

# Optional per-source bullet overrides. The source docs carry claims that are true of the video
# they were written from and false elsewhere. The Phoenix doc is the reason this exists: it asserts
# "STAND and TARGET both come from the title" (on Bonsai's Ascent source the stand comes from the
# in-game readout and is supplied in the item) and, worse, "SIDE is NOT labelled by these authors.
# Infer it geometrically" — which is precisely the map-knowledge guessing build_items.py aborts to
# prevent, and which reconcile discards anyway since the pack's side is authoritative. Left in
# place it would have had every subagent producing confident, unfounded side calls.
for marker, replacement in spec.get("bullets", []):
    bi, bj = block_span(marker)
    blocks.append((bi, bj, wrap(replacement)))

# The `## Source — <id> (<creator>)` heading names a DIFFERENT video for every bucket, and nothing
# above rewrites it: the derived Ascent doc still heads itself `3GUKAYiurQk` (the Summit video)
# months after being written for `rrPhSQYLEMg`. It survived because the spawn message passes
# `--video <VID>` explicitly, so the wrong id was never USED — but a doc that names the wrong source
# is exactly the kind of thing a localizer reconciles against when the footage surprises it.
SRC_HEAD = re.compile(r"^(##\s*Source\s*[-–—]\s*)`([^`]+)`(\s*\()([^)]*)(\).*)$")
OLD_VIDEO = None
for i, ln in enumerate(lines):
    m = SRC_HEAD.match(ln)
    if not m:
        continue
    OLD_VIDEO = m.group(2)
    if VIDEO or CREATOR:
        blocks.append((i, i + 1, [f"{m.group(1)}`{VIDEO or OLD_VIDEO}`{m.group(3)}"
                                  f"{CREATOR or m.group(4)}{m.group(5)}"]))
    break

# The heading is NOT the only place a base doc names its video, and on several docs it is not
# there at all: SOVA/KAY-O/VIPER open with a bare `## Source` and put the id in the cached-video
# path and in every copy-paste `frame_study.py --video <ID>` line of the Tooling block. Deriving
# the old id from the heading alone therefore left `OLD_VIDEO = None` on exactly those docs, which
# disabled BOTH the rewrite and the fail-loud guard below -- the first Sova/Abyss doc generated
# clean while its tooling block still told every subagent to study `MMni5F7Pfl0`, Tseeky's ASCENT
# video. A wrong id in a command the agent is told to paste is worse than a wrong id in prose: it
# runs, it produces frames, and every timestamp read off them is silently for another map. So
# collect ids from all three shapes these docs actually use and rewrite every one of them.
VID_CONTEXTS = (
    re.compile(r"--video\s+([A-Za-z0-9_-]{11})\b"),
    re.compile(r"\b([A-Za-z0-9_-]{11})\.mp4\b"),
    re.compile(r"`([A-Za-z0-9_-]{11})`"),
)
OLD_VIDEOS = {OLD_VIDEO} if OLD_VIDEO else set()
for ln in lines:
    for rx in VID_CONTEXTS:
        OLD_VIDEOS.update(rx.findall(ln))
OLD_VIDEOS.discard(VIDEO)

for i, j, repl in sorted(blocks, reverse=True):
    lines[i:j] = repl

# Then the bare map name everywhere it survives, and the old source id wherever it is named.
# The id is a pure identifier -- unlike the creator's name it carries no claim about the footage,
# so substituting it is always correct and cannot invent a fact about the new source.
out = [re.sub(rf"\b{re.escape(SRC_MAP)}\b", DST_MAP.capitalize(), ln, flags=re.I) for ln in lines]
if VIDEO:
    for old in OLD_VIDEOS:
        out = [ln.replace(old, VIDEO) for ln in out]
after = "\n".join(out) + "\n"

diff = list(difflib.unified_diff(before.splitlines(), after.splitlines(),
                                 src.name, dst.name, lineterm="", n=1))
print("\n".join(diff) if diff else "(no changes)")

# Guard against the map the caller DECLARED as the source...
stale = [i for i, ln in enumerate(after.splitlines(), 1)
         if re.search(rf"\b{re.escape(SRC_MAP)}\b", ln, re.I)]
if stale:
    raise SystemExit(f"\nABORT - lines {stale} still mention {SRC_MAP!r}")

# ...and, separately, against every OTHER map name, because the declared source map is
# not necessarily the one in the base doc. `src` is always LOCALIZE_INSTRUCTIONS_<AGENT>.md
# — a single base doc written from ONE map — so passing the wrong SRC_MAP rewrites a word
# that was never there and the guard above passes while the base map's name survives
# untouched. That is not hypothetical: `BRIMSTONE ascent haven` (base doc is Summit's)
# emitted four docs headed "Brimstone / Summit" whose bodies were correct for their own
# map, and one of them went out to a 19-agent run before anyone noticed. Checking the
# declared source alone cannot catch that; checking every other map name can.
# Case-SENSITIVE on the capitalised form. Half the pool doubles as ordinary English
# ("split the plate across two lines", "bind", "breeze", "pearl"), so a case-insensitive
# sweep fires on prose and the guard gets disabled as noise. A map is a proper noun and
# is written capitalised everywhere in these docs; the English senses are lowercase.
# "Split-screen TITLE CARD" at the head of the Brimstone base doc is the one capitalised
# false positive, and it is excluded by requiring the name not be hyphen-continued.
# Drawn from the full map pool, NOT from MAPS.keys(): MAPS holds only DESTINATIONS that
# have callouts entered, so the base doc's own map is systematically absent from it. That
# omission is exactly why the first version of this guard passed the bad invocation —
# `summit` is every Brimstone/Phoenix/Fade base doc's map and has no MAPS entry.
MAP_POOL = ("ascent", "bind", "breeze", "fracture", "haven", "icebox", "lotus",
            "pearl", "split", "summit", "sunset", "abyss", "corrode")
others = [m for m in MAP_POOL if m != DST_MAP]
wrong = sorted({(i, m) for i, ln in enumerate(after.splitlines(), 1) for m in others
                if re.search(rf"\b{re.escape(m.capitalize())}\b(?!-)", ln)})
if wrong:
    raise SystemExit(
        "\nABORT - the output still names other map(s): "
        + ", ".join(f"line {i} {m!r}" for i, m in wrong[:8])
        + (f" (+{len(wrong) - 8} more)" if len(wrong) > 8 else "")
        + f"\nThe base doc is {src.name}; pass ITS map as the source, not {SRC_MAP!r}."
    )

# Same fail-loud rule for the source video id. Without it the wrong id survives silently, which is
# how the Ascent doc kept the Summit video's id; with it, a bucket that forgets --video is caught.
if VIDEO:
    left = sorted({(i, old) for i, ln in enumerate(after.splitlines(), 1)
                   for old in OLD_VIDEOS if old in ln})
    if left:
        raise SystemExit("\nABORT - the output still names OLD source video(s): "
                         + ", ".join(f"line {i} {v!r}" for i, v in left))
elif OLD_VIDEOS:
    print(f"\n!! no --video given; this doc still names {sorted(OLD_VIDEOS)} as its source. Pass "
          f"--video <ID> [--creator <NAME>] unless the new bucket really is the same video.")

# And the same fail-loud rule for the CREATOR -- which is the half that must NOT be substituted.
# These docs make behavioural claims BY NAME: "Tseeky usually CUTS STRAIGHT INTO THE AIM with the
# title card", "Tseeky often pans the aim UP from a low reference". Those describe one person's
# editing, not the game. Renaming would keep the sentence and change whose footage it describes --
# the Abyss source has no title card at all, so a substituted doc would have told 30 subagents to
# expect one and to treat its absence as a cut. There is no safe automatic rewrite here; the
# caller must supply a `bullets` override stating what the NEW creator actually does. This guard
# is what forces that, and is deliberately shaped like the map guard above: a closed pool of
# proper nouns, matched case-sensitively.
CREATOR_POOL = ("Tseeky", "Bonsai", "AiltonVG", "maxWELL", "Quible", "Snapiex",
                "NartOutHere", "B3ast", "HEHE")
foreign = sorted({(i, c) for i, ln in enumerate(after.splitlines(), 1) for c in CREATOR_POOL
                  if re.search(rf"\b{re.escape(c)}\b", ln) and c not in (CREATOR or "")})
if foreign:
    raise SystemExit(
        "\nABORT - the output still names another creator: "
        + ", ".join(f"line {i} {c!r}" for i, c in foreign[:8])
        + (f" (+{len(foreign) - 8} more)" if len(foreign) > 8 else "")
        + "\nThose lines claim something about THAT creator's footage. Do NOT rename them - add a "
          "`bullets` override to this bucket's EXAMPLES entry saying what the new source does."
    )
print(f"\n{len(before.splitlines())} -> {len(after.splitlines())} lines; no {SRC_MAP!r} left.")

if not APPLY:
    print("DRY RUN - re-run with --apply to write.")
    sys.exit(0)
dst.write_text(after, encoding="utf-8")
print(f"-> {dst}")
