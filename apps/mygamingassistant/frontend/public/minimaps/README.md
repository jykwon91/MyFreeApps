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

Source from a local CS2 install — Valve ships the radar overviews as PNGs inside
`pak01_dir.vpk`:

```
<Steam>\steamapps\common\Counter-Strike Global Offensive\game\csgo\pak01_dir.vpk
  → resource/overviews/<map>_radar.png
```

Extract with [Source 2 Viewer](https://valveresourceformat.github.io/) (formerly
VRF). Open the .vpk, navigate to `resource/overviews/`, right-click the relevant
`*_radar.png` and save to this directory renamed to `<slug>.png`.

Active duty maps as of 2026-05: Mirage, Inferno, Dust II, Anubis, Ancient,
Nuke, Vertigo. Reserve pool adds Overpass.

## Valorant (`public/minimaps/valorant/`)

Required files:

```
bind.png   haven.png   split.png   ascent.png   icebox.png
breeze.png  fracture.png  pearl.png  lotus.png
```

Riot does not ship a clean radar PNG in game files. Three options:

1. **Riot HenrikDev API** — `https://api.henrikdev.xyz/valorant/v2/maps`; image URLs
   are stable Riot CDN paths. Hot-link risk is the same as Wikia — prefer extracting
   and saving locally.
2. **Riot's own Maps endpoint** — `https://valorant-api.com/v1/maps`; field
   `displayIcon` or `splash`.
3. Screenshot from in-game shooting range and crop to the minimap region.

Save each as `<slug>.png` per the list above. Dimensions are flexible — `MapZoneOverlay`
renders polygons in a normalized 0-1 coordinate space, so any aspect-ratio image works
as long as you calibrate `MapZone.polygon_points` against it.

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
