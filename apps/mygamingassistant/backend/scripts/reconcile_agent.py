"""Generic localize->spans reconciler for the MGA Summit fan-out.

  python reconcile_agent.py <agent> <task-output-path> [--apply] [--apply-ability] [--apply-stand]

Merges gate-passed spans + technique into scripts/<agent>-spans/summit.json.
By default NEVER touches side / ability / target / stand â€” those come from the video
author's chapter labels, which beat the localizer's in-frame inference (a practice-server
demo player reads as "attacker" even in a defense lineup; see the KAY/O #16
zero-point/fragment case). Non-gate-passed lineups are DROPPED from the ship set;
back up the full skeleton first if you plan to retry them.

--apply-ability: for sources where the author does NOT label the ability (Fade/Tseeky â€”
titles say "ATT A Site Best" with no haunt-vs-seize hint). There the localizer's call is
the ONLY signal, so it wins. Only values in the agent's seeded ability set are accepted;
anything else keeps the provisional value and is reported as UNRESOLVED.

--apply-stand: same principle for the STAND zone. Where the title says "From X" the author
gave the stand and it wins; where it doesn't, the skeleton carries a coarse guess that often
collapses to stand == target (a "retake" thrown from the site into the site). For those rows
ONLY, map the localizer's observed `stand_loc` callout onto a map zone. Unmappable callouts
keep the guess and are reported as UNRESOLVED.

--merge: REQUIRED for a RETRY pass. A retry result only covers the handful of rows that failed
the first pass, and the default --apply rewrites the pack to exactly the rows present in THIS
result — which would silently delete every row the first pass already localized. With --merge,
rows absent from this result are left untouched, rows that passed are updated, and only rows
that were in THIS run's item set AND failed again are dropped. Refuses to run without --apply.
"""
import json, re, sys
from collections import Counter
from pathlib import Path

BE = Path(__file__).resolve().parents[1]  # scripts/ -> backend/

# --- BEGIN CLI (excised by test_callouts.py â€” keep the sentinels) ---
if len(sys.argv) < 3:
    raise SystemExit(__doc__)
AGENT, OUTFILE = sys.argv[1], Path(sys.argv[2])
APPLY = "--apply" in sys.argv
APPLY_ABILITY = "--apply-ability" in sys.argv
APPLY_STAND = "--apply-stand" in sys.argv
MERGE = "--merge" in sys.argv
if MERGE and not APPLY:
    raise SystemExit("ABORT â€” --merge only means anything alongside --apply")

# --pack <stem> selects a NON-DEFAULT spans file for agents ingested from more than one source
# (see ingest_agent.py's MULTI-SOURCE note: video_id is per-pack, so each source keeps its own
# file). Default stem stays "summit" so every single-source agent is unaffected.
PACK = "summit"
if "--pack" in sys.argv:
    i = sys.argv.index("--pack")
    if i + 1 >= len(sys.argv):
        raise SystemExit("ABORT â€” --pack needs a value")
    PACK = sys.argv[i + 1]
SPANS = BE / "scripts" / f"{AGENT}-spans" / f"{PACK}.json"
if not SPANS.exists():
    raise SystemExit(f"ABORT â€” spans pack {SPANS} not found")
# --- END CLI ---

# The tables + pure callout helpers live in a sibling module so build_items.py and
# test_callouts.py can import them instead of exec()ing this file's header.
from lineup_callouts import (  # noqa: E402  (CLI block above must bind AGENT/PACK first)
    CALLOUTS_BY_MAP,
    _first_table_hit,
    callout_to_zone,
    leading_callout,
    target_text,
)


def stand_zone_from_loc(text):
    """Zone for a localizer stand_loc, judged on the leading callout only."""
    return callout_to_zone(leading_callout(text), CALLOUTS)

