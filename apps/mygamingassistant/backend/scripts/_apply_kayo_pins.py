"""Apply KAY/O Fracture pin proposals to the local DB and render an overlay.

Usage:
    python scripts/_apply_kayo_pins.py <proposals.json> [--dry-run]

Reads a proposals array [{lineup_id, stand:{x,y}, target:{x,y}}, ...], writes
stand_anchor_x/y + target_anchor_x/y into the local mygamingassistant_test DB,
and renders every applied pin over the Fracture reference minimap for eyeballing.
"""
import json
import sys
import os

from PIL import Image, ImageDraw, ImageFont

DSN = "postgresql://mygamingassistant:testpassword@localhost:5433/mygamingassistant_test"
REF = os.path.join(os.path.dirname(__file__), "..", "..", "frontend",
                   "public", "minimaps", "valorant", "fracture.png")
OUT = os.path.join(os.environ["LOCALAPPDATA"], "Temp", "mga-fracture-posters",
                   "_kayo_applied.png")


def main():
    path = sys.argv[1]
    dry = "--dry-run" in sys.argv
    props = json.load(open(path))
    print(f"{len(props)} proposals from {path}")

    # --- Render overlay ---
    ref = Image.open(REF).convert("RGB")
    W, H = ref.size
    d = ImageDraw.Draw(ref)
    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except Exception:
        font = ImageFont.load_default()
    for i, p in enumerate(props):
        s, t = p["stand"], p["target"]
        sx, sy = s["x"] * W, s["y"] * H
        tx, ty = t["x"] * W, t["y"] * H
        d.line([sx, sy, tx, ty], fill=(0, 200, 255), width=2)
        r = 8
        d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(30, 120, 255), outline=(255, 255, 255), width=2)
        d.ellipse([tx - r, ty - r, tx + r, ty + r], fill=(255, 140, 0), outline=(255, 255, 255), width=2)
        d.text((sx + 9, sy - 7), str(i + 1), fill=(120, 200, 255), font=font)
    ref.save(OUT)
    print(f"rendered {OUT}")

    if dry:
        print("dry-run: DB not modified")
        return

    # --- Apply to DB ---
    import psycopg2
    conn = psycopg2.connect(DSN)
    cur = conn.cursor()
    n = 0
    for p in props:
        cur.execute(
            "UPDATE lineup SET stand_anchor_x=%s, stand_anchor_y=%s, "
            "target_anchor_x=%s, target_anchor_y=%s WHERE id=%s",
            (p["stand"]["x"], p["stand"]["y"], p["target"]["x"], p["target"]["y"], p["lineup_id"]),
        )
        n += cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    print(f"applied {n} rows")


if __name__ == "__main__":
    main()
