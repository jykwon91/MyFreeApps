"""Turn an mga-lineup-localize-multi run into a cypher spans pack.

Usage:
    python build_cypher_pack.py <workflow-output.json> <map_slug> <out.json> [note]

Callouts that no table maps are a HARD FAILURE, listed by name. Silently
defaulting an unmapped callout to a site is how a lineup ships under the wrong
zone, so the fix is to extend the table, never to guess at runtime.
"""
import json
import math
import sys
from collections import Counter

VIDEO = "UsfCu5uL3Qs"
AUTHOR = "spawns"
PLACED = {"trapwire", "spycam"}

# Fine in-game callout -> the map's coarse fixture zone slug.
ZONES = {
    "ascent": {
        "a site": "a-site", "a": "a-site", "a back": "a-site", "a heaven": "a-site",
        "heaven": "a-site", "a rafters": "a-site", "rafters": "a-site",
        "a generator": "a-site", "generator": "a-site", "generator room": "a-site",
        "a tree": "a-site", "tree": "a-site", "a dice": "a-site", "dice": "a-site",
        "wine": "a-site", "a wine": "a-site", "hell": "a-site", "a hell": "a-site",
        "a main": "a-main", "a lobby": "a-main", "a short": "a-main",
        "short": "a-main", "a link": "a-main", "a door": "a-main", "a doors": "a-main",
        "catwalk": "a-main", "a stairs": "a-main", "a ramp": "a-main",
        "b site": "b-site", "b": "b-site", "b back": "b-site", "garden": "b-site",
        "boathouse": "b-site", "b boathouse": "b-site", "switch": "b-site",
        "b main": "b-main", "b lobby": "b-main", "b stairs": "b-main",
        "b link": "b-main", "b short": "b-main", "b ramp": "b-main",
        "mid": "mid", "middle": "mid", "mid top": "mid", "mid bottom": "mid",
        "mid link": "mid", "mid cubby": "mid", "mid courtyard": "mid",
        "courtyard": "mid", "pizza": "mid", "tiles": "mid", "mid pizza": "mid",
        "market": "market", "market top": "market", "market bottom": "market",
        "mid market": "market",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
    "bind": {
        "a site": "a-site", "a": "a-site", "a heaven": "a-site", "heaven": "a-site",
        "a triple": "a-site", "triple": "a-site", "triples": "a-site",
        "a cubby": "a-site", "a back": "a-site", "a tower": "a-site",
        "a short": "a-short", "short": "a-short", "u hall": "a-short",
        "a lobby": "a-short", "a long": "a-short", "a lamps": "a-short",
        "lamps": "a-short", "a link": "a-short", "a main": "a-short",
        "showers": "showers", "shower": "showers", "a bath": "showers", "bath": "showers",
        "b site": "b-site", "b": "b-site", "b elbow": "b-site", "elbow": "b-site",
        "b window": "b-site", "window": "b-site", "b back": "b-site", "b fountain": "b-site",
        "b short": "b-short", "b long": "b-short", "b lobby": "b-short",
        "b main": "b-short", "b hall": "b-short", "b link": "b-short", "b garden": "b-short",
        "hookah": "hookah", "hooka": "hookah", "b hookah": "hookah",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
    "breeze": {
        "a site": "a-site", "a": "a-site", "a cave": "a-site", "cave": "a-site",
        "a bridge": "a-site", "bridge": "a-site", "a shop": "a-site",
        "a heaven": "a-site", "a back": "a-site", "a pyramid": "a-site",
        "a main": "a-main", "a hall": "a-main", "a lobby": "a-main", "a ramp": "a-main",
        "b site": "b-site", "b": "b-site", "b elbow": "b-site", "elbow": "b-site",
        "b back": "b-site", "b window": "b-site", "cannon": "b-site", "switch": "b-site",
        "b main": "b-main", "b lobby": "b-main", "b tunnel": "b-main",
        "tunnel": "b-main", "snake": "b-main", "b hall": "b-main",
        "mid": "mid", "middle": "mid", "mid doors": "mid", "mid top": "mid",
        "mid chute": "mid", "mid pillar": "mid", "mid wood": "mid", "nest": "mid",
        "tube": "mid", "halls": "mid", "mid cubby": "mid",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
    "haven": {
        "a site": "a-site", "a": "a-site", "a link": "a-site", "a heaven": "a-site",
        "heaven": "a-site", "a back": "a-site", "a tower": "a-site",
        "a lobby": "a-lobby", "a long": "a-lobby", "a short": "a-lobby",
        "a main": "a-lobby", "a ramp": "a-lobby",
        "b site": "b-site", "b": "b-site", "b main": "b-site", "b back": "b-site",
        "mid": "b-site", "middle": "b-site", "mid window": "b-site",
        "mid doors": "b-site", "mid courtyard": "b-site", "courtyard": "b-site",
        "c site": "c-site", "c": "c-site", "c link": "c-site", "c cubby": "c-site",
        "c window": "c-site", "c back": "c-site", "c backsite": "c-site",
        "c lobby": "c-lobby", "c long": "c-lobby", "c main": "c-lobby", "c ramp": "c-lobby",
        "garage": "garage", "sewer": "garage", "sewers": "garage", "mid garage": "garage",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
    "lotus": {
        "a site": "a-site", "a": "a-site", "a link": "a-site", "a top": "a-site",
        "a drop": "a-site", "a stairs": "a-site", "a back": "a-site",
        "a main": "a-main", "a rubble": "a-main", "a lobby": "a-main", "a hall": "a-main",
        "b site": "b-site", "b": "b-site", "b link": "b-site", "b pillar": "b-site",
        "b back": "b-site", "b tree": "b-site",
        "b main": "b-main", "b lobby": "b-main", "b hall": "b-main",
        "c site": "c-site", "c": "c-site", "c link": "c-site", "c mound": "c-site",
        "c back": "c-site",
        "c main": "c-main", "c lobby": "c-main", "c hall": "c-main",
        "c waterfall": "c-main", "waterfall": "c-main", "c tree": "c-main",
        "mid": "mid", "middle": "mid", "mid top": "mid", "mid bottom": "mid",
        "mid link": "mid", "mid doors": "mid", "mid courtyard": "mid", "mid bend": "mid",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
    "split": {
        "a site": "a-site", "a": "a-site", "a rafters": "a-site", "a tower": "a-site",
        "a screens": "a-site", "a heaven": "a-site", "a back": "a-site", "a sewer": "a-site",
        "a elbow": "a-site",
        "a main": "a-main", "a ramps": "a-main", "a ramp": "a-main", "a lobby": "a-main",
        "b site": "b-site", "b": "b-site", "b rafters": "b-site", "b back": "b-site",
        "b alley": "b-site",
        "b main": "b-main", "b garage": "b-main", "b lobby": "b-main",
        "b tower": "b-main", "b heaven": "b-main", "b link": "b-main", "b stairs": "b-main",
        "mid": "mid", "middle": "mid", "mid vent": "mid", "mid bottom": "mid",
        "mid top": "mid", "mid connector": "mid",
        "mail": "mail", "mid mail": "mail", "b mail": "mail",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
    "sunset": {
        "a site": "a-site", "a": "a-site", "a elbow": "a-site", "elbow": "a-site",
        "a alley": "a-site", "a link": "a-site", "a back": "a-site", "a heaven": "a-site",
        "a main": "a-main", "a lobby": "a-main", "a ramp": "a-main", "a stairs": "a-main",
        "b site": "b-site", "b": "b-site", "b boba": "b-site", "boba": "b-site",
        "b back": "b-site", "b link": "b-site", "b window": "b-site",
        "b main": "b-main", "b lobby": "b-main", "b alley": "b-main", "b hall": "b-main",
        "mid": "mid", "middle": "mid", "mid top": "mid", "mid bottom": "mid",
        "mid courtyard": "mid", "mid tiles": "mid", "mid canal": "mid",
        "market": "market", "market top": "market", "market bottom": "market",
        "mid market": "market",
        "attacker spawn": "t-spawn", "attacker side spawn": "t-spawn", "t spawn": "t-spawn",
        "defender spawn": "ct-spawn", "defender side spawn": "ct-spawn", "ct spawn": "ct-spawn",
    },
}


AB_SHORT = {"spycam": "Cam", "trapwire": "Trip", "cyber-cage": "Cage"}
ZONE_LABEL = {
    "a-site": "A Site", "b-site": "B Site", "c-site": "C Site",
    "a-main": "A Main", "b-main": "B Main", "c-main": "C Main",
    "a-short": "A Short", "b-short": "B Short", "a-lobby": "A Lobby",
    "c-lobby": "C Lobby", "garage": "Garage", "hookah": "Hookah",
    "showers": "Showers", "mid": "Mid", "market": "Market", "mail": "Mail",
    "t-spawn": "Attacker Spawn", "ct-spawn": "Defender Spawn",
}
# Chapter-level narration ("And here's just all the trips...") describes the
# whole chapter, not the one placement it happened to be burned over. Using it
# as a title would name several different lineups the same thing.
GENERIC_PREFIXES = ("and here", "here's", "here is", "and now", "so here")


def clean_caption(cap):
    c = " ".join((cap or "").split()).strip(" .,;:-—")
    if not c:
        return ""
    if c.lower().startswith(GENERIC_PREFIXES):
        return ""
    for lead in ("Just ", "just "):
        if c.startswith(lead):
            c = c[len(lead):]
    return c


def short_desc(caption, what, limit=62):
    """A compact human descriptor: the creator's caption if usable, else the
    distinctive tail of the survey's prose (after the em-dash), never a
    mid-word truncation."""
    s = clean_caption(caption)
    if not s:
        w = " ".join((what or "").split())
        if "—" in w:
            w = w.split("—", 1)[1]
        for sep in (";", ". "):
            if sep in w:
                w = w.split(sep, 1)[0]
        s = w.strip(" .,;:-—")
    if len(s) <= limit:
        return s
    cut = s[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(" .,;:-—")


def norm(s):
    n = (s or "").lower()
    for ch in "()[],.-/":
        n = n.replace(ch, " ")
    return " ".join(n.split())


def zone(raw, table, unmapped):
    n = norm(raw)
    if not n:
        return None
    if n in table:
        return table[n]
    best = None
    for k, v in table.items():
        if (n.startswith(k + " ") or n.endswith(" " + k) or f" {k} " in f" {n} ") \
                and (best is None or len(k) > best[0]):
            best = (len(k), v)
    if best:
        return best[1]
    unmapped.append(raw)
    return None


def main():
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    src, map_slug, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    note = sys.argv[4] if len(sys.argv) > 4 else ""
    table = ZONES.get(map_slug)
    if table is None:
        raise SystemExit(f"ABORT - no zone table for map {map_slug!r}; add one to ZONES")

    raw = json.load(open(src, encoding="utf-8"))
    res = raw.get("result", raw)
    if isinstance(res, str):
        res = json.loads(res)
    results = res["results"]

    rows, excluded, unmapped, degenerate = [], [], [], []
    used_cs = set()
    for x in results:
        it = x["item"]
        # One run can span several maps (the survey walks the whole video), but
        # a pack is per-map. Skip other maps silently -- they are not failures.
        if (it.get("map") or map_slug) != map_slug:
            continue
        if x.get("status") != "GATE_PASSED":
            excluded.append((it.get("nn"), it.get("name"), x.get("status"),
                             (x.get("verdict") or {}).get("reason", "")[:120]))
            continue
        L = x["loc"]
        ability = L.get("ability") or it["ability"]
        placed = ability in PLACED

        events = ("stand", "aim", "landing") if placed else ("stand", "aim", "throw", "landing")
        if not placed and not L.get("throw"):
            excluded.append((it.get("nn"), it.get("name"), "THROWN_BUT_NO_THROW_SPAN", ""))
            continue
        spans = {}
        bad = False
        for ev in events:
            v = L.get(ev)
            if not v or not (float(v[1]) > float(v[0])):
                excluded.append((it.get("nn"), it.get("name"), f"BAD_SPAN_{ev}", str(v)))
                bad = True
                break
            spans[ev] = [round(float(v[0]), 2), round(float(v[1]), 2)]
        if bad:
            continue
        if placed and "throw" in spans:
            del spans["throw"]

        tgt = zone(L.get("target"), table, unmapped)
        std = zone(L.get("stand_loc"), table, unmapped)
        if not tgt or not std:
            excluded.append((it.get("nn"), it.get("name"), "UNMAPPED_ZONE",
                             f"target={L.get('target')!r} stand={L.get('stand_loc')!r}"))
            continue

        # cs = floor(STAND.start), unique per lineup within the video.
        cs = int(math.floor(spans["stand"][0]))
        while cs in used_cs:
            cs += 1
        used_cs.add(cs)

        side = "side_a" if str(L.get("side", "")).lower().startswith("att") else "side_b"
        if tgt == std:
            degenerate.append(cs)

        rows.append({
            "cs": cs,
            "_desc": short_desc(it.get("caption"), it.get("what")),
            "_key": (tgt, ability),
            "ability": ability,
            "technique": (L.get("technique") or "standing") if not placed else "standing",
            "target": tgt,
            "stand": std,
            "side": side,
            "spans": spans,
        })

    if unmapped:
        print("UNMAPPED CALLOUTS (extend ZONES[%r]):" % map_slug)
        for c, n in Counter(norm(u) for u in unmapped).most_common():
            print("   %-38s x%d" % (c, n))

    rows.sort(key=lambda z: z["cs"])

    # Title = stable identity ("B Site Cam 2") + the creator's own words. The
    # identity half guarantees uniqueness and sorts sensibly in the library;
    # the caption half is what actually tells a player why the spot is good.
    seen_key = Counter()
    for r in rows:
        tgt, ability = r.pop("_key")
        desc = r.pop("_desc")
        seen_key[(tgt, ability)] += 1
        ident = f"{ZONE_LABEL.get(tgt, tgt)} {AB_SHORT.get(ability, ability)} {seen_key[(tgt, ability)]}"
        r["title"] = f"{ident} — {desc}" if desc else ident
    ordered = ["cs", "title", "ability", "technique", "target", "stand", "side", "spans"]
    rows = [{k: r[k] for k in ordered} for r in rows]

    pack = {"video_id": VIDEO, "map_slug": map_slug, "author": AUTHOR,
            "lineups": rows, "note": note}
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(pack, fh, indent=1)

    print("\nWROTE %d rows -> %s" % (len(rows), out_path))
    print("ability:", dict(Counter(r["ability"] for r in rows)))
    print("side:", dict(Counter(r["side"] for r in rows)))
    print("target zones:", dict(Counter(r["target"] for r in rows)))
    print("degenerate stand==target: %d %s" % (len(degenerate), degenerate))
    print("\nEXCLUDED (%d):" % len(excluded))
    for nn, name, status, why in excluded:
        print("  %-5s %-46s %-24s %s" % (nn, str(name)[:44], status, why))


main()
