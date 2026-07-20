"""Smoke tests for dedup_lineups.py — run: python scripts/test_dedup_lineups.py

Not wired into pytest (scripts/ is operator tooling, not app code); this is a
standalone self-check so the dedup logic is validated before it gates any pack.
"""
from dedup_lineups import dedup


def _lu(id, util, side, sx, sy, tx, ty, vid, clips=4):
    """clips: how many of the 4 micro-clips are present (from the front)."""
    fields = ("stand_clip_url", "aim_clip_url", "throw_clip_url", "landing_clip_url")
    d = {
        "id": id, "game_slug": "valorant", "map_slug": "ascent",
        "utility_type_slug": util, "side": side,
        "stand_anchor_x": sx, "stand_anchor_y": sy,
        "target_anchor_x": tx, "target_anchor_y": ty,
        "youtube_video_id": vid,
    }
    for i, f in enumerate(fields):
        d[f] = f"http://clip/{id}/{f}" if i < clips else None
    return d


def test_distinct_spots_sharing_zone_pair_not_collapsed():
    # 4 fragment lineups, all a-main -> a-site side_a in ZONE terms, but at 4
    # clearly separate stand spots. Must stay 4 unique.
    lus = [
        _lu("f1", "fragment", "side_a", 0.10, 0.10, 0.80, 0.20, "vidA"),
        _lu("f2", "fragment", "side_a", 0.20, 0.15, 0.80, 0.20, "vidA"),
        _lu("f3", "fragment", "side_a", 0.30, 0.25, 0.80, 0.20, "vidA"),
        _lu("f4", "fragment", "side_a", 0.40, 0.35, 0.80, 0.20, "vidA"),
    ]
    r = dedup(lus, eps=0.045)
    assert r["unique_count"] == 4, r["unique_count"]
    assert r["groups"] == [], r["groups"]


def test_cross_video_duplicate_collapsed_keeps_best_clip():
    # Same spot filmed by two creators; vidB has all 4 clips, vidA only 2.
    lus = [
        _lu("a", "flashdrive", "side_a", 0.50, 0.50, 0.30, 0.30, "vidA", clips=2),
        _lu("b", "flashdrive", "side_a", 0.51, 0.49, 0.31, 0.29, "vidB", clips=4),
    ]
    r = dedup(lus, eps=0.045)
    assert r["unique_count"] == 1, r["unique_count"]
    assert len(r["groups"]) == 1
    assert r["groups"][0]["keep"]["id"] == "b", "should keep the 4-clip version"
    assert [d["id"] for d in r["groups"][0]["drop"]] == ["a"]


def test_same_stand_different_target_not_duplicate():
    # Same stand, but thrown to two different targets -> two lineups.
    lus = [
        _lu("x", "zero-point", "side_b", 0.50, 0.50, 0.20, 0.20, "vidA"),
        _lu("y", "zero-point", "side_b", 0.50, 0.50, 0.80, 0.80, "vidB"),
    ]
    r = dedup(lus, eps=0.045)
    assert r["unique_count"] == 2, r["unique_count"]
    assert r["groups"] == []


def test_different_side_never_merges():
    lus = [
        _lu("p", "recon", "side_a", 0.5, 0.5, 0.3, 0.3, "vidA"),
        _lu("q", "recon", "side_b", 0.5, 0.5, 0.3, 0.3, "vidB"),
    ]
    r = dedup(lus, eps=0.045)
    assert r["unique_count"] == 2
    assert r["groups"] == []


def test_unpinned_reported_not_deduped():
    pinned = _lu("p1", "flashdrive", "side_a", 0.5, 0.5, 0.3, 0.3, "vidA")
    unpinned = _lu("u1", "flashdrive", "side_a", 0.5, 0.5, 0.3, 0.3, "vidB")
    for k in ("stand_anchor_x", "stand_anchor_y", "target_anchor_x", "target_anchor_y"):
        unpinned[k] = None
    r = dedup([pinned, unpinned], eps=0.045)
    assert len(r["needs_pins"]) == 1 and r["needs_pins"][0]["id"] == "u1"
    # The pinned one has no pinned partner -> stays unique, no false dup.
    assert r["unique_count"] == 1
    assert r["groups"] == []


def test_transitive_cluster_collapses_to_one():
    # Chain within eps: a~b, b~c, but a~c is > eps. Union-find must still merge.
    lus = [
        _lu("a", "smoke", "side_a", 0.500, 0.500, 0.30, 0.30, "v1"),
        _lu("b", "smoke", "side_a", 0.540, 0.500, 0.30, 0.30, "v2"),
        _lu("c", "smoke", "side_a", 0.580, 0.500, 0.30, 0.30, "v3"),
    ]
    # game/map default valorant/ascent; smoke isn't a valorant util but slug is
    # opaque to the algorithm, fine for the test.
    r = dedup(lus, eps=0.045)
    assert r["unique_count"] == 1, r["unique_count"]
    assert len(r["groups"]) == 1
    assert len(r["groups"][0]["drop"]) == 2


def _run():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)} passed")


if __name__ == "__main__":
    _run()
