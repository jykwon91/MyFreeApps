"""Turn an mga-lineup-localize-multi run into a spans pack.

Usage:
    python build_cypher_pack.py <workflow-output.json> <map_slug> <out.json> [note]
                                [--video <youtube_id>] [--agent <slug>]
                                [--author <channel name>]

Callouts that no table maps are a HARD FAILURE, listed by name. Silently
defaulting an unmapped callout to a site is how a lineup ships under the wrong
zone, so the fix is to extend the table, never to guess at runtime.

--video is REQUIRED whenever the run is not the default source. video_id is the
join key ingest_agent.py uses to find the mp4, so a pack carrying the wrong one
recuts every clip from the wrong video -- silently, since the clips still cut.
This used to be a module constant you hand-edited per source, which is the same
bug waiting for whoever forgets.
"""
import json
import math
import os
import re
import sys
from collections import Counter

# The project-wide callout tables (scripts/callouts_<map>.py, aggregated by
# lineup_callout_tables.py). This builder lives two directories down from scripts/,
# and is run from the backend cwd like every other pipeline script, so add scripts/
# explicitly rather than relying on sys.path[0].
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from lineup_callout_tables import CALLOUTS_BY_MAP  # noqa: E402

DEFAULT_VIDEO = "UsfCu5uL3Qs"

# Per-agent facts. The expensive, reusable asset in this file is the per-MAP
# callout tables below -- they are map-keyed, not agent-keyed, so a second agent
# on a map already covered reuses them for free. Only these three things
# actually differ per agent, so they live here rather than in a forked copy of
# the whole builder.
#
# `placed` decides the BEAT COUNT (3 vs 4). Getting it wrong either fabricates a
# THROW that never happened or drops a real one, so it is checked against the
# app fixture's `placement` column, not guessed from the ability's name.
AGENTS = {
    "cypher": {
        # video_id -> creator. The creator is a fact about the SOURCE, never about
        # the agent: a second source for the same agent used to inherit the first
        # creator's name silently, which is exactly the failure --video was added
        # to close. It had already shipped -- both Summit Cypher sources went live
        # credited to spawns, who made neither of them. An unrecognised video is a
        # hard failure; register it here or name the creator with --author.
        "sources": {
            "UsfCu5uL3Qs": "spawns",
            "y8XT-7jCBLA": "ItsFlameBTW",
            "6PbBfx6EuzM": "Season 1 Act 1 Gold Cypher",
            "mLtLqWULAqQ": "ItsFlameBTW",
        },
        "placed": {"trapwire", "spycam"},
        # Maps whose shipped packs were built against legacy_pack_zones.ZONES, so a re-run must
        # keep reading them. Every other (agent, map) pair resolves through callouts_<map>.py.
        "legacy_zone_maps": {"ascent", "bind", "breeze", "haven", "lotus", "split", "summit", "sunset"},
        "short": {"spycam": "Cam", "trapwire": "Trip", "cyber-cage": "Cage"},
    },
    "killjoy": {
        "sources": {"llo9vOgRrFw": "SC Valorant Guides", "o1_qZPhJjRs": "Briiest", "U823N6M2UGM": "hoverboarD", "1FScWR9StjI": "Chiru", "liSWxxXao-I": "Briiest", "cvENl2ZCyWQ": "Chiru", "u2CM5Cra06o": "Reco", "Q-SIy8T-XHc": "Amirant", "Qoq6I433E-c": "Briiest", "Sa1JTXfaBFY": "Reco", "shvDHsAXn9g": "Reco", "MgMzBBl8TVg": "Chiru"},
        # Both are PLACED. Riot's own text is "FIRE to deploy a bot" for the
        # alarmbot -- it is deployed at a spot, not lobbed on an arc -- and the
        # app fixture's `placement` column agrees. Only nanoswarm is thrown.
        "placed": {"turret", "alarmbot"},
        "legacy_zone_maps": {"ascent"},
        "short": {"turret": "Turret", "alarmbot": "Bot", "nanoswarm": "Nano"},
    },
    "viper": {
        "sources": {"XfRvdsxx1P8": "Frost LIVE", "X8erN-c1kyE": "CoachCow",
                    "KrlfJElQex4": "Locked", "LbcPQO_AdJI": "nAts"},
        # None is placed: the toxic screen's THROW beat is its placement confirm.
        "placed": set(),
        "legacy_zone_maps": set(),
        "short": {"snake-bite": "Molly", "poison-cloud": "Orb", "toxic-screen": "Wall"},
    },
    "fade": {
        "sources": {"7N1Q4SFvaHE": "LNX", "5yqNa4HIq5Q": "Frost LIVE"},
        "placed": set(),
        "legacy_zone_maps": set(),
        "short": {"haunt": "Haunt", "seize": "Seize"},
    },
    "phoenix": {
        "sources": {"suTAk5BOVnc": "NRG mada"},
        "placed": set(),
        "legacy_zone_maps": set(),
        "short": {"hot-hands": "Molly"},
    },
}
DEFAULT_AGENT = "cypher"

