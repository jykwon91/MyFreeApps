# Valorant KAY/O lineup-localization reference

Domain reference for MyGamingAssistant (MGA) lineup localization — **KAY/O**. Sibling of the
Viper reference (`scripts/valorant-viper-lineup-expert.md`) and the Sova reference. Same method,
different kit.

You localize ONE KAY/O lineup into its 4 storyboard events — STAND / AIM / THROW / LANDING — by
DENSE full-res frame study of a tutorial video. Pin each event by its VISUAL SIGNATURE, never a
timestamp guess or a fixed offset.

## Agent: KAY/O — the three lineup abilities

KAY/O is an initiator. All three lineup abilities are HAND-THROWN projectiles with a **left-click
(overhand / long lob)** vs **right-click (underhand / short, lower arc)** alt-fire — the throw
technique changes the arc, so read WHICH click was used from the release animation when you can.

- **FRAG/ment** (`fragment`) — the post-plant **MOLLY** equivalent and the overwhelming majority of
  "KAY/O post plant lineups." A hexagonal explosive device thrown in an arc; on impact it **sticks
  to the floor and detonates in a rapid SERIES of expanding explosions** (a cluster of ~7 blasts
  over ~2.5s, each a **purple / blue-white energy shockwave ring** on the ground — KAY/O's radianite
  theme, NOT orange fire — heavy damage). LANDING signature = the stuck device beginning its
  repeating purple ground detonations, NOT the mid-air device.
- **FLASH/drive** (`flashdrive`) — a **pop-flash** grenade. Thrown in an arc; **left-click = LONG
  fuse (~1s, detonates after travel/settle), right-click = SHORT fuse (fast pop).** It detonates
  into a **blinding white FLASH** (screen blooms white, flash bang icon). LANDING signature = the
  white flash bloom. Pop-flash lineups for site entry.
- **ZERO/point** (`zero-point`) — a **suppression** blade thrown that **sticks to a surface**, winds
  up, then emits a **radial SUPPRESSION pulse** (a translucent expanding shockwave that disables
  abilities of enemies in LOS + tags them, KAY/O's signature red/white pulse). Fewer lineups than
  fragment/flash, but a "throw ZERO/point onto site to suppress" lineup does exist. LANDING = the
  blade stuck + the suppression pulse onset.

Default assumption for a "KAY/O Post Plant Lineups" video: **fragment** unless the payload shows a
white flash pop (flashdrive) or a stuck blade + suppression pulse (zero-point). CONFIRM at frame
study and reclassify if the payload signature disagrees with the assumed ability.

## The 4 events — signatures

- **STAND** — the creator demonstrating WHERE to stand (feet/body against a wall seam, box edge,
  floor texture, a specific corner; sometimes a minimap dot). These compilations frequently CUT
  STRAIGHT INTO THE AIM behind an on-screen label, so a distinct feet/positioning beat is often
  absent — then use the EARLIEST stable window AT the throwing spot. ~1.5–3s.
- **AIM** — the view SETTLED with the ability EQUIPPED (the FRAG/ment hex device, FLASH/drive
  grenade, or ZERO/point blade in hand), crosshair parked on the alignment reference (skybox seam,
  rooftop tip, antenna, pipe/beam corner, a painted wall mark, a UI/HUD pixel the creator lines the
  crosshair to). Immediately pre-release. ~0.6–1.2s. KAY/O tutorials often show a pasted
  crosshair-placement STILL — that is an EDITOR OVERLAY, not the live aim; the AIM is the FINAL
  settled LIVE aim right before release.
- **THROW** — the RELEASE: the frame the hand looses the device/grenade/blade and it leaves in its
  arc (arm-swing snaps forward, projectile launches with its trail/arc). Window ~0.5–0.7s with the
  release in the FIRST THIRD, so the recut clip leads with windup → release → early flight.
  **TECHNIQUE + CLICK MATTER FOR KAY/O** — read `standing | jump | crouch`, and note whether the
  release looks like a **left-click (higher overhand lob)** or **right-click (lower underhand)**
  throw when discernible; jump-throws occur for longer lineups. Watch the feet/camera-bob: a
  jump-throw shows the view rise then the release at/near apex. Pin the release at 60fps — NEVER off
  a 1.0s coarse frame.
- **LANDING** — the ability DEPLOY ONSET at the destination:
  - **FRAG/ment** → the device hits, sticks, and begins its **repeating series of purple / blue-white
    energy ground explosions** (concentric shockwave rings, damage). The onset is the FIRST
    detonation, not the mid-air device. ~2.5s of repeating blasts total; capture the first blast.
  - **FLASH/drive** → a **white flash BLOOMS** at the detonation point (screen whites out from that
    direction). Capture the bloom onset.
  - **ZERO/point** → the blade **sticks** to the surface and, after its windup, emits the
    **suppression pulse** (expanding translucent ring). Capture the stick + pulse onset.

## Cast params to read

- **CHARGE** — KAY/O has none. Always report `none`.
- **CLICK** — `left (long/overhand) | right (short/underhand) | unknown`. Load-bearing for the arc.
  Especially for FLASH/drive (left = long fuse, right = short fuse) this changes the lineup.
- **BOUNCES** — the device/grenade may bounce off a wall/prop before settling. Read from the
  arc/trail in the result pan. Report `0 | 1 | 2 | unknown`.
- **TECHNIQUE** — `standing | jump | crouch`. Do NOT default to standing — report what the release
  frames actually show; a required jump/crouch is load-bearing lineup data.

## Mode-invariance — VALID vs FORBIDDEN signals

VALID (normal game, present live too): the equipped device/grenade/blade model, the projectile
arc/trail, the ability HUD icon, the fragment purple ground-explosion / flash bloom / suppression-pulse
deploy effects. FORBIDDEN — never time an event off these: editor overlays (drawn arrows/circles, a
pasted crosshair-placement still, a zoomed PiP reference inset, a minimap-only cutaway), the
on-screen label/title card, and any infinite-ability / cooldown-disabled practice HUD. KAY/O
tutorials lean HARD on pasted crosshair-placement stills — do not mistake the still for the live AIM.

## Editing is the default

The 4 events may live in SEPARATE cut shots within a segment. Localize each independently — do not
assume a continuous timeline. A segment can open on a label + a crosshair-placement still, show the
throw, then cut to a result/second-angle pan at the destination. Find YOUR lineup's live demo and
localize within it.

## Recording zones / side

Record the CREATOR'S CALLOUTS (from the on-screen label + geometry), NOT fixture slugs — the accept
step maps callouts → zones. `target` = where the utility deploys (the plant spot it denies / the
position it flashes/suppresses). `stand` = where it is cast from. Post-plant FRAG/ments are cast by
the **attacker** denying a defuse unless the frames show a defender retake hold. FLASH/drive entry
lineups are usually attacker pre-plant. The label is a HINT, not truth — confirm target/stand/side
from the frames.

## Honesty contract

This initiative exists because a whole batch once shipped "verified" while WRONG. The
`verify_events` CARD is the gate — judge on CONTENT (does the THROW strip show the loose + arc, not
the aim-dwell? does the LANDING strip show the fragment ground-explosions / flash bloom /
suppression pulse, not a mid-air device?), never on file validity. **Confirm the ability from the
LANDING payload** (repeating purple/blue-white ground blasts = fragment, white bloom = flashdrive,
stuck blade + pulse = zero-point) and **confirm the TECHNIQUE + CLICK** at the release. State uncertainty in CONFIDENCE
+ WEAKEST. **NEVER assert "verified."** The operator's full-res eyeball (frontend :5176) is the
final authority — especially the exact release frame and the technique/click.
