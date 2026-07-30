"""Per-frame anchor localizer for KAY/O Fracture lineups (Path A).

The KAY/O source video uses a zoomed / player-follow minimap whose map origin
drifts frame-to-frame, so a single global frame->map transform (as calibrated on
Sova's fixed minimap) does not apply. Instead we self-calibrate PER FRAME:

  1. Detect the A-site and B-site tan boxes in the in-game minimap crop.
  2. Fit a similarity transform  minimap-pixel -> reference-minimap-normalized
     using the two box centers as ground-control points (their reference-minimap
     positions are known and constant).
  3. Detect the self player marker and push it through the transform -> STAND.

Run in an isolated env (backend venv lacks numpy/cv2):
  uv run --with numpy --with pillow --with opencv-python-headless \
         --with psycopg2-binary python scripts/_kayo_localizer.py <cmd>

Commands:
  refbox                 print detected A/B box centers in the reference minimap
  debug <frame_index>    render a debug overlay for one KAY/O stand frame
  sheet                  render STAND result for all 31 stand frames (contact sheet)
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(__file__)
REF = os.path.join(HERE, "..", "..", "frontend", "public", "minimaps", "valorant", "fracture.png")
TODO = os.path.join(HERE, "_fracture_kayo_todo.json")
TMP = os.path.join(os.environ["LOCALAPPDATA"], "Temp", "mga-fracture-posters")

# Minimap crop region as a fraction of the (16:9) frame. The in-game minimap
# lives in the top-left; this is a generous box around it.
MM = (0.00, 0.00, 0.255, 0.42)  # x0,y0,x1,y1 fractions


def khaki_mask(rgb):
    """Boolean mask of tan/khaki site-box pixels (R,G elevated, B lower, ~not gray)."""
    a = rgb.astype(int)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    return (R > 110) & (G > 105) & (B < G - 18) & (R < 235) & (np.abs(R - G) < 40)


def ref_boxes():
    """Return (B_center, A_center) as normalized (x,y) in the reference minimap."""
    ref = np.asarray(Image.open(REF).convert("RGB"))
    H, W, _ = ref.shape
    m = khaki_mask(ref)
    ys, xs = np.where(m)
    mid = W / 2
    out = {}
    for name, sel in (("B", xs < mid), ("A", xs >= mid)):
        out[name] = (xs[sel].mean() / W, ys[sel].mean() / H)
    return out


def crop_minimap(frame_bgr):
    H, W, _ = frame_bgr.shape
    x0, y0, x1, y1 = MM
    return frame_bgr[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)], (int(x0 * W), int(y0 * H))


def detect_box_blobs(mm_rgb):
    """Return solid, square-ish tan-box blobs as (area, px, py), largest first.

    The real A/B site boxes are solid filled squares. Spurious khaki pixels
    (map tinting, HUD) form thin/small streaks — rejected by area + aspect + fill.
    """
    m = khaki_mask(mm_rgb).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lbl, stats, cent = cv2.connectedComponentsWithStats(m, 8)
    blobs = []
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        w, h = int(stats[i, cv2.CC_STAT_WIDTH]), int(stats[i, cv2.CC_STAT_HEIGHT])
        if area < 120 or w == 0 or h == 0:
            continue
        aspect = w / h
        fill = area / (w * h)
        if 0.45 <= aspect <= 2.2 and fill >= 0.5:   # solid & square-ish
            blobs.append((area, float(cent[i][0]), float(cent[i][1])))
    blobs.sort(reverse=True)
    return blobs


def detect_self_marker(mm_rgb):
    """Detect the bright self marker inside the minimap. Returns (px,py) or None.

    The self arrow is a small compact near-white blob; the map fill is mid-gray.
    """
    a = mm_rgb.astype(int)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    bright = (R > 205) & (G > 205) & (B > 205)
    m = bright.astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n, lbl, stats, cent = cv2.connectedComponentsWithStats(m, 8)
    best = None
    for i in range(1, n):
        area = stats[i, cv2.CC_STAT_AREA]
        w, h = stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
        if 6 <= area <= 220 and w <= 26 and h <= 26:  # compact
            if best is None or area > best[0]:
                best = (area, cent[i][0], cent[i][1])
    return None if best is None else (best[1], best[2])


def fit_similarity(src, dst):
    """Fit 2-point similarity (scale+rot+trans) mapping src px -> dst norm.

    src, dst: list of two (x,y). Returns 2x3 affine matrix M s.t. dst = M @ [x,y,1].
    """
    (x0, y0), (x1, y1) = src
    (u0, v0), (u1, v1) = dst
    dx, dy = x1 - x0, y1 - y0
    du, dv = u1 - u0, v1 - v0
    denom = dx * dx + dy * dy
    a = (dx * du + dy * dv) / denom
    b = (dx * dv - dy * du) / denom
    # [u]   [a -b][x]   [tx]
    # [v] = [b  a][y] + [ty]
    tx = u0 - (a * x0 - b * y0)
    ty = v0 - (b * x0 + a * y0)
    return np.array([[a, -b, tx], [b, a, ty]], dtype=float)


def apply(M, p):
    x, y = p
    return (M[0, 0] * x + M[0, 1] * y + M[0, 2], M[1, 0] * x + M[1, 1] * y + M[1, 2])


# True A/B box pair signature: fixed px separation (zoom is fixed) at ~equal map-y.
PAIR_SEP_LO, PAIR_SEP_HI = 300.0, 420.0
PAIR_DY_MAX = 70.0


def classify_glyph(mm_rgb, px, py, r=18):
    """Identify a tan box as 'A' or 'B' by counting enclosed holes in its letter.

    A -> 1 enclosed hole, B -> 2. Topological => position/scale invariant.
    Returns 'A'/'B' or None if no plausible glyph is present (rejects non-boxes).
    """
    px, py = int(round(px)), int(round(py))
    h, w, _ = mm_rgb.shape
    c = mm_rgb[max(0, py - r):min(h, py + r), max(0, px - r):min(w, px + r)]
    if c.size == 0:
        return None
    g = cv2.cvtColor(c, cv2.COLOR_RGB2GRAY)
    dark = (g < int(g.mean() * 0.72)).astype(np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n, lbl, st, _ = cv2.connectedComponentsWithStats(dark, 8)
    if n <= 1:
        return None
    big = 1 + int(np.argmax([st[i, cv2.CC_STAT_AREA] for i in range(1, n)]))
    if st[big, cv2.CC_STAT_AREA] < 12:      # too small to be a real glyph
        return None
    gm = cv2.morphologyEx((lbl == big).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))
    cnts, hier = cv2.findContours(gm, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    nholes = 0 if hier is None else sum(1 for hc in hier[0] if hc[3] != -1)
    return "A" if nholes <= 1 else "B"


def detect_labeled_boxes(mm_rgb):
    """Return {'A':(px,py),'B':(px,py)} for real site boxes present, ID'd by glyph."""
    out = {}
    for area, px, py in detect_box_blobs(mm_rgb):
        name = classify_glyph(mm_rgb, px, py)
        if name and name not in out:       # keep the largest of each letter
            out[name] = (px, py)
    return out


