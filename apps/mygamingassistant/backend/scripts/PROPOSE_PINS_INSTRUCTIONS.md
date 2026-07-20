# Propose Pins — vision localizer instructions

You place minimap STAND and TARGET pins for Valorant/CS2 lineups. Given a lineup's
STAND frame (and LANDING frame) plus our reference minimap, output normalized
`(x, y)` in `[0,1]` on the REFERENCE minimap for where the player STANDS and where
the utility LANDS. A human will nudge your pins, so "in the right room" is success;
"wrong site/zone" is failure.

This is the automated arm of `propose_pins.py`: read `<map>-pin-requests.json`,
process each request, write `<map>-pin-proposals.json`. Fan out over the requests
(one localizer per lineup, or small batches) the same way the `mga-lineup-localize`
workflow fans out.

## Coordinate convention (reference minimap)

`x=0` left edge, `x=1` right edge; `y=0` top edge, `y=1` bottom edge. Always read
the specific `reference_minimap` image named in the requests file FIRST and orient
yourself against its landmarks (the two bomb-site squares, mid, the attacker/
defender approaches) before placing any pin.

## Signals, in priority order

1. **On-screen callout text + environmental landmarks** — STRONGEST. "A Lobby",
   "Mid Top 5m", "B Market", named shops (gelato/La Crusca = Ascent A Main; Mercato
   Del Pesce = Ascent B Market). These pin the room directly.
2. **The stated zone** (`stand_zone_slug` / `target_zone_slug`) is a HARD PRIOR —
   your pin MUST land inside or immediately adjacent to that zone on the reference.
3. **The in-game minimap** (faint, top-left of the frame; small yellow/green player
   marker) — use for ROUGH position only. It is player-rotated / fixed-orientation
   and does NOT match the reference's rotation, so never copy its coordinates
   directly; cross-check it against 1 and 2.

## STAND vs TARGET

- **STAND** — where the player is standing when they throw. Strong signal (player
  marker + callout). Set `confidence` high/med.
- **TARGET** — where the utility LANDS. The in-game minimap does NOT mark the
  landing, so infer from the LANDING frame's visible location + the `target_zone`.
  This is inherently weaker — set `confidence` "low" unless the landing spot is
  unambiguous. The operator scrutinizes low-confidence targets harder.

## Output

Append one object per lineup to the proposals array:

```json
{
  "lineup_id": "<verbatim from the request>",
  "stand":  {"x": 0.xx, "y": 0.yy, "confidence": "high|med|low", "reasoning": "one sentence"},
  "target": {"x": 0.xx, "y": 0.yy, "confidence": "high|med|low", "reasoning": "one sentence"}
}
```

Omit `target` (or set it null) only if the LANDING frame is missing or the landing
is genuinely unlocatable — better no target pin than a wrong-zone one. Keep
`lineup_id` verbatim so `propose_pins.py apply` can match it back to the pack.

## After proposals exist

`python scripts/propose_pins.py apply --map <map> --proposals <map>-pin-proposals.json`
writes the anchors into `data/lineup_library.json`. Then import locally and
eyeball/nudge every pin in MinimapPinEditor before shipping — the operator's local
review is the mandatory gate (see the verify-lineups-locally rule). Render a QA
overlay first with `propose_pins.py render`.
