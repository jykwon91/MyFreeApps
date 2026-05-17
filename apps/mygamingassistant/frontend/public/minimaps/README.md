# Minimap assets

Two ways to populate map minimaps. **Pick whichever is easier per map.**

### 1. Operator upload UI (recommended for one-off updates)

Log in as the operator, navigate to any map page (`/cs2/mirage` etc.), and click
**Replace minimap** at the top-right. Pick a PNG/JPG/WebP up to 5 MB. The file goes to
MinIO under `maps/<map_id>/minimap.png` and `Map.minimap_url` is updated; the GET
endpoint returns a presigned URL on each read (24 h TTL). No commit needed.

### 2. Bundled PNGs (for repo-versioned defaults)

Drop PNGs into `public/minimaps/<game-slug>/<map-slug>.png` and update the fixture's
`minimap_url` to `"/minimaps/<game>/<map>.png"`. Useful for shipping defaults that ship
with the codebase rather than living in MinIO.

When the bundled file is missing AND no upload exists, `MapPage.tsx` falls back to
"Minimap not available" text via the `<img onError>` handler — never shows a
broken-image icon.

## CS2 (`public/minimaps/cs2/`)

Required files (one per fixture map slug):

```
mirage.png    inferno.png   dust2.png     overpass.png   nuke.png
anubis.png    ancient.png   vertigo.png
```

All 8 are bundled in this repo, sourced from
[MurkyYT/cs2-map-icons](https://github.com/MurkyYT/cs2-map-icons) — a community
mirror that scrapes Valve's official game depot daily. The PNGs at
`images/radars/de_<slug>_radar_psd.png` are byte-identical to the ones inside
`pak01_dir.vpk → resource/overviews/<map>_radar.png` on disk.

**Refreshing** (after a major Valve map update):

```bash
cd apps/mygamingassistant/frontend/public/minimaps/cs2/
BASE="https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/main/images/radars"
for slug in mirage inferno dust2 overpass nuke anubis ancient vertigo; do
  curl -sSL -o "${slug}.png" "${BASE}/de_${slug}_radar_psd.png"
done
```

**Alternative — extract from your local CS2 install** with [Source 2 Viewer](https://valveresourceformat.github.io/):

```
<Steam>\steamapps\common\Counter-Strike Global Offensive\game\csgo\pak01_dir.vpk
  → resource/overviews/<map>_radar.png
```

Active duty maps as of 2026-05: Mirage, Inferno, Dust II, Anubis, Ancient,
Nuke, Vertigo. Reserve pool adds Overpass.

## Valorant (`public/minimaps/valorant/`)

Required files:

```
bind.png   haven.png   split.png   ascent.png   icebox.png
breeze.png  fracture.png  pearl.png  lotus.png
```

All 9 are bundled in this repo (1024×1024 RGBA), sourced from
[valorant-api.com](https://valorant-api.com) — a community-maintained mirror of
Riot's official VALORANT assets. The `displayIcon` field is the in-game top-down
map render (the same art VALORANT draws the minimap from). Riot does not ship a
clean radar PNG in game files; hot-linking the CDN is discouraged, so the PNGs
are vendored here. Used non-commercially per Riot's Legal Jibber Jabber policy
(MGA is a casual personal app).

**Refreshing** (after a Riot map-art update — re-resolve the UUIDs from
`https://valorant-api.com/v1/maps` first if a map was reworked):

```bash
cd apps/mygamingassistant/frontend/public/minimaps/valorant/
BASE="https://media.valorant-api.com/maps"
declare -A UUID=(
  [bind]=2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba
  [haven]=2bee0dc9-4ffe-519b-1cbd-7fbe763a6047
  [split]=d960549e-485c-e861-8d71-aa9d1aed12a2
  [ascent]=7eaecc1b-4337-bbf6-6ab9-04b8f06b3319
  [icebox]=e2ad5c54-4114-a870-9641-8ea21279579a
  [breeze]=2fb9a4fd-47b8-4e7d-a969-74b4046ebd53
  [fracture]=b529448b-4d60-346e-e89e-00a4c527a405
  [pearl]=fd267378-4d1d-484f-ff52-77821ed10dc2
  [lotus]=2fe4ed3a-450a-948b-6d6b-e89a78e680a9
)
for slug in "${!UUID[@]}"; do
  curl -sSL -o "${slug}.png" "${BASE}/${UUID[$slug]}/displayicon.png"
done
```

Dimensions are flexible — `MapZoneOverlay` renders polygons in a normalized 0-1
coordinate space, so any aspect-ratio image works as long as you calibrate
`MapZone.polygon_points` against it. The bundled `displayIcon` is square, so
authored polygons are square-normalized; if a future refresh swaps in a
non-square render, re-verify the seed polygons against it.

## After adding files

The backend fixture loader is now a real upsert
(`game_repo.upsert_map` updates `minimap_url` on existing rows). To pick up the
local-path values for already-seeded maps, re-run:

```bash
python -m app.cli load-fixtures
```

If your dev DB has the old Wikia URLs and you don't want to wait for the next
loader run, a one-shot UPDATE works too:

```sql
UPDATE map SET minimap_url = '/minimaps/cs2/' || slug || '.png'
WHERE game_id = (SELECT id FROM game WHERE slug = 'cs2');

UPDATE map SET minimap_url = '/minimaps/valorant/' || slug || '.png'
WHERE game_id = (SELECT id FROM game WHERE slug = 'valorant');
```
