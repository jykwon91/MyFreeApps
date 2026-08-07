"""Is a "unanimous" side split real evidence, or one source's convention counted N times?

117/117 side_a for viper snake-bite looks decisive, but those rows are not 117 independent
observations if they came from three videos that each label every lineup the same way. And unanimity
means nothing at all if the corpus simply contains no defender rows for that agent -- that would be a
fact about which sources were ingested, not about the game.

Two checks:
  1. Break the split down by SOURCE VIDEO. Independent evidence = multiple sources agreeing.
  2. Report the corpus-wide and per-agent base rate, so a "unanimous" call can be compared against
     how often that side occurs anyway.

  python check_side_independence.py <agent> <ability>
"""
import collections
import json
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if len(sys.argv) < 3:
    raise SystemExit(__doc__)
want_ag, want_ab = sys.argv[1].lower(), sys.argv[2].lower()

url = "http://127.0.0.1:8004/api/lineups?game_slug=valorant&status=accepted&limit=5000"
with urllib.request.urlopen(url, timeout=60) as fh:
    rows = json.load(fh)


def agent_of(r):
    return (((r.get("utility_type") or {}).get("agent") or {}).get("slug") or "?").lower()


def ability_of(r):
    return ((r.get("utility_type") or {}).get("slug") or "?").lower()


corpus = collections.Counter(r.get("side") or "NULL" for r in rows)
print(f"corpus-wide side base rate ({len(rows)} rows): {dict(corpus)}")
ag_rows = [r for r in rows if agent_of(r) == want_ag]
print(f"{want_ag} overall ({len(ag_rows)} rows): "
      f"{dict(collections.Counter(r.get('side') or 'NULL' for r in ag_rows))}")

sel = [r for r in ag_rows if ability_of(r) == want_ab]
print(f"\n{want_ag}/{want_ab}: {len(sel)} rows")
by_src = collections.defaultdict(collections.Counter)
for r in sel:
    by_src[r.get("youtube_video_id") or "?"][r.get("side") or "NULL"] += 1
for vid in sorted(by_src, key=lambda v: -sum(by_src[v].values())):
    print(f"  {vid:<14} {dict(by_src[vid])}")
n_src = len(by_src)
sides = {s for c in by_src.values() for s in c}
print(f"\n  {n_src} independent source(s); sides observed: {sorted(sides)}")
if len(sides) == 1 and n_src >= 3:
    print(f"  => {n_src} sources independently agree. Usable as evidence.")
elif len(sides) == 1:
    print(f"  => only {n_src} source(s). This is ONE convention, not corroborated evidence.")
else:
    print("  => sources DISAGREE. The ability does not carry side.")

# The decisive question for a null-side bucket: does the corpus contain the other side for this agent
# at all? If not, unanimity is a fact about ingest coverage, not about the game.
other = {r.get("side") for r in ag_rows} - {"side_a", None}
print(f"\n  {want_ag} rows on any side other than side_a: {len([r for r in ag_rows if r.get('side') not in (None, 'side_a')])}"
      f"  (sides seen: {sorted(s for s in {r.get('side') for r in ag_rows} if s)})")
if not other:
    print("  !! the corpus has NO defender rows for this agent at all -- unanimity here reflects\n"
          "     which sources were ingested, NOT a property of the utility. Not usable as evidence.")