# Seeded ability slugs for this agent â€” the whitelist an --apply-ability call must match.
AGENT_ABILITIES = {
    "sova": {"recon", "shock"},
    "kay-o": {"flashdrive", "fragment", "zero-point"},
    "viper": {"snake-bite", "poison-cloud", "toxic-screen"},
    "brimstone": {"brim-incendiary", "sky-smoke"},
    "fade": {"haunt", "seize"},
    # Phoenix's sources do NOT label the ability in the chapter title, so --apply-ability is
    # REQUIRED here, not optional â€” the localizer's curveball-vs-hot-hands call is the only
    # signal. Without this entry the whitelist is empty and every call silently stays
    # UNRESOLVED, shipping whatever provisional label the skeleton guessed.
    "phoenix": {"curveball", "hot-hands"},
}
VALID_ABILITIES = AGENT_ABILITIES.get(AGENT, set())
if APPLY_ABILITY and not VALID_ABILITIES:
    raise SystemExit(f"ABORT â€” --apply-ability given but no whitelist for agent {AGENT!r}; "
                     f"add its seeded slugs to AGENT_ABILITIES first")

# Localizers frequently answer with the slug PLUS its justification, e.g.
#   "hot-hands (confirmed from landing signature - flat orange fire pool, no white flash burst)"
# A bare `a in VALID_ABILITIES` test misses those, and the miss is silent: the row keeps whatever
# provisional ability the skeleton guessed. Phoenix/Sunset hit this on 2 of 9 rows and was saved only
# by luck (the guess already said hot-hands). With a `curveball` guess it would have shipped the wrong
# ability behind one easily-missed console line.
#
# So read the LEADING token and require a delimiter after it, which keeps the prose case while
# refusing a genuinely undecided answer ("curveball or hot-hands"). Note the second Phoenix row said
# "...; NOT a curveball flash burst" - i.e. the prose legitimately NAMES the other ability to rule it
# out, so "exactly one whitelisted word appears anywhere" is the wrong rule. Position matters.
# Two patterns, not one: a trailing \b cannot match after "/" or "|" (there is no word boundary
# between two non-word chars), so folding the symbol separators into the word alternation silently
# lets "hot-hands / curveball" through as if it were a confident answer.
_HEDGE_SYM = re.compile(r"^\s*[/|]")
_HEDGE_WORD = re.compile(r"^\s*,?\s*(?:or|vs\b\.?|either|maybe|possibly|unsure|unclear|"
                         r"could\s+be|not\s+sure)\b", re.I)


def resolve_ability(raw):
    """Map a localizer ability answer onto one whitelisted slug.

    Returns (slug_or_None, note). slug None => caller must NOT write, and must say so loudly.
    """
    s = str(raw or "").strip().lower()
    if not s:
        return None, "empty"
    if s in VALID_ABILITIES:
        return s, ""
    m = re.match(r"[a-z][a-z-]*", s)
    if not m:
        return None, f"no leading slug token in {s[:60]!r}"
    tok, rest = m.group(0), s[m.end():]
    if tok not in VALID_ABILITIES:
        return None, f"leading token {tok!r} not in {sorted(VALID_ABILITIES)}"
    if rest and not re.match(r"[\s(:;,.\-–—]", rest):
        return None, f"leading token {tok!r} runs straight into {rest[:12]!r}"
    if _HEDGE_SYM.match(rest) or _HEDGE_WORD.match(rest):
        return None, f"undecided between alternatives: {s[:70]!r}"
    return tok, f"leading token of prose answer {s[:70]!r}"


def extract_json(text):
    k = text.rfind('"recutCount"')
    i = text.rfind("{", 0, k) if k >= 0 else text.find("{")
    if i < 0:
        return None
    depth = 0; instr = False; esc = False
    for j in range(i, len(text)):
        c = text[j]
        if instr:
            if esc: esc = False
            elif c == "\\": esc = True
            elif c == '"': instr = False
        else:
            if c == '"': instr = True
            elif c == "{": depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return text[i:j + 1]
    return None


def spans_ok(loc):
    return bool(loc) and all(
        isinstance(loc.get(k), list) and len(loc[k]) == 2
        and isinstance(loc[k][0], (int, float)) and isinstance(loc[k][1], (int, float))
        and loc[k][1] > loc[k][0]
        for k in ("stand", "aim", "throw", "landing"))


