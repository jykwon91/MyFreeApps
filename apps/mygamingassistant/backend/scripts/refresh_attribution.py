"""Re-resolve every source's creator name against the channel that actually published it.

Why this exists: `attribution_author` is a point-in-time SNAPSHOT of a channel's display
name, captured once when a pack was built (build_items reads yt-dlp's `uploader`;
build_cypher_pack reads its own per-source registry). Channels rename themselves, and a
rename does not reach rows already banked. The library then shows ONE creator as two
people -- "Tseeky" on the sources ingested before the rename and "Tseeky - Pro Valorant
Lineups" on everything after -- and any per-creator grouping splits their work in half.

A one-off UPDATE would fix today's drift and guarantee tomorrow's, so this is a re-runnable
audit instead: it asks YouTube what each video's channel is called NOW and reports every
row that disagrees. Run it after any batch.

  python refresh_attribution.py                 # report drift, change nothing
  python refresh_attribution.py --apply         # also rewrite the DB rows and the packs

Resolution uses the oEmbed endpoint rather than yt-dlp: it is a single unauthenticated
JSON request per video with no download machinery, and `author_name` is the same channel
title yt-dlp reports as `uploader`.

A mismatch is NOT automatically a rename -- it is equally the shape of a miscredit, which
is the severe form of this bug (both Summit Cypher sources once shipped credited to a
creator who made neither). This prints the pairing and lets the operator read it; --apply
then takes YouTube's answer as authoritative, because YouTube is the only party that knows
what the channel is called.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SCRIPTS = Path(__file__).resolve().parent
BACKEND = SCRIPTS.parent
APPLY = "--apply" in sys.argv[1:]

OEMBED = "https://www.youtube.com/oembed?url=%s&format=json"


def channel_of(video_id):
    """The channel title YouTube reports for this video today, or None if it cannot say."""
    watch = urllib.parse.quote("https://www.youtube.com/watch?v=" + video_id, safe="")
    try:
        with urllib.request.urlopen(OEMBED % watch, timeout=20) as resp:
            return json.load(resp)["author_name"].strip()
    except (urllib.error.URLError, urllib.error.HTTPError, KeyError, ValueError) as exc:
        # A deleted or private video cannot be re-resolved. That is a finding to report,
        # never a reason to blank an existing credit -- the creator still made it.
        print("  ! %s unresolvable (%s)" % (video_id, type(exc).__name__))
        return None


def db_rows():
    from dotenv import load_dotenv
    load_dotenv(BACKEND / ".env")
    import sqlalchemy as sa
    engine = sa.create_engine(os.environ["DATABASE_URL_SYNC"])
    with engine.connect() as conn:
        rows = conn.execute(sa.text(
            "select youtube_video_id, attribution_author, count(*) "
            "from lineup where youtube_video_id is not null "
            "group by 1, 2 order by 1")).all()
    return engine, sa, rows


def rewrite_packs(video_id, new_author):
    """Point every pack for this video at the new name, editing text not structure.

    The packs are committed artifacts a human reads in diffs, so they are rewritten by
    string replacement on the single `author` field rather than re-serialised -- a
    json.dump would reflow the whole file and bury the one line that changed.
    """
    touched = []
    for pack in sorted(SCRIPTS.glob("*-spans/*.json")):
        raw = pack.read_text(encoding="utf-8")
        try:
            data = json.loads(raw)
        except ValueError:
            continue
        if not isinstance(data, dict) or data.get("video_id") != video_id:
            continue
        old = '"author": %s' % json.dumps(data.get("author"))
        if raw.count(old) != 1:
            print("  ! %s: %d matches for the author field, left alone" % (pack.name, raw.count(old)))
            continue
        pack.write_text(raw.replace(old, '"author": %s' % json.dumps(new_author)),
                        encoding="utf-8", newline="\n")
        touched.append(pack.relative_to(SCRIPTS).as_posix())
    return touched


def main():
    engine, sa, rows = db_rows()
    print("resolving %d (video, author) pairing(s) ...\n" % len(rows))

    drift, agreed, unresolved = [], 0, 0
    for video_id, author, count in rows:
        real = channel_of(video_id)
        if real is None:
            unresolved += 1
            continue
        if real == (author or "").strip():
            agreed += 1
            continue
        drift.append((video_id, author, real, count))

    print("\nagreed: %d   drifted: %d   unresolvable: %d" % (agreed, len(drift), unresolved))
    if not drift:
        print("Nothing to do.")
        return

    print("\nDRIFT")
    for video_id, author, real, count in drift:
        print("  %-13s %-34r -> %-34r %4d row(s)" % (video_id, author, real, count))

    if not APPLY:
        print("\nReport only. Re-run with --apply to rewrite the DB rows and the packs.")
        return

    print("\nAPPLYING")
    with engine.begin() as conn:
        for video_id, author, real, _count in drift:
            res = conn.execute(sa.text(
                "update lineup set attribution_author = :new "
                "where youtube_video_id = :vid and attribution_author is not distinct from :old"),
                {"new": real, "vid": video_id, "old": author})
            packs = rewrite_packs(video_id, real)
            print("  %-13s %d row(s)%s" % (video_id, res.rowcount,
                                           ("  packs: " + ", ".join(packs)) if packs else ""))
    print("\nDone. Re-export (export_lineup_pack.py) so the library carries the new names.")


main()