# Legacy per-map callout tables -- see legacy_pack_zones.py and zone_table().
from legacy_pack_zones import ZONES  # noqa: E402


# Set from AGENTS[...] by main(). PLACED/AB_SHORT keep the cypher values as their
# module-level default so an existing cypher invocation with no --agent behaves
# exactly as before; AUTHOR deliberately has none, because it is source-keyed and
# any stand-in here is the very value that shipped two Summit packs miscredited.
AUTHOR = None
PLACED = AGENTS[DEFAULT_AGENT]["placed"]
AB_SHORT = AGENTS[DEFAULT_AGENT]["short"]
ZONE_LABEL = {
    "a-site": "A Site", "b-site": "B Site", "c-site": "C Site",
    "a-main": "A Main", "b-main": "B Main", "c-main": "C Main",
    "a-short": "A Short", "b-short": "B Short", "a-lobby": "A Lobby",
    "b-lobby": "B Lobby", "c-lobby": "C Lobby", "garage": "Garage", "hookah": "Hookah",
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


def drop_non_latin(s):
    """Strip runs of non-Latin script from a title fragment.

    Localizers transcribe in-game signage verbatim, so a landmark can arrive as
    "under the <CJK> / <CJK> poster". Accurate, but the title is read by an
    English-speaking operator, and it crashes a cp1252 console outright. Keep the
    landmark ("under the poster"), drop the glyphs. Latin-1 accents and the
    em-dash separator are below the cutoff and survive. A parenthetical holding
    such glyphs (a non-English client's "(readout 'B <CJK>')") goes whole: it
    only transcribes the callout the prose already names in English.
    """
    s = re.sub(r"\s*\([^()]*[^\x00-─][^()]*\)", "", s or "")
    kept = "".join(" " if ord(c) > 0x2500 else c for c in s)
    kept = kept.replace(" / ", " ")
    return " ".join(kept.split())


def technique_word(raw):
    """The leading technique word. Localizers sometimes hedge in prose ("standing (not certain:
    ...)"), which overflows lineup.technique (varchar 80) and fails the INSERT. The hedge
    already lives in the localizer's WEAKEST/NOTES, so only the word is kept."""
    m = re.match(r"\s*([a-z][a-z-]*)", str(raw or "").lower())
    return m.group(1) if m else "standing"


def short_desc(caption, what, limit=62):
    """A compact human descriptor: the creator's caption if usable, else the
    distinctive tail of the survey's prose (after the em-dash), never a
    mid-word truncation."""
    caption, what = drop_non_latin(caption), drop_non_latin(what)
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


def zone_table(map_slug, agent=DEFAULT_AGENT):
    """The callout -> coarse-zone table for one map: legacy dict where THIS agent shipped on it.

    The legacy tables are wrong in ways the shared ones are not (Haven's legacy `mid courtyard`
    is b-site; the geometry puts it in a-lobby), so they are scoped to the (agent, map) pairs
    already in prod rather than to the map -- a new agent on an old map gets the shared table.

    Fails loud on a map neither source covers: defaulting to another map's table is how a
    lineup ships under a zone that does not exist on the map it was filmed on.
    """
    if map_slug in AGENTS[agent].get("legacy_zone_maps", ()):
        return ZONES[map_slug]
    shared = CALLOUTS_BY_MAP.get(map_slug)
    if shared is None:
        raise SystemExit(
            f"ABORT - no callout table for map {map_slug!r}. Write scripts/callouts_{map_slug}.py "
            f"(derive it with callout_zones.py) and register it in lineup_callout_tables.py.")
    # The shared tables are ordered lists (longest-first for their own matcher); zone() below
    # picks the longest key itself, so order is not load-bearing here.
    return dict(shared)


def zone(raw, table, unmapped):
    # The localizer leads with the callout and follows with prose that names NEIGHBOURS ("Mid
    # Window (the ledge between Attacker Side Spawn and ...)"). Longest-key-wins over the whole
    # string lets the neighbour win, so the leading clause is read first and the rest only
    # breaks a miss.
    for part in (re.split(r"\s[-–—]\s|[(,;:]", raw or "")[0], raw):
        n = norm(part)
        if not n:
            continue
        if n in table:
            return table[n]
        best = None
        for k, v in table.items():
            if (n.startswith(k + " ") or n.endswith(" " + k) or f" {k} " in f" {n} ") \
                    and (best is None or len(k) > best[0]):
                best = (len(k), v)
        if best:
            return best[1]
    if norm(raw):
        unmapped.append(raw)
    return None


def resolve_author(agent, video, stated):
    """The creator of THIS video, never whoever made the agent's first source.

    Resolution is source-keyed: a video in the agent's `sources` registry carries
    its creator with it, and anything else must be named on the command line. The
    failure mode this exists to stop is silent -- a pack built for a new source
    still validates, still ingests, and ships every row crediting the wrong
    person -- so an unknown video aborts rather than defaulting.
    """
    known = AGENTS[agent].get("sources", {})
    registered = known.get(video)
    if stated and registered and stated != registered:
        raise SystemExit(
            "ABORT - --author %r disagrees with the registered creator of %s (%r). "
            "One of them is wrong; check the video's channel before either ships."
            % (stated, video, registered))
    resolved = stated or registered
    if not resolved:
        raise SystemExit(
            "ABORT - no creator known for video %r under agent %r. Look up the "
            "channel name (https://www.youtube.com/oembed?url=https://www.youtube.com/"
            "watch?v=%s&format=json), then pass --author \"<channel>\" and add it to "
            "AGENTS[%r][\"sources\"] so the next run needs no flag."
            % (video, agent, video, agent))
    return resolved


def main():
    global AUTHOR, PLACED, AB_SHORT
    argv, video, agent, author = [], DEFAULT_VIDEO, DEFAULT_AGENT, None
    rest = list(sys.argv[1:])
    while rest:
        a = rest.pop(0)
        if a == "--video":
            if not rest:
                raise SystemExit("ABORT - --video needs a value")
            video = rest.pop(0)
        elif a.startswith("--video="):
            video = a.split("=", 1)[1]
        elif a == "--agent":
            if not rest:
                raise SystemExit("ABORT - --agent needs a value")
            agent = rest.pop(0)
        elif a.startswith("--agent="):
            agent = a.split("=", 1)[1]
        elif a == "--author":
            if not rest:
                raise SystemExit("ABORT - --author needs a value")
            author = rest.pop(0)
        elif a.startswith("--author="):
            author = a.split("=", 1)[1]
        else:
            argv.append(a)
    if agent not in AGENTS:
        raise SystemExit("ABORT - unknown --agent %r; known: %s"
                         % (agent, ", ".join(sorted(AGENTS))))
    AUTHOR = resolve_author(agent, video, author)
    PLACED = AGENTS[agent]["placed"]
    AB_SHORT = AGENTS[agent]["short"]
    if len(argv) < 3:
        raise SystemExit(__doc__)
    src, map_slug, out_path = argv[0], argv[1], argv[2]
    note = argv[3] if len(argv) > 3 else ""
    table = zone_table(map_slug, agent)

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

        # Anything but an explicit attacker/defender read is excluded, never defaulted: a
        # localizer that could not tell the side used to land on side_b (defender) silently.
        side_word = str(L.get("side", "")).strip().lower()
        if side_word.startswith("att"):
            side = "side_a"
        elif side_word.startswith("def"):
            side = "side_b"
        else:
            excluded.append((it.get("nn"), it.get("name"), "NO_SIDE", repr(L.get("side"))))
            continue
        if tgt == std:
            degenerate.append(cs)

        rows.append({
            "cs": cs,
            "_desc": short_desc(it.get("caption"), it.get("what")),
            "_key": (tgt, ability),
            "ability": ability,
            "technique": technique_word(L.get("technique")) if not placed else "standing",
            "target": tgt,
            "stand": std,
            "side": side,
            "spans": spans,
        })

    if unmapped:
        print("UNMAPPED CALLOUTS (extend the %r table -- see zone_table()):" % map_slug)
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

    pack = {"video_id": video, "map_slug": map_slug, "author": AUTHOR,
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
