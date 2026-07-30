"""CV-localize KAY/O zero-point (knife) TARGETS from the landing-frame minimap.

The stuck ZERO/point blade shows on the in-game minimap as a dark disc + bright
glyph inside a translucent suppression dome. We detect that glyph and push it
through the SAME per-frame A/B-box similarity transform the stand-localizer uses
(_kayo_localizer), yielding a precise target anchor instead of a zone centroid.

Only zero-point benefits (flash/frag leave no persistent marker).

Run:
  uv run --with numpy --with pillow --with opencv-python-headless \
         --with psycopg2-binary python scripts/_kayo_knife_targets.py <cmd>

Commands:
  sheet          render detected knife TARGET on the reference map for every
                 zero-point lineup (contact sheet) — VALIDATE before applying
  debug <id8>    per-lineup: print detection + write minimap/ref debug pngs
  finalize       write proposals json (no DB) for untouched-target zero-points
  apply          finalize + UPDATE target_anchor on untouched-target zero-points
                 (operator-modified targets are PRESERVED)
"""
import json
import math
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw

import _kayo_localizer as K

HERE = os.path.dirname(__file__)
TODO = os.path.join(HERE, "_fracture_kayo_todo.json")
PROPOSALS = os.path.join(HERE, "fracture-kayo-pin-proposals.json")
TMP = K.TMP
REF = K.REF
DSN = K.DSN


def detect_knife(mm_rgb):
    """Detect the KAY/O knife marker: a dark disc with a bright center glyph.

    Returns (px, py) in minimap-crop pixels, or None. The dark disc is
    distinct from the self-marker (bright, no dark disc) and the tan A/B boxes.
    """
    a = mm_rgb.astype(int)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    dark = ((R < 75) & (G < 75) & (B < 90)).astype(np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, lbl, stats, cent = cv2.connectedComponentsWithStats(dark, 8)
    cands = []
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        w, h = int(stats[i, cv2.CC_STAT_WIDTH]), int(stats[i, cv2.CC_STAT_HEIGHT])
        if area < 20 or area > 1500 or w == 0 or h == 0:
            continue
        aspect = w / h
        fill = area / (w * h)
        if not (0.45 <= aspect <= 2.2) or fill < 0.35:
            continue
        cx, cy = float(cent[i][0]), float(cent[i][1])
        # bright core: the white glyph sits at the disc center
        r = 5
        y0, x0 = int(cy) - r, int(cx) - r
        patch = mm_rgb[max(0, y0):y0 + 2 * r, max(0, x0):x0 + 2 * r]
        core = int(patch.reshape(-1, 3).min(axis=1).max()) if patch.size else 0
        cands.append((area, cx, cy, core))
    if not cands:
        return None
    withcore = [c for c in cands if c[3] > 140]
    pool = withcore or cands
    pool.sort(key=lambda c: -c[0])
    return (pool[0][1], pool[0][2])


def localize_target(frame_path, refb, k):
    frame = cv2.cvtColor(np.asarray(Image.open(frame_path).convert("RGB")), cv2.COLOR_RGB2BGR)
    mm = cv2.cvtColor(K.crop_minimap(frame)[0], cv2.COLOR_BGR2RGB)
    knife = detect_knife(mm)
    if not knife:
        return None, "noknife", mm, None
    tb = K.two_boxes(mm)
    if tb:
        M = K.fit_similarity([tb["B"], tb["A"]], [refb["B"], refb["A"]])
        return K.apply(M, knife), "2box", mm, knife
    lb = K.detect_labeled_boxes(mm)
    if lb:
        name, (bx, by) = next(iter(lb.items()))
        return K._single(bx, by, name, refb, knife, k), "1box", mm, knife
    return None, "nobox", mm, knife


def zero_point_todo():
    d = json.load(open(TODO))
    return [e for e in d if e["util"] == "ZERO/point"]


def _refb_k():
    d = json.load(open(TODO))
    refb = K.ref_boxes()
    k, _ = K.calibrate_scale(d, refb)
    return refb, k


def cmd_sheet():
    zp = zero_point_todo()
    refb, k = _refb_k()
    ref0 = np.asarray(Image.open(REF).convert("RGB"))
    H, W, _ = ref0.shape
    cents = _zone_centroids()
    cell = 260
    cols = 5
    rows = math.ceil(len(zp) / cols)
    sheet = Image.new("RGB", (cols * cell, rows * cell), (18, 18, 18))
    dr = ImageDraw.Draw(sheet)
    ok = 0
    for i, e in enumerate(zp):
        tgt, mode, _, _ = localize_target(e["landing_frame"], refb, k)
        ref = ref0.copy()
        # show old centroid (orange hollow) vs new knife target (red solid)
        sc = cents.get(e.get("_tzid"))
        if tgt and 0 <= tgt[0] <= 1 and 0 <= tgt[1] <= 1:
            ok += 1
            cv2.circle(ref, (int(tgt[0] * W), int(tgt[1] * H)), 22, (255, 40, 40), -1)
            cv2.circle(ref, (int(tgt[0] * W), int(tgt[1] * H)), 22, (255, 255, 255), 4)
        thumb = Image.fromarray(ref).resize((cell, cell))
        r, c = i // cols, i % cols
        sheet.paste(thumb, (c * cell, r * cell))
        tag = f"{e['id'][:8]} {e['target_zone']} {mode}"
        dr.text((c * cell + 3, r * cell + 3), tag, fill=(255, 255, 0))
    out = os.path.join(TMP, "_kayo_knife_sheet.png")
    sheet.save(out)
    print(f"knife target localized (in-bounds) for {ok}/{len(zp)} -> {out}")


def _zone_centroids():
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


def cmd_debug(id8):
    zp = zero_point_todo()
    e = next(x for x in zp if x["id"].startswith(id8))
    refb, k = _refb_k()
    tgt, mode, mm, knife = localize_target(e["landing_frame"], refb, k)
    print(f"{e['id']}  {e['stand_zone']}->{e['target_zone']}  mode={mode}")
    print("  knife(px):", knife, " TARGET(norm):", tgt)
    vis = mm.copy()
    lb = K.detect_labeled_boxes(mm)
    for nm, (px, py) in lb.items():
        cv2.circle(vis, (int(px), int(py)), 6, (0, 255, 0), 2)
        cv2.putText(vis, nm, (int(px) + 6, int(py)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
    if knife:
        cv2.drawMarker(vis, (int(knife[0]), int(knife[1])), (255, 0, 0), cv2.MARKER_CROSS, 18, 2)
    Image.fromarray(vis).resize((vis.shape[1] * 3, vis.shape[0] * 3)).save(os.path.join(TMP, "_knife_dbg_mm.png"))
    print("  wrote _knife_dbg_mm.png")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "sheet"
    if cmd == "sheet":
        cmd_sheet()
    elif cmd == "debug":
        cmd_debug(sys.argv[2])
    else:
        print("unknown cmd")
