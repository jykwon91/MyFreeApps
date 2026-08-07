"""Audit span WIDTHS across banked pack rows.

Why: recut_lineup_clips.py cuts each pane tight [s,e] with NO padding, so a 0.1s stand span ships a
~6-frame flicker instead of a clip. The gate checks whether a span sits on the right MOMENT; it does
not check that the span is wide enough to watch. This finds degenerate spans before they ship.

  python audit_span_widths.py [<pack.json> ...]      # default: every *-spans/*.json

Reports the per-pane distribution so a threshold is chosen from the data, not guessed, then lists
every row below THIN for eyeball/retry.
"""
import json
import statistics
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
SCRIPTS = Path(__file__).resolve().parent  # this file lives in scripts/
PANES = ("stand", "aim", "throw", "landing")
# Thresholds set from the measured distribution over 735 banked rows, NOT guessed. Median widths are
# stand 1.50 / aim 0.60 / throw 0.50 / landing 1.00, but the p10 is already 0.60/0.22/0.28/0.50 — so a
# short pane is normal and flagging "below median" would condemn half the corpus. What is NOT normal is
# a span at the frame floor: at 60fps 0.10s is 6 frames and 0.03s is 2, which reads as a flicker rather
# than a clip. THROW is legitimately the fastest pane (the release itself is near-instant), so it gets
# the lowest floor.
THIN = {"stand": 0.25, "aim": 0.15, "throw": 0.10, "landing": 0.25}

args = [Path(a) for a in sys.argv[1:]]
packs = args or sorted(SCRIPTS.glob("*-spans/*.json"))

widths = {k: [] for k in PANES}
thin_rows = []
for p in packs:
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except Exception as ex:
        print(f"  !! unreadable {p}: {ex}")
        continue
    rows = d if isinstance(d, list) else d.get("lineups", [])
    for r in rows:
        sp = r.get("spans", r)
        bad = []
        for k in PANES:
            v = sp.get(k)
            if not (isinstance(v, (list, tuple)) and len(v) == 2):
                continue
            try:
                w = float(v[1]) - float(v[0])
            except (TypeError, ValueError):
                continue
            widths[k].append(w)
            if w < THIN[k]:
                bad.append(f"{k}={w:.2f}s")
        if bad:
            thin_rows.append((p.name, p.parent.name, r.get("cs"), r.get("title"), bad))

print(f"scanned {len(packs)} pack(s)\n")
for k in PANES:
    v = sorted(widths[k])
    if not v:
        continue
    print(f"  {k:<8} n={len(v):4}  min={v[0]:5.2f}  p10={v[int(len(v) * .1)]:5.2f}  "
          f"median={statistics.median(v):5.2f}  max={v[-1]:5.2f}   (thin < {THIN[k]}s)")

print(f"\n{len(thin_rows)} row(s) with at least one thin pane:")
for name, agent, cs, title, bad in sorted(thin_rows, key=lambda x: (x[1], x[0], x[2] or 0)):
    print(f"  {agent}/{name:<14} cs={cs:>4}  {', '.join(bad):<34} {title}")
