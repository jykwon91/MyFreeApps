"""Diff a freshly exported lineup pack against the committed one.

PR #1015 made the pack authoritative: a lineup absent from it gets UNPUBLISHED
on deploy. So the only safe shape for a content PR is "added N, removed 0,
modified 0" -- anything else is silently retracting live content.
"""
import json
import sys


def load(p):
    d = json.load(open(p, encoding="utf-8"))
    rows = d["lineups"] if isinstance(d, dict) else d
    return d, {r["id"]: r for r in rows}


def main():
    old_path, new_path = sys.argv[1], sys.argv[2]
    _, old = load(old_path)
    newd, new = load(new_path)

    added = [i for i in new if i not in old]
    removed = [i for i in old if i not in new]
    modified = [i for i in old if i in new and old[i] != new[i]]

    print("committed: %d   exported: %d" % (len(old), len(new)))
    print("ADDED    : %d" % len(added))
    print("REMOVED  : %d  %s" % (len(removed), removed[:10]))
    print("MODIFIED : %d  %s" % (len(modified), modified[:10]))

    by_map = {}
    for i in added:
        by_map[new[i].get("map_slug", "?")] = by_map.get(new[i].get("map_slug", "?"), 0) + 1
    print("added by map:", by_map)

    agents = {}
    for i in added:
        a = new[i].get("agent_slug") or new[i].get("agent") or "?"
        agents[a] = agents.get(a, 0) + 1
    print("added by agent:", agents)

    if removed or modified:
        print("\nFAIL - a content PR must not remove or modify existing rows.")
        sys.exit(1)
    print("\nOK - purely additive.")


main()
