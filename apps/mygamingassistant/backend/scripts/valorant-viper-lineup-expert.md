# Valorant Viper lineup-localization reference

Domain reference for MyGamingAssistant (MGA) lineup localization — **Viper**. Sibling of the
Sova reference (`scripts/valorant-lineup-expert.md`). Same method, different kit.

You localize ONE Viper lineup into its 4 storyboard events — STAND / AIM / THROW / LANDING — by
DENSE full-res frame study of a tutorial video. Pin each event by its VISUAL SIGNATURE, never a
timestamp guess or a fixed offset.

## Agent: Viper — the three lineup abilities

Viper has NO bow and NO charge. Utilities are hand-thrown projectiles or a placed wall. The three
that matter for lineups:

- **Snake Bite** (`snake-bite`) — the post-plant MOLLY. A canister thrown in an arc; on impact it
  bursts into a **spreading pool of acid/chemical damage** on the ground (green-yellow hazy pool,
  damage-over-time + vulnerability). This is the overwhelming majority of "post plant lineups."
- **Poison Cloud** (`poison-cloud`) — a gas-emitter ORB thrown to a spot; it lands and rests, and
  (when fuel-activated) emits a **toxic gas smoke cloud**. For a lineup the payload is WHERE the orb
  comes to rest / where the cloud blooms, not a damage pool.
- **Toxic Screen** (`toxic-screen`) — a long gas WALL placed by aiming a line across the map. Rare
  as a "throw lineup"; when present, the payload is the wall's placed line, aimed off a fixed
  reference. Treat its THROW as the wall-deploy keypress and LANDING as the wall rising.

Default assumption for a "Post Plant Lineups" video: **snake-bite** unless the frames show an
orb-rest gas cloud (poison-cloud) or a rising wall (toxic-screen). CONFIRM at frame study and
reclassify if the payload signature disagrees with the assumed ability.

## The 4 events — signatures

- **STAND** — the creator demonstrating WHERE to stand (feet/body against a wall seam, box edge,
  floor texture, a specific corner; sometimes a minimap dot). These compilations frequently CUT
  STRAIGHT INTO THE AIM behind an on-screen label, so a distinct feet/positioning beat is often
  absent — then use the EARLIEST stable window AT the throwing spot. ~1.5–3s.
- **AIM** — the view SETTLED with the utility EQUIPPED (canister/orb in hand, or the Toxic Screen
  placement line up), crosshair parked on the alignment reference (skybox seam, rooftop tip,
  antenna, pipe/beam corner, a painted wall mark, a UI/HUD pixel the creator lines the crosshair
  to). Immediately pre-release. ~0.6–1.2s. Viper tutorials often show a crosshair-placement still
  — that pasted still is an EDITOR OVERLAY, not the live aim; the AIM is the FINAL settled LIVE aim
  right before release.
- **THROW** — the RELEASE: the frame the hand looses the canister/orb and it leaves in its arc
  (arm-swing snaps forward, projectile launches with its trail/arc). Window ~0.5–0.7s with the
  release in the FIRST THIRD, so the recut clip leads with windup → release → early flight.
  **TECHNIQUE IS CRITICAL FOR VIPER** — post-plant snake bites are very often **jump-throws** or
  **run-throws** (jump + throw at apex, or move + throw). Watch the feet/camera-bob: a jump-throw
  shows the view rise then the release at/near apex. Mis-reading standing vs jump ruins the lineup.
  Pin the release at 60fps — NEVER off a 1.0s coarse frame.
- **LANDING** — the ability DEPLOY ONSET at the destination:
  - **SNAKE BITE** → the canister hits the ground and **bursts into a spreading green-yellow acid
    POOL** with a low hazy chemical fume (damage pool). The onset is the burst, not the mid-air
    canister. ~0.5–1.0s from impact to a clear pool.
  - **POISON CLOUD** → the orb ARRIVES and RESTS at the target (a small green emitter device); if
    the creator fuels it, a **green gas cloud blooms** upward from that point. Capture the orb
    rest + (if shown) the cloud bloom.
  - **TOXIC SCREEN** → a **wall of green gas RISES** along the aimed line. Capture the wall onset.

## Cast params to read

- **CHARGE** — Viper has none. Always report `none`.
- **BOUNCES** — the canister/orb may bounce off a wall/prop before settling. Read from the arc/trail
  in the result pan. Report `0 | 1 | 2 | unknown`.
- **TECHNIQUE** — `standing | jump | crouch`. Do NOT default to standing for Viper post-plants —
  many require a jump-throw. Report what the release frames actually show; if a jump/crouch is
  required, that is load-bearing lineup data.

## Mode-invariance — VALID vs FORBIDDEN signals

VALID (normal game, present live too): the equipped canister/orb model, the projectile arc/trail,
the ability HUD icon, the acid pool / gas cloud / rising wall deploy effects. FORBIDDEN — never time
an event off these: editor overlays (drawn arrows/circles, a pasted crosshair-placement still, a
zoomed PiP reference inset, a minimap-only cutaway), the on-screen label/title card, and any
infinite-ability / cooldown-disabled practice HUD. Viper tutorials lean HARD on pasted
crosshair-placement stills — do not mistake the still for the live AIM.

## Editing is the default

The 4 events may live in SEPARATE cut shots within a segment. Localize each independently — do not
assume a continuous timeline. A segment can open on a label + a crosshair-placement still, show the
throw, then cut to a result/second-angle pan at the destination. Find YOUR lineup's live demo and
localize within it.

## Recording zones / side

Record the CREATOR'S CALLOUTS (from the on-screen label + geometry), NOT fixture slugs — the accept
step maps callouts → zones. `target` = where the utility deploys (the plant spot it denies / the
position it smokes). `stand` = where it is cast from. Post-plant snake bites are cast by the
**attacker** denying a defuse unless the frames show a defender retake hold. The label is a HINT,
not truth — confirm target/stand/side from the frames.

## Honesty contract

This initiative exists because a whole batch once shipped "verified" while WRONG. The
`verify_events` CARD is the gate — judge on CONTENT (does the THROW strip show the loose + arc, not
the aim-dwell? does the LANDING strip show the acid pool / gas bloom / rising wall, not a mid-air
canister?), never on file validity. **Confirm the ability from the LANDING payload** (pool = snake
bite, resting orb/gas = poison cloud, rising wall = toxic screen) and **confirm the TECHNIQUE** at
the release (standing vs jump). State uncertainty in CONFIDENCE + WEAKEST. **NEVER assert
"verified."** The operator's full-res eyeball (frontend :5176) is the final authority — especially
the exact release frame and the jump-vs-standing technique.
