# Minimap Marker Catalog — which utility shows on the caster's own minimap

**Purpose:** when building lineup pins, the TARGET (landing) spot is hard to localize
precisely. Some utility, once landed/deployed, leaves a **persistent marker on the
throwing player's own in-game minimap** at its landed location — read that marker to
place the target pin exactly (or CV-localize it, same as `_kayo_localizer.py`). Other
utility (flashes, mollies, one-shot damage) leaves **no persistent marker**, so the
target must be placed from the landing-frame world view.

## The rule (what actually renders on YOUR minimap)

Grounded in our own frame study + Valorant sources (Riot patch 11.07/12.05 minimap
utility pass; ONE Esports / Jaxon minimap guides):

- **✓ SHOWS** — **reveals/recon** (Sova dart, Cypher cam), **deployed smokes** (once
  placed), **traps / sensors / deployables** (Cypher, Killjoy, Chamber, Deadlock),
  and an agent's **own persistent controlled zones** (esp. Viper — she has an explicit
  minimap utility indicator). Riot added a **teal highlight for redeployable** util.
- **✗ DOES NOT SHOW** — **mollies / damage zones** (incendiary, snakebite, fragment,
  mosh), **flashes**, and **one-shot damage projectiles** (Sova Shock, Raze nade). The
  radar's range *circle* is used as a lineup *guide*, but the molly's landed spot is
  **not** drawn on the minimap.

**Frame-confirmed in our own data (ground truth, not inference):**

| Agent | Ability | Marker? | Evidence |
|---|---|---|---|
| KAY/O | ZERO/point (knife) | **✓** | suppression dome + dark blade glyph at landed spot — Fracture landing frames |
| KAY/O | FRAG/ment (molly) | **✗** | Fracture frames: only self-arrow, no landed marker |
| KAY/O | FLASH/drive | **✗** | Fracture frames: no marker |
| Sova | Recon Bolt (dart) | **✓** | dart icon + teal scan arc + "?" reveal at stuck spot — Fracture landing frames |
| Sova | Shock Bolt | **✗** | Fracture frames: only self-arrow |

**Legend for the tables below:** ✓ = shows a landing marker (read the target off it) ·
✗ = none · ? = unconfirmed. **src**: `frame` = confirmed in our data · `web` =
Valorant source · `infer` = from the rule above, not yet frame-verified.

> Correct any `infer`/`?` line as you hit it in a real frame — operator is ground truth.
> Only THROWABLE / PLACEABLE / DEPLOYABLE (lineup-relevant) abilities listed.
> See [[reference_mga_kayo_knife_minimap_marker]].

---

## Controllers

| Agent | Ability | Marker? | src | Note |
|---|---|---|---|---|
| Brimstone | Sky Smoke | ✓ | infer | placed via overhead map — location known regardless |
| Brimstone | Incendiary (molly) | ✗ | infer | molly zone — not drawn on minimap |
| Omen | Dark Cover (smoke) | ✓ | infer | deployed smoke shows once placed |
| Viper | Poison Cloud (orb) | ✓ | web | Viper has an explicit minimap utility indicator |
| Viper | Toxic Screen (wall) | ✓ | web | wall shows as a line |
| Viper | Snake Bite (molly) | ? | — | molly rule says ✗, but Viper zones show — confirm |
| Astra | Star / Nova / Nebula / Gravity Well | ✓ | infer | placed in Astral form; zones show |
| Harbor | Cascade / Cove / High Tide (water) | ✓ | infer | water zones show |
| Clove | Ruse (smokes) | ✓ | infer | placed via overhead map |

## Initiators

| Agent | Ability | Marker? | src | Note |
|---|---|---|---|---|
| Sova | Recon Bolt (dart) | ✓ | **frame** | dart + scan arc at target |
| Sova | Shock Bolt | ✗ | **frame** | instantaneous damage |
| Sova | Owl Drone | ✓ | infer | drone shows while active |
| Fade | Haunt (eye) | ✓ | infer | reveal — shows |
| Fade | Seize (orb) | ? | — | tether/decay zone — confirm |
| Fade | Prowler | ✗ | infer | moving creature (not a fixed landing marker) |
| KAY/O | ZERO/point (knife) | ✓ | **frame** | dome + blade glyph |
| KAY/O | FRAG/ment (molly) | ✗ | **frame** | no marker |
| KAY/O | FLASH/drive | ✗ | **frame** | no marker |
| Gekko | Mosh Pit (molly) | ✗ | infer | molly zone — not drawn |
| Gekko | Wingman / Dizzy / Thrash | ✗ | infer | moving creatures |
| Breach | Flashpoint / Fault Line / Aftershock | ✗ | infer | aimed through terrain, no landing marker |
| Skye | Guiding Light / Trailblazer | ✗ | infer | moving, brief |
| Tejo | (rockets / guided salvo) | ? | — | newer agent — has a map targeter; confirm |

## Duelists (mostly non-lineup)

| Agent | Ability | Marker? | src | Note |
|---|---|---|---|---|
| Phoenix | Hot Hands (molly) | ✗ | infer | molly zone |
| Phoenix | Blaze (wall) | ? | — | wall — confirm whether it shows as a line |
| Phoenix | Curveball (flash) | ✗ | infer | flash |
| Raze | Paint Shells / Boom Bot | ✗ | infer | damage / moving bot |
| Yoru / Jett / Neon / Reyna / Iso | flashes / mobility | ✗ | infer | not lineup util |

## Sentinels (deployables — mostly show to the owner)

| Agent | Ability | Marker? | src | Note |
|---|---|---|---|---|
| Killjoy | Turret / Alarmbot / Nanoswarm / Lockdown | ✓ | infer | her deployables show as icons on HER minimap (incl. Nanoswarm, though it's a molly) |
| Cypher | Trapwire / Cyber Cage / Spycam | ✓ | web | placed util / camera spots show on minimap |
| Sage | Barrier Orb (wall) | ? | — | confirm |
| Sage | Slow Orb | ? | — | slow zone — confirm |
| Chamber | Trademark / Rendezvous | ✓ | infer | traps/anchors show |
| Deadlock | GravNet / Sonic Sensor / Barrier Mesh | ✓ | infer | deployables show |
| Vyse | (traps) | ? | — | newer agent — confirm |

---

## CS2 note (radar, not "agents")

CS2 radar shows thrown utility: **smokes** appear as a marker while active,
**molotov/incendiary** fire shows as a zone, **decoy** pings. **Flashbangs** and **HE**
are instantaneous → no persistent radar marker. (Confirm per-frame; CS2 radar is also
player-follow/rotating like Valorant's.)
