# CS2 lineup-localization reference (Inferno-adapted)

Domain reference for MyGamingAssistant (MGA) lineup localization — the CS2 analogue of
`scripts/valorant-lineup-expert.md`. Written 2026-07-08 for the Inferno smoke batch
(NartOutHere `2pSqBc6M10s`).

You localize ONE CS2 grenade lineup into its 4 storyboard events — STAND / AIM / THROW /
LANDING — by DENSE full-res frame study of a tutorial video. Pin each event by its VISUAL
SIGNATURE, never a timestamp guess or a fixed offset.

## Game: Counter-Strike 2 (NOT Valorant)
CS2 has NO agents/abilities. Utility is bought and thrown by hand. There is **no `agent_hint`**
for CS2 (Valorant sets `agent_hint=sova`; CS2 omits it). `game_hint=cs2`, `map_hint=inferno`.

## The 4 events — signatures (CS2 grenades)

- **STAND** — the creator DEMONSTRATING where to stand: player body/feet lined up against a
  specific wall seam, pixel, corner, box edge, doorway, or floor texture, often with a precise
  crosshair-placement reference already framed. CS2 tutorials frequently show a brief "stand
  here" beat (feet on a spot, back to a wall) before the aim. If there is no distinct feet beat,
  use the EARLIEST stable window AT the throwing spot. ~1.5–3s.
- **AIM** — the view SETTLED with the crosshair PARKED on the alignment reference (a rooftop
  tip, antenna, window corner, skybox seam, wall crack, lamp, edge of a building) immediately
  pre-release. ~0.6–1.2s. The alignment pixel IS the lineup — this is the frame the operator
  most needs. Note the **technique** here: a jump-throw pans/holds differently than a standing
  throw (see TECHNIQUE below).
- **THROW** — the RELEASE: the frame the grenade LEAVES THE HAND (left-click release; the arm
  snaps forward and the nade launches). Window ~0.5–0.7s with the release in the FIRST THIRD so
  the recut clip leads with windup → release → early flight.
  - **Standing throw** → release is at the settled aim.
  - **Jump-throw** → the nade releases at the **apex of the jump** (jump + throw bound together);
    pin the release frame at the top of the jump arc, not at the crosshair-settle before the jump.
  - **Running / W-throw** → thrown while moving forward; the body is in motion at release.
- **LANDING** — the utility DEPLOY ONSET at the destination. **Per utility type:**
  - **smoke** → the grenade bursts and a **smoke plume blooms** and expands into the full round
    sphere (~1s bloom to full). LANDING = the first frame the smoke starts to bloom at the
    destination, through to a recognizable sphere.
  - **molotov / incendiary** (`molotov`) → the projectile shatters and **flames spread** across
    the floor/surface (orange fire pool). LANDING = ignition + flame spread onset.
  - **flash** (`flash`) → the grenade **pops** with a bright white flash-out (screen/scene whites
    out for a beat). LANDING = the pop-and-white frame.
  - **HE / frag** (`grenade`) → **detonation**: a sharp explosion puff + damage. LANDING = the
    detonation frame.

## Technique — read it from the AIM/THROW motion
- `standing` — feet planted, no jump, no forward motion at release.
- `jump` (jump-throw) — a jump is clearly required; release at the jump apex. Extremely common
  for CS2 smokes that need extra distance/height. Look for the view rising then the throw.
- `running` / `w-throw` — thrown while walking/running forward (the world slides at release).
Report `standing | jump | running`. Note any crouch or move-throw in NOTES.

## Mode-invariance — VALID vs FORBIDDEN signals (CS2 — the OPPOSITE of Valorant on one point)
CS2 tutorials are almost always filmed in a **practice server** with cheats on. Some on-screen
elements are PRACTICE-ONLY and MUST NOT be used to time an event:
- **FORBIDDEN**: the yellow/colored **grenade TRAJECTORY ARC** line (`sv_grenade_trajectory` —
  a practice-only overlay that traces the flight path; it does NOT exist in a real match), the
  **impact/landing marker rings** it draws, `sv_showimpacts` markers, the **infinite-ammo /
  no-cooldown practice HUD**, `noclip`/spectator free-cam pans, and any **editor overlays**
  (drawn arrows/circles, pasted crosshair-placement still, a zoomed PiP inset, a minimap-only
  cutaway, the "USE CODE …" sponsor card).
