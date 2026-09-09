"""Merge localizer results back into a spans pack (scripts/<agent>-spans/<map>.json).

Two fields come back from localization and must land in the pack before `ingest_agent accept`
writes anything, because accept reads the PACK, not the workflow output:

  * spans   -- a fresh pack holds a uniform cs+N placeholder skeleton that only ever existed so
               `plan`/`create` could validate zones. Leaving it would mean the pack on disk
               disagrees with the clips actually cut, and a later `ingest_agent recut` would
               silently re-cut every clip from invented timestamps.
  * ability -- when a source never labels the utility, `create` ships a deliberate hedge (Sova
               packs default every row to "recon") and the FOOTAGE decides. The localizers
               report what they saw; accept would otherwise ship the hedge, which is a wrong
               utility_type on a shipped lineup, not a cosmetic slip.

Only GATE-PASSED rows are merged. A row that failed its gate keeps its placeholder and is listed
at the end, so the pack always says out loud which rows are not yet real.

The one exception is an explicit --override file. A gate failure is per-EVENT: a row can fail on
LANDING alone while the gate states in the same verdict that STAND/AIM/THROW are fine. When the
failing event has since been measured directly from the footage (scripts/framestudy/frames.sh,
which is frame-exact -- never the scouting sheet), an override supplies just that event, keeps
the gate-passed values for the rest, and carries a `provenance` string that is written into the
pack so the row says on its face which number came from where. An override is NOT a way to wave
a row through -- it requires a measurement, and the pack records that it happened.

An override file may also carry an `excluded` map, for a row the source never puts on camera at
all. No override can repair that -- there is no frame to point at -- so the row is dropped; see
the exclusion block below for why that beats shipping a clip of something else.

Usage:  python merge_spans.py <agent> <map> <task-output> [...]
            [--pack <stem>] [--override <overrides.json> | --no-override]

<agent>-spans/<stem>.overrides.json is applied automatically when present, so the shipped
pack is reproducible from the raw task outputs with no extra flags. `--pack` selects a
non-default stem for a second source on the same map, exactly as ingest_agent.py does.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VALID_ABILITY = {"recon", "shock"}

# Every span becomes a video clip a user actually watches, so a span of a few hundredths of a
# second is a broken artifact even when the frame it names is correct. Neither the localizer nor
# the adversarial gate checks duration -- the gate reads a contact sheet, where a 0.02s window and
# a 0.8s window look identical. Two rows shipped through both with a 0.02s AIM and a 0.07s STAND
# before this guard existed. Enforced here because the merge is the last checkpoint before accept.
#
# Two thresholds, deliberately different. HARD is "this cannot be a clip at all": at 60fps 0.25s is
# ~15 frames, and below that the cut is a stutter rather than a beat a viewer can read. WARN is the
# duration the localizer is ASKED to hit -- missing it usually means the footage was uncooperative
# (an editor punch-in over the aim, a hard cut straight into the release), which is worth surfacing
# but is not a defect. Do not collapse these into one number: the first time this guard was written
# it used the WARN targets as the abort floor and blocked six perfectly usable rows over margins
# like 0.9s vs 1.0s.
HARD_MIN = 0.25
WARN_MIN = {"stand": 1.0, "aim": 0.4, "throw": 0.3, "landing": 0.5}


def extract(text):
    k = text.rfind('"recutCount"')
    i = text.rfind('{', 0, k)
    depth, instr, esc = 0, False, False
    for j in range(i, len(text)):
        c = text[j]
        if instr:
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == '"':
                instr = False
        else:
            if c == '"':
                instr = True
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    return text[i:j + 1]
    raise SystemExit(f"no result JSON in {text[:60]!r}...")


argv = sys.argv[1:]
if len(argv) < 3:
    raise SystemExit(
        "usage: merge_spans.py <agent> <map> <task-output> [...] "
        "[--pack <stem>] [--override <overrides.json> | --no-override]"
    )
agent, map_slug, argv = argv[0], argv[1], argv[2:]
# `--pack <stem>` mirrors ingest_agent.py's flag and must exist here for the same reason: recut
# keys clips by the pack's video id, so two sources for one map CANNOT share a pack file and a
# second source lives at `<map>-2.json` beside the first. Without this flag the merge would always
# resolve `<map>.json` and quietly overwrite source 1's shipped pack with source 2's rows.
STEM = map_slug
if "--pack" in argv:
    i = argv.index("--pack")
    if i + 1 >= len(argv):
        raise SystemExit("ABORT - --pack needs a file stem")
    STEM = argv[i + 1]
    argv = argv[:i] + argv[i + 2:]

# Same layout ingest_agent.py uses, resolved from this file so the script works from any cwd.
PACK = ROOT / "scripts" / f"{agent}-spans" / f"{STEM}.json"
if not PACK.is_file():
    raise SystemExit(
        f"ABORT - no spans pack at {PACK}. Run "
        f"`ingest_agent.py {agent} {map_slug} plan --pack {STEM}` first."
    )
# The override file is picked up AUTOMATICALLY from beside the pack when it exists. It is not an
# optional extra: the merge rewrites the pack from scratch, so re-running without the overrides
# would silently restore every gate-passed span the operator measured by hand and re-admit every
# excluded row -- a regression that looks like a clean successful run. Pass --no-override only
# when you deliberately want the raw localizer output.
DEFAULT_OVERRIDE = PACK.parent / f"{STEM}.overrides.json"

overrides, prov, excluded = {}, {}, {}
ov_path = None
if "--override" in argv:
    i = argv.index("--override")
    ov_path = Path(argv[i + 1])
    argv = argv[:i] + argv[i + 2:]
elif "--no-override" in argv:
    argv = [a for a in argv if a != "--no-override"]
elif DEFAULT_OVERRIDE.is_file():
    ov_path = DEFAULT_OVERRIDE

if ov_path is not None:
    print(f"overrides: {ov_path}")
    ov = json.loads(ov_path.read_text(encoding="utf-8"))
    overrides = {int(k): v for k, v in ov["rows"].items()}
    # A row can be un-shippable rather than merely mis-localized: the source may never put the
    # event on camera at all. That is not something an override can repair -- there is no frame
    # to point at -- so the row is dropped from the pack entirely. `accept` iterates the pack, so
    # a dropped row simply stays pending_review and never reaches the export. Recorded here, not
    # by hand-editing the pack, because the merge rewrites the pack from scratch every run.
    excluded = {int(k): v for k, v in ov.get("excluded", {}).items()}

passed, any_loc = {}, {}
for p in argv:
    d = json.loads(extract(Path(p).read_text(encoding="utf-8", errors="replace")))
    for r in d["results"]:
        cs = int(r["item"]["cs"])
        loc = r.get("loc")
        # A later run supersedes an earlier one for the same chapter (re-localize pass).
        if loc:
            any_loc[cs] = loc
        if r["status"] == "GATE_PASSED":
            passed[cs] = loc

# An override rides on the LAST localizer output for that chapter -- the gate-passed events stay
# exactly as the localizer reported them, and only the measured event is replaced.
for cs, o in overrides.items():
    base = dict(passed.get(cs) or any_loc.get(cs) or {})
    if not base:
        raise SystemExit(f"ABORT - override for cs={cs} but no localizer output exists for it.")
    for k in ("stand", "aim", "throw", "landing"):
        if k in o:
            base[k] = o[k]
    if "ability" in o:
        base["ability"] = o["ability"]
    passed[cs] = base
    prov[cs] = o.get("provenance", "operator override")

pack = json.loads(PACK.read_text(encoding="utf-8"))

# The exclusion list has to survive a re-run. The merge rewrites the pack from scratch, but a row
# excluded on an EARLIER run is no longer in `lineups`, so rebuilding the list only from rows
# dropped THIS run would silently forget it -- the pack would stop saying why cs=582 is missing
# while still missing it, which is the worst of both. So the list is keyed off the override file's
# `excluded` map (the durable record) and the title is taken from whichever source still has it:
# the row being dropped now, or the entry the previous run already wrote.
prior = {int(e["cs"]): e for e in pack.get("excluded_no_event_in_source", [])}
dropped = [r for r in pack["lineups"] if int(r["cs"]) in excluded]
pack["lineups"] = [r for r in pack["lineups"] if int(r["cs"]) not in excluded]
now = {int(r["cs"]): r for r in dropped}

if excluded:
    entries = []
    for cs in sorted(excluded):
        row = now.get(cs) or prior.get(cs)
        if row is None:
            raise SystemExit(
                f"ABORT - override excludes cs={cs} but it is neither in the pack nor in the "
                f"pack's existing excluded list. Nothing was written. Check the cs value: an "
                f"exclusion that matches nothing would quietly do nothing at all."
            )
        entries.append({"cs": cs, "title": row["title"], "reason": excluded[cs]})
    pack["excluded_no_event_in_source"] = entries
else:
    pack.pop("excluded_no_event_in_source", None)

merged, stale, changed_ability = [], [], []
for row in pack["lineups"]:
    loc = passed.get(int(row["cs"]))
    if not loc:
        stale.append((row["cs"], row["title"]))
        continue
    row["spans"] = {k: [round(float(loc[k][0]), 3), round(float(loc[k][1]), 3)]
                    for k in ("stand", "aim", "throw", "landing")}
    a = (loc.get("ability") or "").strip().lower()
    if a in VALID_ABILITY and a != row["ability"]:
        changed_ability.append((row["cs"], row["title"], row["ability"], a))
        row["ability"] = a
    elif a not in VALID_ABILITY:
        raise SystemExit(f"ABORT - cs={row['cs']} localizer returned ability {a!r}, "
                         f"not one of {sorted(VALID_ABILITY)}. Fix before accepting.")
    if int(row["cs"]) in prov:
        row["span_provenance"] = prov[int(row["cs"])]
    merged.append(row["cs"])

degenerate, thin = [], []
for row in pack["lineups"]:
    if row["cs"] not in merged:
        continue          # still a placeholder; already reported as pending, don't double-report
    for k, want in WARN_MIN.items():
        lo, hi = row["spans"][k]
        d = round(hi - lo, 3)
        if d < HARD_MIN:
            degenerate.append((row["cs"], row["title"], k, d))
        elif d < want:
            thin.append((row["cs"], row["title"], k, d, want))
if degenerate:
    lines = "\n".join(f"   cs={cs:<5} {k:<8} {d}s < {HARD_MIN}s   {t}" for cs, t, k, d in degenerate)
    raise SystemExit(
        f"ABORT - {len(degenerate)} span(s) are too short to cut a usable clip:\n{lines}\n"
        "Nothing was written. These rows need re-localization with an explicit minimum-duration\n"
        "instruction; a gate PASS does not certify duration, only that the frames show the event."
    )

# Flight time (landing.start - throw.start) is the cheapest detector for the single most common
# localization error on this source: pinning LANDING to the bolt still in the air, or to the
# author's drawn trajectory annotation right after release, instead of to the deploy. Three rows
# failed exactly this way (148, 415, 464) and each showed up as a flight far shorter than its
# neighbours -- 464 was 0.18s against a next-shortest of 1.85s. The adversarial gate cannot catch
# it: a contact sheet of the wrong window still shows a glowing blue thing. Reported, never
# auto-failed, because a genuinely short corridor shot is legitimate -- this flags the row for a
# frame-study, it does not decide the answer.
flights = sorted((round(r["spans"]["landing"][0] - r["spans"]["throw"][0], 2), r["cs"], r["title"])
                 for r in pack["lineups"] if r["cs"] in merged)
if len(flights) >= 5:
    median = flights[len(flights) // 2][0]
    odd = [f for f in flights if f[0] < max(0.5, median * 0.25)]
    if odd:
        print(f"\nFLIGHT-TIME OUTLIERS (median {median}s) — verify these landings by frame-study "
              f"before shipping; this is how a landing pinned to the bolt in flight shows up:")
        for f, cs, t in odd:
            print(f"   cs={cs:<5} flight={f}s   {t}")

if stale:
    pack["note"] = (f"PARTIAL: {len(merged)} of {len(pack['lineups'])} rows carry REAL "
                    f"frame-studied spans. The {len(stale)} row(s) listed in "
                    f"`pending_localization` still hold the uniform placeholder skeleton and MUST "
                    f"NOT be recut or accepted from this pack.")
    pack["pending_localization"] = [{"cs": cs, "title": t} for cs, t in stale]
else:
    # Say exactly what the numbers are. "All gate-passed" would be a lie the moment one override
    # exists, and an override is the OPPOSITE of a gate pass -- it is there because the gate was
    # right to fail the row, or because watching the cut clip showed a defect the gate cannot see.
    n_ov = sum(1 for r in pack["lineups"] if "span_provenance" in r)
    pack["note"] = (
        f"All {len(pack['lineups'])} rows carry real frame-studied spans; no placeholders remain. "
        f"{len(pack['lineups']) - n_ov} are localizer output that passed the adversarial gate "
        f"as-is. The other {n_ov} carry at least one event measured directly from the footage by "
        f"operator frame-study; each such row has a `span_provenance` field saying which event "
        f"was replaced and why."
    )
    pack.pop("pending_localization", None)

PACK.write_text(json.dumps(pack, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"merged real spans into {len(merged)}/{len(pack['lineups'])} rows -> {PACK.name}")
if excluded:
    print()
    # Report the whole excluded set, not just what this run happened to remove. Once a row has
    # been dropped it is absent from the pack, so a run that changes nothing would otherwise
    # print nothing and read as "no exclusions" when two rows are in fact being withheld.
    print(f"EXCLUDED {len(pack['excluded_no_event_in_source'])} row(s) — the source never shows "
          f"the event, so there is nothing honest to cut. They stay pending_review and will not "
          f"be exported ({len(dropped)} removed by this run):")
    for e in pack["excluded_no_event_in_source"]:
        mark = "new" if e["cs"] in {int(r["cs"]) for r in dropped} else "   "
        print(f"   {mark} cs={e['cs']:<5} {e['title']}")
if changed_ability:
    print(f"\nability corrected from the footage on {len(changed_ability)} row(s):")
    for cs, t, old, new in changed_ability:
        print(f"   cs={cs:<5} {old} -> {new:<6} {t}")
if thin:
    print(f"\n{len(thin)} span(s) shorter than the target but still cuttable (not blocking):")
    for cs, t, k, d, want in thin:
        print(f"   cs={cs:<5} {k:<8} {d}s < {want}s   {t}")
if stale:
    print(f"\n{len(stale)} row(s) still placeholder (not gate-passed):")
    for cs, t in stale:
        print(f"   cs={cs:<5} {t}")