def two_boxes(mm_rgb):
    """Return {'B':..,'A':..} when both letters detected with a sane separation."""
    lb = detect_labeled_boxes(mm_rgb)
    if "A" in lb and "B" in lb:
        sep = np.hypot(lb["A"][0] - lb["B"][0], lb["A"][1] - lb["B"][1])
        if PAIR_SEP_LO <= sep <= PAIR_SEP_HI and abs(lb["A"][1] - lb["B"][1]) <= PAIR_DY_MAX:
            return {"B": lb["B"], "A": lb["A"]}
    return None


def calibrate_scale(todo, refb):
    """Global norm-per-px scale k from every frame with two clear boxes (zoom is fixed)."""
    refd = np.hypot(refb["A"][0] - refb["B"][0], refb["A"][1] - refb["B"][1])
    ks = []
    for e in todo:
        frame = cv2.cvtColor(np.asarray(Image.open(e["stand_frame"]).convert("RGB")), cv2.COLOR_RGB2BGR)
        mm_rgb = cv2.cvtColor(crop_minimap(frame)[0], cv2.COLOR_BGR2RGB)
        tb = two_boxes(mm_rgb)
        if tb:
            pxd = np.hypot(tb["A"][0] - tb["B"][0], tb["A"][1] - tb["B"][1])
            ks.append(refd / pxd)
    return float(np.median(ks)), ks


def _single(bx, by, name, refb, dot, k):
    rx, ry = refb[name]
    return (rx + k * (dot[0] - bx), ry + k * (dot[1] - by))