- **VALID (mode-invariant)**: the player's body/feet at the stand, the crosshair on the alignment
  pixel, the grenade **leaving the hand**, the grenade's own in-world model in early flight, and
  the **smoke bloom / molly flames / flash pop / HE detonation** at the destination.
The trajectory arc is USEFUL to ORIENT (it shows you where to look for the landing) but the EVENT
timestamps must be pinned to mode-invariant signals — never to the arc appearing/disappearing.

## Editing is the default
The 4 events may live in SEPARATE cut shots within a chapter. Localize each independently — do
not assume a continuous timeline. A chapter can open on a title card, show the stand, cut to the
aim, cut to a third-person or landing recap. Several Inferno chapters are GROUPED ("… Smokes"
plural) or COMBO ("… & …" / "1 Position") that demonstrate 2–3 throws — localize the PRIMARY
(first/clearest) throw and describe the rest in NOTES.

## Map: Inferno (2 bomb sites — A / B — connected by Banana and Mid)
Inferno is the Italian-village map. T's push A through Mid/Arch/Apartments and B through Banana.
Record the CREATOR'S CALLOUTS (from the chapter title + geometry), NOT fixture slugs — the accept
step maps callouts → the 8 fixture zones (`a-long`, `a-site`, `b-site`, `banana`, `ct-spawn`,
`mid`, `second-mid`, `t-spawn`).

### Inferno callout glossary (for reading the chapter titles)
- **Banana** — the long ramp/corridor from T side up to B site. **Bottom / Mid / Top Banana**,
  **Car**, **Sandbags**, **Logs/Barrels**.
- **B site** — **Coffins**, **First/Second Oranges**, **New Box (Newbox)**, **Dark**, **B Halls**,
  **B Fountain**, **CT (from B)**, **B Default/Plant**.
- **CT** — **CT spawn**, the choke between A/B behind Arch; **Boiler** (under CT toward B),
  **Pit** (the lowered A-site sub-area), **Graveyard** (behind A toward CT).
- **A site** — **Pit**, **Graveyard**, **Quad/Bench**, **Ruins**, **Truck**, **Arch** (the
  archway from Mid to A), **Moto/Motorcycle**, **Library**, **Balcony**, **Backsite**.
- **Mid** — **First Mid / Second Mid**, **Top Mid**, **Mid Window**, **Short** (short A from
  Mid), **Apartments (Apps)** — the building T's take to A balcony; **Aps Lurk**.
- **Halfwall** — the low wall near T ramp/Banana entry used for setup lineups.

### Side inference (CS2 = T / CT, mapped to attacker/defender)
This video's titles carry origin tags — **"From T Spawn" / "From T Stairs"** ⇒ **T (attacker)**;
**"From CT Spawn" / "CT Side Smokes"** ⇒ **CT (defender)**; **"Retake Smokes"** ⇒ **CT
(defender)** retaking a site post-plant. Executes onto a site (banana push, A execute) ⇒ T. Where
a title has no tag, INFER from the throwing origin visible in the frames (T-spawn barrier vs
CT-spawn geometry) — the name is a hint, not truth.
- `target` = where the smoke/molly/flash blooms/lands (CT, Coffins, Banana, Arch, Library, Moto, A
  site, B site, Mid, …).
- `stand` = where it is thrown from (note the "From …" origin tags and the grouped/combo variations).

## Honesty contract (this initiative exists because a whole batch shipped "verified" while WRONG)
- The `verify_events` CARD is the gate — judge on CONTENT, never on file validity.
- State uncertainty explicitly in CONFIDENCE + WEAKEST. **NEVER assert "verified."** The
  operator's full-res eyeball (frontend :5176) is the final authority, especially the exact
  release frame and the jump-throw apex.
- For GROUPED/COMBO chapters, say WHICH of the 2–3 throws you localized and describe the others.
- Confirm the LANDING signature matches the utility type (smoke bloom for `smoke`; flames for
  `molotov`; flash pop for `flash`; detonation for `grenade`). A mismatch means you mis-pinned.
