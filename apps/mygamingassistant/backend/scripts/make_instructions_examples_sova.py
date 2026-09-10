"""SOVA title-grammar buckets -- one entry per SOURCE, keyed (AGENT, pack stem).

Every example in here is a REAL chapter title from that exact source, pasted from the
chapters dump -- never a plausible-looking invention. A bucket describes ONE creator's
grammar, so two sources for the same map are two entries, keyed by their pack stems.

Split per agent so adding a source touches one small file: the combined corpus crossed the
500-LOC growth guard, and SOVA's sources share a HUD and a title dialect anyway.
"""
from make_instructions_prose import SRC_CACHE  # noqa: E402

# (AGENT, map) -> the title-grammar paragraph. Every example is a REAL chapter title from that
# exact source, pasted from the chapters dump — never a plausible-looking invention.
EXAMPLES = {
    ("SOVA", "abyss"): {
        "grammar": "**`<STAND> to <TARGET>`** — the REVERSED order: the callout BEFORE `to` is "
                   "where the player STANDS and the one AFTER it is where the bolt lands. Both "
                   "are already resolved in your item; confirm them against the footage",
        "examples":
        "`A Lobby to A Main` is thrown FROM A Lobby INTO A Main — reading it the other way round "
        "would swap both fields. **This source writes the destination as a BARE LETTER**: `A Lobby "
        "to A` and `B Main to B` land on A SITE and B SITE respectively. A SLASH joins two adjacent "
        "areas of one position and the FIRST names it, so `A Site/Backsite to A Lobby` is thrown "
        "from A SITE. An **`&`** joins two features of ONE destination: `B to B Main & Window` and "
        "`B Heaven to B Main & Rope` both land in B MAIN — Window and Rope are features of that "
        "corridor, not areas of their own. `A Lobby to A Main No.2` is a second variant from the "
        "same stand as the row before it. A parenthetical names a ROLE, never a place: "
        "`B Lobby to B (Postplant)`. **Five rows legitimately have the SAME zone either side of "
        "`to`** — `Bottom Mid to Top Mid`, `Top Mid to Bottom Mid`, `Library to Bottom Mid`, "
        "`B to B Orb`, `B Heaven to B Default` — because both callouts fall in one coarse zone. "
        "That is expected here, not an error to flag. **The `(Shocks)` suffix marks the author's "
        "shock-dart rows; treat it as a HINT and report the utility the LANDING actually shows** — "
        "a recon bolt STICKS and emits repeating scan pulses, a shock dart DETONATES once and "
        "leaves nothing.",
        "bullets": [
            ("Cached video:",
             f"- Cached video: {SRC_CACHE.replace('<VID>', 'cTrav7nTu2Y')} (1920x1080 @ 59.94fps, "
             f"verified with ffprobe). It is genuinely 60fps, so the release is wide enough to pin "
             f"honestly — use `--step 0` and do not widen the THROW window to hedge."),
            # CORRECTED 2026-09-09 from the first 30-lineup run. The previous text said this
            # source has "no HUD-off intro ... the STAND beat can begin immediately". The HUD is
            # indeed live throughout -- but the opening seconds are an EDITOR FLOURISH, and four
            # separate gates (#08, #20, #27, #28) failed a STAND that had been pinned there,
            # independently describing the same thing: a melee knife being twirled at a
            # featureless teal wall under the number overlay, with no positional reference at all.
            # "The HUD is live" was true and "so you may start immediately" did not follow.
            ("Creator:",
             "- Creator: **maxWELL Lineup-Larry**, filmed in a PRACTICE/custom server. The HUD is "
             "live from the first frame (minimap, ability bar, location readout) — but **do NOT "
             "take that as licence to pin STAND at the chapter's first stable moment.** Every "
             "chapter opens with an EDITOR FLOURISH: a large **lineup NUMBER** wipes across the "
             "centre of frame while the player idles with the **melee knife out**, twirling or "
             "inspecting it, usually facing a blank wall in a corner with no landmark. That is not "
             "the throwing spot and carries no spot evidence. **The reliable tell that the demo "
             "has begun is the KNIFE→BOW swap** — the throwing stance is where the player stands "
             "once Sova's bow is equipped. Three more overlays are the author's, not the game's, "
             "and none is evidence of an event: a lower-third **`From <X> / To <Y>` banner** "
             "(useful corroboration for stand/target, but it is the author's label, not the "
             "footage); a **prose coaching caption** on the right — e.g. \"support your A-hit with "
             "this fast recon\"; and occasional **punch-in zooms onto the ability HUD with drawn "
             "red annotation circles**, which are a teaching aside and never a STAND. Shots are "
             "joined by hard cuts AND by cross-dissolves — a dissolve shows two superimposed HUDs "
             "(two minimaps, doubled ammo readouts) and is a transition, never a deploy. Never pin "
             "LANDING to a caption, and note in WEAKEST if a caption is the only thing suggesting "
             "an outcome you could not actually see."),
            # The base doc's STAND and AIM bullets describe TSEEKY's editing by name (cuts straight
            # into the aim behind a title card; habitually pans the aim up from a low reference).
            # Neither claim has been checked against maxWELL's footage and one is already known to
            # be false -- this source has no title card at all. Restated to say only what has been
            # verified about it, and to make the shot structure something the localizer READS
            # rather than something it expects.
            ("- **STAND** =",
             "- **STAND** = the creator DEMONSTRATING where to stand, and it must actually SHOW "
             "the spot: body/feet against a wall seam, box edge or floor texture, with the "
             "location readout and minimap dot corroborating. ~1.5–3s. **Start looking AFTER the "
             "knife→bow swap, not at the top of the chapter** — the opening seconds are the "
             "author's number-wipe flourish over a knife twirl at a blank wall, and a STAND pinned "
             "there is the single most common way this source is localized wrong. Reject any "
             "candidate window where: the player holds the MELEE knife rather than the bow; the "
             "frames are an editor punch-in on the ability HUD; the view is a featureless "
             "wall/floor corner with no landmark; or the five frames are five DIFFERENT places "
             "(that is a montage, not a stance). If the chapter truly never shows a positioning "
             "beat, use the earliest stable window at the throwing spot with the bow already out, "
             "and say so in WEAKEST rather than stretching backwards into the intro."),
            ("- **AIM** =",
             "- **AIM** = the view SETTLED, bow drawn, **charge set**, crosshair parked on the "
             "alignment reference, immediately pre-release. On Abyss the map has no ground beyond "
             "its edges, so the reference is usually architectural — a rooftop tip, an antenna, a "
             "platform corner, a skybox seam — rather than terrain. ~0.6–1.2s. If the aim is panned "
             "or corrected before the loose, the AIM is the FINAL settled aim immediately before "
             "release, never one it passes through on the way."),
            ("Sides = **Attacker / Defender**",
             "- Use the callouts below rather than fixture slugs. **Do NOT report a SIDE.** These "
             "chapter titles carry no ATT/DEF prefix; the author instead prints **ATTACK** (red) "
             "or **DEFENSE** (teal) in the bottom-right corner of every frame, and side is already "
             "resolved from that upstream and deliberately absent from your item. The practice "
             "server spawns the demo player attacker-side regardless, so spawn-side cues are not "
             "evidence."),
        ],
    },
    # SECOND source for abyss. Keyed on the pack stem, not the map: this creator shares nothing
    # with maxWELL's bucket above -- opposite title grammar, opposite HUD behaviour, a different
    # place the side is written. Reusing that bucket would have handed this source a description of
    # someone else's video and read as a clean run.
    ("SOVA", "abyss-2"): {
        "grammar": "**`<TARGET> [n] [qualifier]`** — a bare callout for what the arrow REVEALS. "
                   "The stand is usually NOT in the title and your item carries a placeholder for "
                   "it; where the title does name one, it is already resolved in your item",
        "examples":
        "`A Main 1`, `A Main 2`, `A Lobby`, `B Main`, `B Retake 1` and `B Retake 2` are bare "
        "targets. **Three titles name the stand with a `From` clause** — `A Site 2 From A Main`, "
        "`A Site 3 From A Lobby`, `B Site 2 From B Nest` — and **two more name it by simply "
        "putting it after the target with no joiner at all**: `B Site 3 B Lobby` and `B Site 4 B "
        "Main Mid Round` are the third and fourth of a numbered B SITE series, thrown from B Lobby "
        "and B Main. Read those two as TARGET-then-STAND; the item already does, and the trailing "
        "callout is the author's own claim about the stand — corroborate it against the location "
        "readout rather than assuming it. A **`+`** joins two areas ONE arrow covers, so both are "
        "destination: `A Lobby + Main Simple Arrow`, `B Main + Nest Wallbang`. Parentheticals are "
        "never callouts here — `(Attacker)` / `(Defender)` name the SIDE and `(Thanks "
        "JohnnyPKay!)` is a credit. `God Arrow`, `Fake Arrow`, `Ultimate Combo`, `Best Spot`, "
        "`Close`, `Simple`, `Mid Round`, `Wallbang`, `Support` and `Retake` are adjectives and "
        "roles, never places — but `A Default` and `B Orb` in the three `Double Shock Dart` titles "
        "ARE spots, on A site and B site respectively. **A `Fake Arrow` is still a real recon "
        "bolt**: it is fake in intent, not in utility, so localize it like any other recon row.",
        "bullets": [
            ("Cached video:",
             f"- Cached video: {SRC_CACHE.replace('<VID>', '-W5HiuAQm-o')} (2560x1440 @ 60fps, "
             f"verified with ffprobe). Genuinely 60fps, so the release is wide enough to pin "
             f"honestly — use `--step 0` and do not widen the THROW window to hedge. Note the "
             f"**1440p** frame: HUD elements sit proportionally where they do at 1080p, but any "
             f"pixel box you carry over from another source will be in the wrong place."),
            # Verified by frame study on four chapters spanning both abilities and both sides
            # (cs=7, 180, 324, 599) -- not recalled, and not assumed from the other Tseeky sources.
            # The generic TSEEKY_HUD_OFF constant says the open is a close-up of the AIM REFERENCE;
            # on this source it is a close-up of the LANDING, which is a materially worse trap: a
            # localizer looking for the reveal can find a real one ~4s before the throw it belongs
            # to. That is why this bucket does not reuse that constant.
            ("Creator:",
             "- Creator: **Tseeky - Pro Valorant Lineups**, filmed in a PRACTICE/custom server. "
             "**The first ~4s of every chapter are NOT gameplay and NOT the stand.** Each chapter "
             "opens with a HUD-OFF close-up **of the DESTINATION**, showing the utility already "
             "arriving there — the recon bolt sticking and fanning its scan rays, or the shock "
             "darts detonating. There is no minimap, no ability bar and no location readout during "
             "it, and a **title plate sits in the BOTTOM-LEFT**: a short name on the first line and "
             "the ability + side on the second (`Attacker Recon`, `Defender Recon`, `Double "
             "Shocks`). The plate is TRANSIENT — it is gone by the time gameplay starts. Then a "
             "hard cut to the real demo: the HUD returns at roughly **+4.0s** and the minimap about "
             "half a second after it, and **the STAND beat begins there**. Two consequences, both "
             "load-bearing: never pin STAND inside the close-up (the player is not at the throwing "
             "spot and there is no positional evidence at all), and **never pin LANDING to it "
             "either** — that reveal is a PREVIEW of an event that has not happened yet in this "
             "chapter, and the real landing follows the throw several seconds later. Do not report "
             "the chapter as having no HUD."),
            ("- **STAND** =",
             "- **STAND** = the creator DEMONSTRATING where to stand, and it must actually SHOW "
             "the spot: body/feet against a wall seam, box edge or floor texture, with the "
             "location readout and minimap dot corroborating. ~1.5–3s. **Start looking only AFTER "
             "the cut into gameplay** — the minimap and ability bar appearing is the reliable tell "
             "that the demo has begun. **The STAND in your item is a PLACEHOLDER on most rows**: "
             "these titles name only the target, so the pipeline filled the stand with a copy of "
             "it. Read the REAL stand off VALORANT's own location label above the minimap and "
             "report it as a callout — that report is the only source for this field. If the "
             "readout is not legible in any frame of the stand window, say so explicitly rather "
             "than echoing the target back."),
            ("- **AIM** =",
             "- **AIM** = the view SETTLED, bow drawn, **charge and bounce set**, crosshair parked "
             "on the alignment reference, immediately pre-release. On Abyss the map has no ground "
             "beyond its edges, so the reference is usually architectural — a rooftop tip, an "
             "antenna, a platform corner, a skybox seam — rather than terrain. ~0.6–1.2s. If the "
             "aim is panned or corrected before the loose, the AIM is the FINAL settled aim "
             "immediately before release, never one it passes through on the way."),
            ("Sides = **Attacker / Defender**",
             "- Use the callouts below rather than fixture slugs. **Do NOT report a SIDE.** It is "
             "already resolved upstream from the second line of the author's own title plate "
             "(`Attacker Recon` / `Defender Recon`) and is deliberately absent from your item. The "
             "three `Double Shocks` plates carry NO side word, and those rows were resolved from "
             "the shipped corpus instead — nothing about that needs anything from you. The "
             "practice server spawns the demo player attacker-side regardless, so spawn-side cues "
             "are not evidence."),
        ],
    },
}