# A LANDING may start slightly before the THROW *window* ends without being wrong: the throw span
# brackets the release ANIMATION, not the release instant, so a short-flight utility can genuinely
# deploy while that window is still running. Calibrated on all 619 localized rows in every pack
# (`audit_packs_ordering.py`): 18 rows overlap, and 16 of them do so by <0.5s — 15 of those 16 are
# `zero-point`, KAY/O's knife, whose flight really is that short. That is ONE systematic labelling
# boundary for one ability, not 16 independent errors, and an adversarial gate looked at the frames
# and passed them. Only the 2 rows beyond this threshold are genuinely broken (their LANDING sits
# 15.1s and 6.45s BEFORE the throw, with non-monotonic starts to match).
LANDING_OVERLAP_TOL = 0.5


def spans_ordered(loc):
    """The four events must OCCUR in order, and a deploy cannot meaningfully precede its release.

    spans_ok() validates each span IN ISOLATION (positive length), so nothing checked ordering
    ACROSS events — and the gate does not close the hole either: its PASS list checks span length
    and window membership and never mentions ordering. That let rows through whose LANDING window
    sits entirely before the THROW.

    Two rules, both arithmetic rather than judgement, so neither is left to a vision agent:
      * monotonic starts — that IS the event order; fires on 2 of 619 banked rows, both plainly
        broken.
      * landing_start > throw_end - LANDING_OVERLAP_TOL — see the note above for why the tolerance
        exists and is not merely permissive.

    Deliberately NOT enforced: an AIM/THROW overlap. The throw animation genuinely begins while the
    player is still settled on the alignment reference, so that boundary is a labelling choice
    rather than an error — it occurs on 31 of 41 rows of one run, 13 of them gate-passed.

    Returns (ok, reason).
    """
    s, a, t, l = (loc[k] for k in ("stand", "aim", "throw", "landing"))
    if not s[0] <= a[0] <= t[0] <= l[0]:
        return False, (f"events out of order (starts {s[0]}/{a[0]}/{t[0]}/{l[0]} for "
                       f"stand/aim/throw/landing)")
    over = t[1] - l[0]
    if over >= LANDING_OVERLAP_TOL:
        return False, (f"landing starts {round(over, 3)}s BEFORE throw ends (tolerance "
                       f"{LANDING_OVERLAP_TOL}s) - the deploy cannot precede its own release")
    return True, ""


def norm_tech(loc):
    t = (loc.get("technique") or "standing").strip().lower()
    for k in ("jump", "crouch"):          # tolerate hedged prose like "standing (low confidence)"
        if t.startswith(k):
            return k
    return "standing"


raw = extract_json(OUTFILE.read_text(encoding="utf-8", errors="replace"))
if not raw:
    raise SystemExit(f"could not extract workflow JSON from {OUTFILE}")
data = json.loads(raw)
pack = json.loads(SPANS.read_text(encoding="utf-8"))
by_cs = {ln["cs"]: ln for ln in pack["lineups"]}

# Resolve the callout table from the PACK's map, not from a default. Silently reusing Summit's
# table on another map would map callouts onto zones that map does not even have.
MAP_SLUG = pack.get("map_slug")
CALLOUTS = CALLOUTS_BY_MAP.get(MAP_SLUG)
if CALLOUTS is None:
    raise SystemExit(f"ABORT - no callout table for map {MAP_SLUG!r}. Add one to CALLOUTS_BY_MAP "
                     f"(derive it with `derive_callouts.py {MAP_SLUG}` rather than by hand) before "
                     f"reconciling; --apply-stand would otherwise assign zones from another map.")

