"""Audit EVERY spans pack for the ordering defect the gate never checked.

`spans_ordered()` was added to reconcile_agent.py only after two impossible rows had already been
banked on KAY/O Sunset. Summit, Brimstone/Sunset, Fade/Sunset and Phoenix/Ascent were all
reconciled BEFORE the guard existed, so the same defect can be sitting in their shipped rows.

Auditing the PACKS rather than the run result JSONs is deliberate: the pack is where banked rows
actually live, so this finds violations even for runs whose task-output has since been lost.

Placeholder skeleton rows are excluded — they are formulaic (cs+1 / cs+6.5), were never localized,
and would swamp the real findings.

  python audit_packs_ordering.py            # every *-spans/*.json under backend/scripts
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
SCRIPTS = Path(__file__).resolve().parent  # this file lives in scripts/


def is_placeholder(r):
    """The build skeleton writes spans at fixed offsets from the chapter start."""
    s = r.get("spans") or {}
    try:
        return (abs(s["stand"][0] - (r["cs"] + 1)) < 1e-9
                and abs(s["landing"][1] - (r["cs"] + 6.5)) < 1e-9)
    except (KeyError, TypeError, IndexError):
        return False


def load_rows(d):
    """Packs are not all the same shape: most are {video_id, map_slug, lineups:[...]}, some are a
    bare list of rows. Assuming the dict shape crashes on the others and silently truncates the
    audit at whatever file comes first alphabetically."""
    if isinstance(d, list):
        return d
    if isinstance(d, dict):
        return d.get("lineups") or d.get("rows") or []
    return []


# A 0.02s overlap and a 15.1s inversion are not the same defect and must not be reported as one
# number. SEVERE = the row cannot be salvaged by nudging a boundary.
SEVERE = 0.5
tot = skipped = 0
sev_all, minor_all = [], []
for p in sorted(SCRIPTS.glob("*-spans/*.json")):
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"!! unreadable {p.parent.name}/{p.name}: {e}")
        continue
    rows = load_rows(d)
    hits = []
    for r in rows:
        s = r.get("spans") or {}
        if not all(isinstance(s.get(k), list) and len(s[k]) == 2
                   for k in ("stand", "aim", "throw", "landing")):
            continue
        if is_placeholder(r):
            skipped += 1
            continue
        tot += 1
        st, a, t, l = s["stand"], s["aim"], s["throw"], s["landing"]
        why, over = [], round(t[1] - l[0], 3)
        mono = st[0] <= a[0] <= t[0] <= l[0]
        if not mono:
            why.append(f"starts out of order {st[0]}/{a[0]}/{t[0]}/{l[0]}")
        if over >= 0:
            why.append(f"landing {over}s before throw ends")
        if why:
            sev = (not mono) or over >= SEVERE
            rec = (p.parent.name.replace("-spans", ""), p.stem, r.get("cs"),
                   str(r.get("title", "?"))[:44], r.get("ability", "?"), "; ".join(why))
            (sev_all if sev else minor_all).append(rec)
            hits.append((sev, rec))
    if hits:
        print(f"\n{p.parent.name}/{p.name}  ({len(hits)} of {len(rows)} rows)")
        for sev, (_ag, _mp, cs, title, ab, why) in sorted(hits, key=lambda h: h[1][2]):
            print(f"   {'SEVERE' if sev else 'minor '} cs={cs:5} {ab:12} {title:46} {why}")

print(f"\n{'=' * 78}")
print(f"localized rows audited: {tot}   (placeholder rows skipped: {skipped})")
print(f"  SEVERE (unsalvageable — wrong evidence window): {len(sev_all)}")
for r in sorted(sev_all):
    print(f"     {r[0]}/{r[1]:9} cs={r[2]:5} {r[3]:46} {r[5]}")
print(f"  minor  (<{SEVERE}s overlap — boundary labelling, evidence still adjacent): {len(minor_all)}")
by_ab = {}
for r in minor_all:
    by_ab[r[4]] = by_ab.get(r[4], 0) + 1
print(f"     by ability: {by_ab}")
