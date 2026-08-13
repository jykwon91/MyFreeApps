"""Pull the passed placements out of a workflow .output file.

The file holds the workflow's return value as JSON (possibly with leading /
trailing noise), so find the outermost object and walk results[].
"""
import collections
import json
import os
import sys


def load(path):
    """The .output file wraps the workflow return value; unwrap to the object
    that actually carries results[] (it may be nested, or a JSON string)."""
    raw = open(path, encoding="utf-8", errors="replace").read()
    dec = json.JSONDecoder()
    try:
        obj = json.loads(raw)
    except ValueError:
        start = raw.find('{"recutCount"')
        obj, _ = dec.raw_decode(raw[start if start >= 0 else raw.find("{"):])

    seen = 0
    while seen < 6:
        seen += 1
        if isinstance(obj, str):
            obj = json.loads(obj)
            continue
        if isinstance(obj, dict) and "results" not in obj:
            for k in ("result", "value", "output", "return"):
                if k in obj:
                    obj = obj[k]
                    break
            else:
                break
            continue
        break
    return obj


def main():
    src = sys.argv[1]
    out = sys.argv[2]
    d = load(src)
    res = d.get("results") or []
    print("chapters=%s placements=%s passed=%s" % (
        d.get("chapters"), d.get("placements"), d.get("passed")))

    status = collections.Counter()
    kept = []
    for r in res:
        st = r.get("status") or ""
        status[st] += 1
        v = r.get("verdict") or {}
        loc = r.get("loc") or {}
        if not (v.get("pass") and loc.get("stand")):
            continue
        it = r.get("item") or {}
        kept.append({
            "nn": it.get("nn"),
            "map": it.get("map"),
            "ability": loc.get("ability") or it.get("ability"),
            "technique": loc.get("technique"),
            "target": loc.get("target"),
            "stand_loc": loc.get("stand_loc"),
            "side": loc.get("side"),
            "what": it.get("what"),
            "caption": it.get("caption"),
            "aligned": it.get("aligned"),
            "name": it.get("name"),
            "spans": {k: loc[k] for k in ("stand", "aim", "throw", "landing")
                      if loc.get(k)},
        })

    print("status:", dict(status))
    print("kept  :", len(kept))
    print("by map:", dict(collections.Counter(k["map"] for k in kept)))
    print("by ability:", dict(collections.Counter(k["ability"] for k in kept)))
    thrown = [k for k in kept if "throw" in k["spans"]]
    print("with THROW beat:", len(thrown))

    with open(out, "w", encoding="utf-8") as fh:
        json.dump(kept, fh, indent=1)
    print("wrote", out, os.path.getsize(out), "bytes")


main()
