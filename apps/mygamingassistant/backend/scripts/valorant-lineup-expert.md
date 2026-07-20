# Valorant Sova lineup-localization reference (Breeze-adapted)

Domain reference for MyGamingAssistant (MGA) lineup localization. Recreated 2026-07-02
(Breeze pilot) — the prior copy lived in the removed `mga-valorant-sova` worktree; content is
derived from `scripts/LOCALIZE_INSTRUCTIONS_SOVA.md` (Ascent) plus the Breeze source study.

You localize ONE Sova lineup into its 4 storyboard events — STAND / AIM / THROW / LANDING — by
DENSE full-res frame study of a tutorial video. Pin each event by its VISUAL SIGNATURE, never a
timestamp guess or a fixed offset.

## Agent: Sova
This source uses two Sova abilities: **Recon Bolt** (`recon`) and **Shock Bolt** (`shock`).
Both fire from a BOW: draw → charge → loose. The bow draw, the charge indicator, and the arrow
flight trail are NORMAL game UI and ARE valid signals (unlike a CS2 practice-mode trajectory
arc, which is a practice-only tell).

## The 4 events — signatures

- **STAND** — the creator demonstrating WHERE to stand (feet/body against a wall seam, box
  edge, floor texture; sometimes a minimap dot). Tseeky usually CUTS STRAIGHT INTO THE AIM
  behind an editor title card, so a distinct feet/positioning beat is often absent — then use
  the EARLIEST stable window AT the throwing spot. ~1.5–3s.
- **AIM** — view SETTLED, bow drawn, CHARGE SET, crosshair parked on the alignment reference
  (skybox seam, rooftop tip, antenna, pipe/beam corner, wall edge), immediately pre-release.
  ~0.6–1.2s. Tseeky often pans the aim UP from a low reference to the true high one — the AIM
  is the FINAL settled aim right before release, not the first.
- **THROW** — the RELEASE: the frame the bow looses and the arrow leaves (bow snaps forward,
  arrow launches with its trail). Window ~0.5–0.7s with the release in the FIRST THIRD, so the
  recut clip leads with windup → release → early flight. Almost always standing; note any
  required jump/crouch. Pin at 60fps — NEVER off a 0.5s coarse frame.
- **LANDING** — the ability DEPLOY ONSET at the destination:
  - **RECON bolt** → the arrow STICKS to a surface and emits expanding BLUE SONAR SCAN RINGS
    (an electronic ping sweep). If the camera recaps before a crisp ring pulse, capture the
    bolt's ARRIVAL + STICK (its blue energy at the destination) — that is the usable deploy
    signal.
  - **SHOCK bolt** → DETONATES on impact (no stick): a brief blue/white ELECTRIC BURST.
  ~0.8–1.5s from the onset.

## Cast params to read
- **CHARGE** — from bow-draw depth + the on-screen charge indicator (pips/stars fill as the
  bow is held). Report `none | 1bar | 2bar | full`. Full = maximum draw = longest range.
- **BOUNCES** — arrow ricochets in flight, read from the trajectory trail in the result pan.
  Report `0 | 1 | 2 | unknown`. Recon "God Arrow" lineups usually bounce 1–2 times.
- **TECHNIQUE** — `standing` unless a jump or crouch is clearly required at the release.

## Mode-invariance — VALID vs FORBIDDEN signals
VALID (normal game): bow draw, charge indicator, arrow flight trail, ability HUD icon, recon
sonar rings, shock burst. FORBIDDEN — never time an event off these: editor overlays (drawn
arrows/circles, a pasted crosshair-placement still, a zoomed PiP reference inset, a minimap-only
cutaway), the title card, and any infinite-ability / cooldown-disabled practice HUD.

## Editing is the default
The 4 events may live in SEPARATE cut shots within a chapter. Localize each independently — do
not assume a continuous timeline. The chapter can open on a title card and end with a recap /
second-angle pan. Find YOUR lineup's demo and localize within it.

## Map: Breeze (2 sites — A / B — plus Mid)
Breeze is a large, open, long-sightline map. This source (Tseeky, `9STlc0XPsrw`) is ordered
ATT A-site → ATT B-site → ATT Mid → DEF A → DEF B → DEF Mid → SHOCK A/B. Record the CREATOR'S
CALLOUTS (from the title card + geometry), NOT fixture slugs — the accept step maps callouts →
zones.

Fixture zones available at accept (map_zone slugs): `a-site`, `b-site`, `a-main`, `b-main`,
`mid`, `ct-spawn`, `t-spawn`. Sides = **Attacker / Defender** (the chapter prefix ATT/DEF tells
you which). Callouts seen in this source: A Main, A Site, A Yellow / Back Site, A Lobby, A
Retake, A Support, B Site, B Main, B Elbow, B Lobby, B Support, B Retake, B Legolas, Middle.
- `target` = where the dart deploys / what it reveals.
- `stand`  = where it is cast from.
The chapter name is a HINT, not truth — confirm target/stand from the frames.

## Honesty contract
This initiative exists because a whole batch shipped "verified" while WRONG. The `verify_events`
CARD is the gate — judge on CONTENT (does the THROW strip show the loose, not the aim-dwell?
does the LANDING strip show sonar rings / an electric burst, not a mid-flight arc?), never on
file validity. State uncertainty in CONFIDENCE + WEAKEST. **NEVER assert "verified."** The
operator's full-res eyeball is the final authority, especially the exact release frame and the
charge level.