passed, failed, ungated, vetoed = [], [], [], []
for r in data.get("results", []):
    it = r.get("item") or {}
    v = r.get("verdict") or {}
    loc = r.get("loc")
    rec = (it.get("nn"), it.get("cs"), loc, r.get("status"), v)
    ok = r.get("status") == "GATE_PASSED" and spans_ok(loc)
    if ok:
        # A gate PASS is necessary but not sufficient: the gate never checks event ordering.
        good, why = spans_ordered(loc)
        if not good:
            vetoed.append(rec + (why,))
            ok = False
    (passed if ok else failed).append(rec)
    # status=FAILED_GATE with NO verdict means the gate agent DIED before judging (session limit,
    # API error) - it is "never judged", not "judged and refused". Surfaced separately so it is
    # not re-localized: the localize payload and its verify card are intact and need only a gate.
    if not ok and r.get("status") == "FAILED_GATE" and not r.get("verdict") and spans_ok(loc):
        ungated.append(rec)
passed.sort(); failed.sort(); ungated.sort(); vetoed.sort()

print(f"{AGENT}: GATE_PASSED={len(passed)}  FAILED={len(failed)}  (of {len(data.get('results', []))})\n")
if vetoed:
    print("--- VETOED by span ordering (gate passed them; the arithmetic did not) ---")
    for nn, cs, _loc, _st, _v, why in vetoed:
        print(f"  #{nn} cs={cs:5} {by_cs.get(cs, {}).get('title', '?')}")
        print(f"       {why}")
    print()
if ungated:
    print("--- NEVER ADJUDICATED (gate agent died; re-GATE these, do NOT re-localize) ---")
    for nn, cs, _loc, _st, _v in ungated:
        print(f"  #{nn} cs={cs:5} {by_cs.get(cs, {}).get('title', '?')}")
    print()
if failed:
    print("--- FAILED (dropped from ship set; retry with locModel:'opus') ---")
    for nn, cs, _loc, st, v in failed:
        ln = by_cs.get(cs, {})
        print(f"  #{nn} cs={cs:5} {ln.get('ability','?'):11} {st:14} events={','.join(v.get('failed_events') or []) or '-'}")
        print(f"       {ln.get('title','?')}  |  {(v.get('reason') or '')[:100]}")

# Advisory only â€” author labels win, but a disagreement is worth eyeballing.
SIDE = {"attacker": "side_a", "defender": "side_b", "side_a": "side_a", "side_b": "side_b"}
flags = []
for nn, cs, loc, _st, _v in passed:
    ln = by_cs[cs]
    ls = SIDE.get(str(loc.get("side", "")).lower())
    if ls and ls != ln["side"]:
        flags.append(f"  #{nn} cs={cs} SIDE: loc={loc.get('side')}({ls}) vs author={ln['side']}  :: {ln['title']}")
    if loc.get("ability") and loc["ability"] != ln["ability"]:
        flags.append(f"  #{nn} cs={cs} ABILITY: loc={loc['ability']} vs author={ln['ability']}  :: {ln['title']}")
print(f"\n--- ADVISORY disagreements (author label kept; verify by card if suspicious): {len(flags)} ---")
print("\n".join(flags) if flags else "  none")
print("\ntechnique:", dict(Counter(norm_tech(loc) for _, _, loc, _, _ in passed)))

if APPLY_ABILITY:
    # Report what the localizer actually called, before writing anything.
    calls = Counter()
    recovered, unresolved = [], []
    for nn, cs, loc, _, _ in passed:
        slug, note = resolve_ability(loc.get("ability"))
        if slug:
            calls[slug] += 1
            if note:
                recovered.append((nn, cs, slug, note))
        else:
            unresolved.append((nn, cs, loc.get("ability"), note))
    print(f"\n--- ABILITY calls from localizer (author gave none; localizer wins) ---")
    print("  ", dict(calls))
    if recovered:
        print(f"  parsed out of a prose answer: {len(recovered)}")
        for nn, cs, slug, note in recovered:
            print(f"    #{nn} cs={cs} -> {slug}  ({note})")
    if unresolved:
        # Loud, because the consequence is shipping the SKELETON'S GUESS, which may be wrong.
        print(f"  !! UNRESOLVED: {len(unresolved)} row(s) will SHIP THE SKELETON'S PROVISIONAL "
              f"ability, which may be wrong â€” verify each by card:")
        for nn, cs, a, note in unresolved:
            prov = next((ln.get("ability") for ln in pack["lineups"] if ln.get("cs") == cs), "?")
            print(f"    #{nn} cs={cs} localizer said {a!r} â€” {note}; pack keeps {prov!r}")