def localize_stand(frame_path, refb, zone, k, stand_centroid=None):
    frame = cv2.cvtColor(np.asarray(Image.open(frame_path).convert("RGB")), cv2.COLOR_RGB2BGR)
    mm_rgb = cv2.cvtColor(crop_minimap(frame)[0], cv2.COLOR_BGR2RGB)
    dot = detect_self_marker(mm_rgb)
    lb = detect_labeled_boxes(mm_rgb)
    if not dot:
        return None, lb, dot, mm_rgb, "nodot"
    tb = two_boxes(mm_rgb)
    if tb:                       # best: full 2-point similarity (self-corrects scale)
        M = fit_similarity([tb["B"], tb["A"]], [refb["B"], refb["A"]])
        return apply(M, dot), tb, dot, mm_rgb, "2box"
    if lb:                       # single anchor + fixed scale; disambiguate glyph via zone prior
        name, (bx, by) = next(iter(lb.items()))
        if stand_centroid is not None:   # pick A/B identity whose stand lands nearest its zone
            name = min(("A", "B"), key=lambda nm: np.hypot(*(np.subtract(
                _single(bx, by, nm, refb, dot, k), stand_centroid))))
        return _single(bx, by, name, refb, dot, k), {name: (bx, by)}, dot, mm_rgb, "1box"
    return None, lb, dot, mm_rgb, "nobox"


def cmd_refbox():
    print(json.dumps(ref_boxes(), indent=1))


def cmd_calibrate():
    d = json.load(open(TODO))
    refb = ref_boxes()
    k, ks = calibrate_scale(d, refb)
    print(f"both-box frames: {len(ks)}/{len(d)}")
    print(f"k (norm/px): median={k:.6f} min={min(ks):.6f} max={max(ks):.6f} std={np.std(ks):.6f}")


def cmd_debug(idx):
    d = json.load(open(TODO))
    e = d[int(idx)]
    refb = ref_boxes()
    k, _ = calibrate_scale(d, refb)
    stand, boxes, dot, mm_rgb, mode = localize_stand(e["stand_frame"], refb, e["stand_zone"], k)
    print(f"[{idx}] {e['stand_zone']} -> {e['target_zone']} | {e['util']}  mode={mode}")
    print("  boxes:", boxes, "dot:", dot, "STAND:", stand)
    # render minimap debug
    vis = mm_rgb.copy()
    if boxes:
        for nm, (px, py) in boxes.items():
            cv2.circle(vis, (int(px), int(py)), 6, (0, 255, 0), 2)
            cv2.putText(vis, nm, (int(px) + 6, int(py)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
    if dot:
        cv2.drawMarker(vis, (int(dot[0]), int(dot[1])), (255, 0, 255), cv2.MARKER_TILTED_CROSS, 16, 2)
    Image.fromarray(vis).resize((vis.shape[1] * 2, vis.shape[0] * 2)).save(os.path.join(TMP, "_loc_mm.png"))
    # render on reference
    ref = np.asarray(Image.open(REF).convert("RGB")).copy()
    H, W, _ = ref.shape
    for nm, (nx, ny) in refb.items():
        cv2.circle(ref, (int(nx * W), int(ny * H)), 10, (0, 180, 0), 2)
    if stand:
        cv2.circle(ref, (int(stand[0] * W), int(stand[1] * H)), 14, (255, 40, 40), -1)
        cv2.circle(ref, (int(stand[0] * W), int(stand[1] * H)), 14, (255, 255, 255), 2)
    Image.fromarray(ref).save(os.path.join(TMP, "_loc_ref.png"))
    print("  wrote _loc_mm.png + _loc_ref.png")


def cmd_sheet():
    import math
    d = json.load(open(TODO))
    refb = ref_boxes()
    ref0 = np.asarray(Image.open(REF).convert("RGB"))
    H, W, _ = ref0.shape
    cell = 240
    cols = 6
    rows = math.ceil(len(d) / cols)
    sheet = Image.new("RGB", (cols * cell, rows * cell), (18, 18, 18))
    from PIL import ImageDraw
    dr = ImageDraw.Draw(sheet)
    k, _ = calibrate_scale(d, refb)
    ok = 0
    for i, e in enumerate(d):
        stand, boxes, dot, _, mode = localize_stand(e["stand_frame"], refb, e["stand_zone"], k)
        ref = ref0.copy()
        if stand:
            ok += 1
            cv2.circle(ref, (int(stand[0] * W), int(stand[1] * H)), 22, (255, 40, 40), -1)
            cv2.circle(ref, (int(stand[0] * W), int(stand[1] * H)), 22, (255, 255, 255), 4)
        thumb = Image.fromarray(ref).resize((cell, cell))
        r, c = i // cols, i % cols
        sheet.paste(thumb, (c * cell, r * cell))
        tag = f"{i} {e['stand_zone']}" + ("" if stand else " !FAIL")
        dr.text((c * cell + 3, r * cell + 3), tag, fill=(255, 255, 0))
    sheet.save(os.path.join(TMP, "_kayo_stand_sheet.png"))
    print(f"localized STAND for {ok}/{len(d)} -> _kayo_stand_sheet.png")


DSN = "postgresql://mygamingassistant:testpassword@localhost:5433/mygamingassistant_test"


def zone_centroids():
    """Map zone_id -> (cx,cy) centroid of its normalized polygon_points."""
    import psycopg2
    conn = psycopg2.connect(DSN)
    cur = conn.cursor()
    cur.execute("SELECT id, polygon_points FROM map_zone")
    out = {}
    for zid, pts in cur.fetchall():
        if pts:
            xs = [p["x"] for p in pts]
            ys = [p["y"] for p in pts]
            out[str(zid)] = (sum(xs) / len(xs), sum(ys) / len(ys))
    cur.close()
    conn.close()
    return out


def build_proposals():
    """Compose {lineup_id, stand, target, mode} for all todo lineups."""
    import psycopg2
    d = json.load(open(TODO))
    refb = ref_boxes()
    k, _ = calibrate_scale(d, refb)
    cents = zone_centroids()
    conn = psycopg2.connect(DSN)
    cur = conn.cursor()
    ids = [e["id"] for e in d]
    cur.execute("SELECT id, stand_zone_id, target_zone_id FROM lineup WHERE id = ANY(%s::uuid[])", (ids,))
    zmap = {str(r[0]): (str(r[1]), str(r[2])) for r in cur.fetchall()}
    cur.close()
    conn.close()
    props = []
    for e in d:
        szid, tzid = zmap.get(e["id"], (None, None))
        sc = cents.get(szid)
        stand, _, _, _, mode = localize_stand(e["stand_frame"], refb, e["stand_zone"], k, sc)
        # Safety guard: a stand must sit near its own zone. If CV lands out of bounds
        # or implausibly far from the stand-zone, fall back to the zone centroid.
        oob = stand is not None and not (0 <= stand[0] <= 1 and 0 <= stand[1] <= 1)
        far = stand is not None and sc is not None and np.hypot(stand[0] - sc[0], stand[1] - sc[1]) > 0.30
        if stand is None or oob or far:
            stand = sc
            mode = "stand_zone_centroid"
        target = cents.get(tzid)                # target: always target-zone centroid
        props.append({"lineup_id": e["id"], "zone": e["stand_zone"], "util": e["util"],
                      "stand": stand, "target": target, "mode": mode})
    return props


def cmd_finalize(apply_db):
    props = build_proposals()
    ref0 = np.asarray(Image.open(REF).convert("RGB"))
    H, W, _ = ref0.shape
    vis = ref0.copy()
    modes = {}
    for i, p in enumerate(props):
        modes[p["mode"]] = modes.get(p["mode"], 0) + 1
        s, t = p["stand"], p["target"]
        if s and t:
            cv2.line(vis, (int(s[0] * W), int(s[1] * H)), (int(t[0] * W), int(t[1] * H)), (0, 200, 255), 1)
        if t:
            cv2.circle(vis, (int(t[0] * W), int(t[1] * H)), 7, (255, 140, 0), -1)
        if s:
            cv2.circle(vis, (int(s[0] * W), int(s[1] * H)), 8, (40, 90, 255), -1)
            cv2.circle(vis, (int(s[0] * W), int(s[1] * H)), 8, (255, 255, 255), 1)
    Image.fromarray(vis).save(os.path.join(TMP, "_kayo_final_overlay.png"))
    out_json = os.path.join(HERE, "fracture-kayo-pin-proposals.json")
    json.dump([{"lineup_id": p["lineup_id"],
                "stand": {"x": float(p["stand"][0]), "y": float(p["stand"][1])},
                "target": {"x": float(p["target"][0]), "y": float(p["target"][1])}, "mode": p["mode"]}
               for p in props if p["stand"] and p["target"]], open(out_json, "w"), indent=1)
    print("modes:", modes)
    print("wrote _kayo_final_overlay.png +", out_json)
    if apply_db:
        import psycopg2
        conn = psycopg2.connect(DSN)
        cur = conn.cursor()
        n = 0
        for p in props:
            if not (p["stand"] and p["target"]):
                continue
            cur.execute("UPDATE lineup SET stand_anchor_x=%s, stand_anchor_y=%s, "
                        "target_anchor_x=%s, target_anchor_y=%s WHERE id=%s::uuid",
                        (float(p["stand"][0]), float(p["stand"][1]),
                         float(p["target"][0]), float(p["target"][1]), p["lineup_id"]))
            n += cur.rowcount
        conn.commit()
        cur.close()
        conn.close()
        print(f"applied {n} rows to DB")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "refbox"
    if cmd == "refbox":
        cmd_refbox()
    elif cmd == "calibrate":
        cmd_calibrate()
    elif cmd == "finalize":
        cmd_finalize(apply_db=False)
    elif cmd == "apply":
        cmd_finalize(apply_db=True)
    elif cmd == "debug":
        cmd_debug(sys.argv[2])
    elif cmd == "sheet":
        cmd_sheet()