def author_gave_stand(ln):
    """True when the chapter title itself names the throwing spot ('... From Mid')."""
    return bool(re.search(r"\bfrom\s+\S", ln["title"], re.I))


if APPLY_STAND:
    changed, unmapped = [], []
    for nn, cs, loc, _, _ in passed:
        ln = by_cs[cs]
        if author_gave_stand(ln):
            continue
        z = stand_zone_from_loc(loc.get("stand_loc"))
        if z is None:
            unmapped.append((nn, cs, loc.get("stand_loc")))
        elif z != ln["stand"]:
            changed.append((nn, cs, ln["stand"], z, loc.get("stand_loc"), ln["title"]))
    print(f"\n--- STAND overrides from localizer (only where the title gave no 'From X') ---")
    print(f"  {len(changed)} would change, {len(unmapped)} unmappable")
    for nn, cs, old, new, raw, title in changed:
        print(f"    #{nn} cs={cs:5} {old:8} -> {new:8}  (saw {raw!r})  :: {title}")
    for nn, cs, raw in unmapped:
        print(f"    UNRESOLVED #{nn} cs={cs:5} stand_loc={raw!r} â€” kept the skeleton's guess")

if APPLY:
    keep_cs = {cs: loc for _, cs, loc, _, _ in passed}
    # Rows this run actually adjudicated. Under --merge everything else is left alone; without
    # it the pack collapses to `passed`, which is only correct for a FIRST pass over the full set.
    run_cs = keep_cs.keys() | {cs for _, cs, _, _, _ in failed}
    kept, untouched = [], 0
    for ln in pack["lineups"]:
        loc = keep_cs.get(ln["cs"])
        if not loc:
            if MERGE and ln["cs"] not in run_cs:
                kept.append(ln)          # not in this run — first pass already localized it
                untouched += 1
            continue
        ln["spans"] = {k: [round(float(loc[k][0]), 2), round(float(loc[k][1]), 2)]
                       for k in ("stand", "aim", "throw", "landing")}
        ln["technique"] = norm_tech(loc)
        if APPLY_ABILITY:
            slug, _ = resolve_ability(loc.get("ability"))
            if slug:
                ln["ability"] = slug
        if APPLY_STAND and not author_gave_stand(ln):
            z = stand_zone_from_loc(loc.get("stand_loc"))
            if z:
                ln["stand"] = z
        kept.append(ln)
    pack["lineups"] = kept
    note_ab = " ability from localizer (author unlabelled)." if APPLY_ABILITY else ""
    # The map name comes from --pack, not the literal "Summit": this script predates --pack and
    # stamped every multi-map pack as a Summit pack, which is exactly the kind of wrong-map label
    # that cost a full re-localize on brimstone/split.
    map_name = str(pack.get("map_slug") or PACK).replace("-", " ").upper()
    # A note written by hand (the brimstone/haven chapter-title warning) carries information this
    # line cannot regenerate, so keep it rather than overwriting it.
    prior = str(pack.get("note") or "")
    keep = "" if (not prior or " gate-passed, " in prior) else f" {prior}"
    pack["note"] = (f"{AGENT} {map_name} lineups from {pack['video_id']}; {len(kept)} gate-passed, "
                    f"{len(failed)} dropped as un-gated.{note_ab}{keep}")
    SPANS.write_text(json.dumps(pack, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    extra = f"; {untouched} carried over untouched from an earlier pass" if MERGE else ""
    print(f"\nAPPLIED -> {SPANS}  ({len(kept)} kept{extra})")
else:
    print("\n(dry run â€” pass --apply to write spans back)")
