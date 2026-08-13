// MGA lineup localize+gate for GROUPED-CHAPTER sources.
//
// The original mga-lineup-localize assumes 1 chapter == 1 lineup, which held for the
// Sova/Fade/Brimstone sources. Sentinel sources (cypher, killjoy, ...) are usually
// filmed as "Ascent B Trips" - one 30s chapter containing 2-4 separate placements.
// Forcing those through the 1:1 workflow silently drops every placement but the first.
//
// This adds a SURVEY stage in front: one agent enumerates the distinct placements in a
// chapter and returns a tight sub-window for each; every placement then goes through the
// SAME localize -> gate -> reloc -> regate path as before, unchanged. `cs` is not the
// chapter start - ingest_agent.py defines it as floor(STAND.start), unique per lineup -
// so several lineups from one chapter is already a legal pack shape.
//
// Launch with:
//   Workflow({ scriptPath: '<this file>', args: {
//     map, video, instr,
//     items: [{ nn, cs, next, ability, name, placed?, varNote?, varNoteAdd? }],
//     locModel?, locEffort?, gateModel?, gateEffort?, surveyModel?, surveyEffort?,
//     maxPerChapter?,        // safety cap, default 6
//   } })
export const meta = {
  name: 'mga-lineup-localize-multi',
  description: 'Survey grouped chapters into N placements, then localize + adversarially gate each one',
  whenToUse: 'MGA lineup batches where one chapter contains several placements (sentinel sources: cypher, killjoy, deadlock)',
  phases: [{ title: 'Survey' }, { title: 'Localize' }, { title: 'Verify' }],
}

const EMBEDDED = {
 "map": "multi",
 "video": "UsfCu5uL3Qs",
 "instr": "C:\\Users\\jason\\Documents\\Git\\MyFreeApps-worktrees\\mga-cypher\\apps\\mygamingassistant\\backend\\scripts\\LOCALIZE_INSTRUCTIONS_CYPHER.md",
 "surveyModel": "opus",
 "surveyEffort": "high",
 "locModel": "opus",
 "locEffort": "high",
 "gateModel": "opus",
 "gateEffort": "high",
 "maxPerChapter": 6,
 "varNote": "Cypher setups guide by 'spawns'. Chapter titles are OFFSET on this source - a chapter can open on the tail of the previous one, so call the ability from the footage, not the title.",
 "items": [
  {
   "nn": "11",
   "cs": 380,
   "next": 428,
   "ability": "spycam",
   "name": "Bind B Cams",
   "map": "bind"
  },
  {
   "nn": "12",
   "cs": 428,
   "next": 457,
   "ability": "cyber-cage",
   "name": "Bind B Cages",
   "map": "bind"
  },
  {
   "nn": "13",
   "cs": 457,
   "next": 473,
   "ability": "trapwire",
   "name": "Bind B Trips",
   "map": "bind"
  },
  {
   "nn": "14",
   "cs": 473,
   "next": 500,
   "ability": "spycam",
   "name": "Bind A Cams",
   "map": "bind"
  },
  {
   "nn": "15",
   "cs": 500,
   "next": 527,
   "ability": "cyber-cage",
   "name": "Bind A Cages",
   "map": "bind"
  },
  {
   "nn": "16",
   "cs": 527,
   "next": 550,
   "ability": "trapwire",
   "name": "Bind A Trips",
   "map": "bind"
  },
  {
   "nn": "21",
   "cs": 730,
   "next": 746,
   "ability": "spycam",
   "name": "Breeze B Cams",
   "map": "breeze"
  },
  {
   "nn": "22",
   "cs": 746,
   "next": 771,
   "ability": "cyber-cage",
   "name": "Breeze B Cages",
   "map": "breeze"
  },
  {
   "nn": "23",
   "cs": 771,
   "next": 792,
   "ability": "trapwire",
   "name": "Breeze B Trips",
   "map": "breeze"
  },
  {
   "nn": "24",
   "cs": 792,
   "next": 808,
   "ability": "spycam",
   "name": "Breeze A Cams",
   "map": "breeze"
  },
  {
   "nn": "25",
   "cs": 808,
   "next": 832,
   "ability": "cyber-cage",
   "name": "Breeze A Cages",
   "map": "breeze"
  },
  {
   "nn": "26",
   "cs": 832,
   "next": 850,
   "ability": "trapwire",
   "name": "Breeze A Trips",
   "map": "breeze"
  },
  {
   "nn": "32",
   "cs": 1010,
   "next": 1033,
   "ability": "spycam",
   "name": "Haven A Cams",
   "map": "haven"
  },
  {
   "nn": "33",
   "cs": 1033,
   "next": 1041,
   "ability": "cyber-cage",
   "name": "Haven A Cages",
   "map": "haven"
  },
  {
   "nn": "34",
   "cs": 1041,
   "next": 1057,
   "ability": "trapwire",
   "name": "Haven A Trips",
   "map": "haven"
  },
  {
   "nn": "35",
   "cs": 1057,
   "next": 1068,
   "ability": "spycam",
   "name": "Haven C Cams",
   "map": "haven"
  },
  {
   "nn": "36",
   "cs": 1068,
   "next": 1093,
   "ability": "cyber-cage",
   "name": "Haven C Cages",
   "map": "haven"
  },
  {
   "nn": "37",
   "cs": 1093,
   "next": 1108,
   "ability": "trapwire",
   "name": "Haven C Trips",
   "map": "haven"
  },
  {
   "nn": "38",
   "cs": 1108,
   "next": 1149,
   "ability": "spycam",
   "name": "Haven Garage Util",
   "map": "haven",
   "varNoteAdd": "MIXED-ability chapter: it demonstrates cams, trips and cages together. Call EACH placement's ability from what is deployed on screen; the nominal ability on this item is only a placeholder."
  },
  {
   "nn": "39",
   "cs": 1149,
   "next": 1169,
   "ability": "spycam",
   "name": "Haven B Util",
   "map": "haven",
   "varNoteAdd": "MIXED-ability chapter: it demonstrates cams, trips and cages together. Call EACH placement's ability from what is deployed on screen; the nominal ability on this item is only a placeholder."
  }
 ]
}

let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { A = {} } }
if (!A || typeof A !== 'object') A = {}
if (!A.items || !A.items.length) A = EMBEDDED
const VIDEO = A.video, INSTR = A.instr, MAP = A.map || 'map'
const MAX_PER_CHAPTER = A.maxPerChapter || 6

// `map` may be set per item so one run can cover several maps (the callout
// vocabulary an agent needs is per-map, so it must reach the prompt).
const ITEMS = (A.items || []).map((it) => {
  const base = it.varNote || A.varNote || ''
  const note = it.varNoteAdd ? (base ? base + ' ' + it.varNoteAdd : it.varNoteAdd) : base
  return Object.assign({}, it, { varNote: note, map: it.map || MAP })
})
if (!ITEMS.length) {
  return { error: 'no items received', argsType: typeof args, argsPreview: String(args).slice(0, 200) }
}

const SURVEY_MODEL = A.surveyModel || 'sonnet'
const SURVEY_EFFORT = A.surveyEffort || 'medium'
const LOC_MODEL = A.locModel || 'sonnet'
const LOC_EFFORT = A.locEffort || 'medium'
const GATE_MODEL = A.gateModel || 'opus'
const GATE_EFFORT = A.gateEffort || 'high'

const PLACED_ABILITIES = new Set(['trapwire', 'spycam', 'alarmbot', 'turret', 'trademark', 'sonic-sensor'])
const isPlaced = (it) => (typeof it.placed === 'boolean' ? it.placed : PLACED_ABILITIES.has(it.ability))

const SPAN = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }
const LOC_PROPS = {
  stand: SPAN, aim: SPAN, 'throw': SPAN, landing: SPAN,
  ability: { type: 'string' }, charge: { type: 'string' }, bounces: { type: 'string' }, technique: { type: 'string' },
  target: { type: 'string' }, stand_loc: { type: 'string' }, side: { type: 'string' },
  confidence: { type: 'string' }, weakest: { type: 'string' }, notes: { type: 'string' }, card_path: { type: 'string' },
}
const LOC_REQ = ['stand', 'aim', 'landing', 'ability', 'target', 'stand_loc', 'side', 'confidence', 'weakest', 'notes', 'card_path']
const locSchema = (it) => ({
  type: 'object',
  properties: LOC_PROPS,
  required: isPlaced(it) ? LOC_REQ : LOC_REQ.concat(['throw']),
})
const VERDICT_SCHEMA = {
  type: 'object',
  properties: { pass: { type: 'boolean' }, failed_events: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' } },
  required: ['pass', 'reason'],
}
const SURVEY_SCHEMA = {
  type: 'object',
  properties: {
    placements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          t0: { type: 'number' }, t1: { type: 'number' },
          ability: { type: 'string' },
          what: { type: 'string' },
          caption: { type: 'string' },
          aligned: { type: 'boolean' },
          complete: { type: 'boolean' },
        },
        required: ['t0', 't1', 'ability', 'what', 'caption', 'aligned', 'complete'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['placements', 'notes'],
}

const f = (s) => s[0] + ' ' + s[1]

function surveyPrompt(it) {
  const vn = it.varNote ? `\nNOTE: ${it.varNote}` : ''
  return `You are a VALORANT lineup SURVEY subagent for MGA. You are NOT localizing anything precisely - you are producing an INVENTORY so that later agents each get one placement.

Video ${VIDEO}, map ${it.map}. Chapter NN=${it.nn} titled "${it.name || ''}", window [${it.cs}, ${it.next}].${vn}

This source groups several separate utility placements into ONE chapter (e.g. a "Trips" chapter demonstrates 2-4 different tripwire spots back to back). Your job: watch the chapter and enumerate EVERY DISTINCT placement it contains.

Method: a single COARSE pass is enough - frame_study.py --video ${VIDEO} --t0 ${it.cs} --t1 ${it.next} --step 0.5 --label ${it.map}-${it.nn}-survey, then montage_study.py to read it as a grid. Use the PowerShell tool. Read the montage and identify the shot boundaries: each placement typically runs walk-to-spot -> aim at surface -> deploy -> brief look at the result, then cuts to the next spot.

READ THE ON-SCREEN CAPTIONS. This creator burns a caption into the footage for each placement ("Different early B main info cam", "Crouch + lineup with crosshair", "Just solid cages for playing backsite, no lineup"). They name the spot and state the intent, and they are the best evidence available. Transcribe them verbatim.

For EACH distinct placement return: t0/t1 = a GENEROUS sub-window (absolute seconds) that fully contains that placement's stand+aim+deploy, padded ~1s on each side and allowed to overlap its neighbours slightly; ability = one of trapwire, spycam, cyber-cage, called from WHAT IS ACTUALLY DEPLOYED, not from the chapter title (a thin beam strung across a gap with a small dark anchor disc = trapwire; a small camera stuck to a surface = spycam; a thrown device that blooms into a translucent cage box = cyber-cage); what = a one-line description of the spot; caption = the on-screen caption verbatim, or "" if none; aligned = whether this is an ALIGNED lineup (a deliberate stand spot + a crosshair/alignment reference, as in "lineup with crosshair") rather than a freehand close-range drop - the creator often says which; complete = whether the chapter actually SHOWS the full stand->aim->deploy for it (false if it only shows the result, or cuts away mid-placement).

Rules:
- CHAPTER BOUNDARIES ARE OFFSET on this source - a "Cages" chapter can open on the tail of the previous chapter's cam. Trust the footage, never the title, when calling the ability.
- To avoid double-counting across that offset, report a placement ONLY if its DEPLOY moment falls inside your window. A placement whose deploy happens before ${it.cs} belongs to the previous chapter's agent.
- Report placements that are genuinely DIFFERENT spots. The same placement re-shown from another angle, or reviewed afterwards from the camera's own remote view, is ONE placement, not two.
- Set complete=false rather than inventing a window - incomplete ones get dropped, and that is the correct outcome.
- Do NOT localize precisely, do NOT build verify cards, do NOT run recut, do NOT edit repo files.
- Cap: at most ${MAX_PER_CHAPTER}. If the chapter genuinely has more, return the ${MAX_PER_CHAPTER} clearest and say so in notes.
- Disk hygiene: Remove-Item -Recurse -Force your frame-dump + montage dirs under mga-frame-study before returning.

Return via StructuredOutput: placements[] and notes.`
}

function locPrompt(it, fb) {
  const label = it.map + '-' + it.nn + (fb ? '-r2' : '')
  const fbb = fb ? `\n\nA PRIOR ATTEMPT FAILED the gate (events: ${(fb.failed_events || []).join(',') || '?'}; reason: ${fb.reason || '?'}). Re-localize honestly - don't resubmit the same spans.` : ''
  const vn = it.varNote ? `\nNOTE: ${it.varNote}` : ''
  const placed = isPlaced(it)
  const mode = placed
    ? `\n\n*** PLACED UTILITY - 3 EVENTS ONLY ***\n${it.ability} is MOUNTED at the player's own position: it never leaves the hands and nothing is ever in flight. There is NO THROW event. The instructions file describes 4 events - for THIS lineup, ignore its THROW section entirely.\nLocalize exactly THREE: STAND, AIM, LANDING, where LANDING = the moment the device is DEPLOYED and visible in place (trapwire beam strung across the gap, camera stuck to the surface and active). Do NOT return a 'throw' span. Do NOT invent one, do NOT copy AIM into it, do NOT return a zero-length placeholder. Omitting it is the correct and expected answer; a fabricated throw span is a hard failure.`
    : ''
  const beats = placed ? 'all 3 events' : 'all 4 events'
  const pin = placed ? 'the DEPLOY instant pinned at 60fps' : 'THROW release pinned at 60fps'
  const ret = placed ? 'stand/aim/landing=[start,end] abs seconds (NO throw)' : 'stand/aim/throw/landing=[start,end] abs seconds'
  const cap = it.caption ? `\nThe creator's own on-screen caption for it reads: "${it.caption}" - treat that as the best available statement of what this spot is for, and carry it into NOTES.` : ''
  const scoped = `\n\n*** SCOPED SUB-WINDOW ***\nThis chapter contains several separate placements. YOURS is only: "${it.what}" inside [${it.cs}, ${it.next}]. Other placements appear before/after that window - localize ONLY yours and ignore the neighbours entirely. If your window turns out to contain no complete placement, say so in WEAKEST with low confidence rather than localizing a neighbour's.${cap}\nThe ability below came from a survey pass reading the footage, not from the chapter title (titles on this source are offset and unreliable). CONFIRM it against what you see deployed and correct it in your return if it disagrees.`
  return `You are a VALORANT lineup-localization subagent for MGA. FIRST read this instructions file COMPLETELY and follow it (tooling, the events, mode-invariance, honesty contract): ${INSTR}\nIt points to a domain reference (valorant-lineup-expert.md) - read that too.\n\nYOUR LINEUP: NN=${it.nn} name="${it.name || ''}" window [${it.cs}, ${it.next}] ability=${it.ability} on video ${VIDEO} (map ${it.map}). Use label prefix ${label} for ALL frame_study/montage/verify_events labels.${vn}${scoped}${mode}\n\nLocalize ${beats} by DENSE frame study (${pin}, --step 0). Build the verify_events CARD (--video ${VIDEO} --label ${label}) and READ it yourself; if a strip mismatches its event, re-localize before returning. Do NOT run recut_lineup_clips.py, do NOT edit repo files. Disk hygiene: Remove-Item -Recurse -Force your frame-dump + montage dirs under mga-frame-study before returning, KEEP verify-cards.${fbb}\n\nReturn via StructuredOutput: ${ret}; ability; charge; bounces; technique; target+stand_loc (callouts); side; confidence; weakest; notes; card_path (absolute path to the CARD png).`
}

function gatePrompt(it, loc) {
  if (isPlaced(it)) {
    const dep = it.ability === 'trapwire'
      ? 'the tripwire STRUNG - the beam/wire spans the gap and its anchor is stuck to the surface (a wire still in hand or a bare aiming reticle = FAIL).'
      : (it.ability === 'spycam'
        ? 'the camera MOUNTED - stuck to the wall/surface and active (lens glow / placement confirmation), not merely aimed at the spot.'
        : 'the device DEPLOYED and visible in place at the destination - not merely aimed at the spot.')
    return `INDEPENDENT ADVERSARIAL gate for a lineup localization (MGA). Judge ONLY what you SEE in the card; default FAIL when uncertain (a wrong PASS ships a bad clip).\nLineup ${it.map}-${it.nn} ability ${it.ability}, window [${it.cs},${it.next}] video ${VIDEO}. This window is ONE placement out of several in its chapter: "${it.what}".\nThis is PLACED utility - mounted at the player's own position, never in flight, so there are THREE events and NO THROW. Claimed: STAND ${f(loc.stand)} | AIM ${f(loc.aim)} | LANDING ${f(loc.landing)}.\nRead this card: ${loc.card_path}\nIf missing/unreadable -> pass=false, reason="card missing". Strips top->bottom: STAND, AIM, LANDING.\nPASS needs ALL: STAND stable at the spot (title-card overlay OK); AIM settled on the placement surface / alignment reference; LANDING ${dep}; no editor-overlay-only evidence; spans within/near the window with positive length.\nALSO FAIL if the localizer returned a 'throw' span at all - placed utility has no throw beat, so any value there is fabricated. It returned: ${loc['throw'] ? f(loc['throw']) : 'none (correct)'}.\nReturn pass (bool), failed_events (subset stand/aim/landing), reason (cite what you saw).`
  }
  return `INDEPENDENT ADVERSARIAL gate for a lineup localization (MGA). Judge ONLY what you SEE in the card; default FAIL when uncertain (a wrong PASS ships a bad clip).\nLineup ${it.map}-${it.nn} ability ${it.ability}, window [${it.cs},${it.next}] video ${VIDEO}. This window is ONE placement out of several in its chapter: "${it.what}".\nClaimed: STAND ${f(loc.stand)} | AIM ${f(loc.aim)} | THROW ${f(loc['throw'])} | LANDING ${f(loc.landing)}.\nRead this card: ${loc.card_path}\nIf missing/unreadable -> pass=false, reason="card missing". Strips top->bottom: STAND, AIM, THROW, LANDING.\nPASS needs ALL: STAND stable at the spot; AIM settled on an alignment reference; THROW the actual RELEASE visible (the cage leaves the hand with its trail - a held cage with NO release = FAIL); LANDING the cyber-cage DEPLOYED at the destination (it lands, then blooms into its cage/smoke box - the bloom, not the mid-air object); no editor-overlay-only evidence; spans within/near the window with positive length.\nReturn pass (bool), failed_events (subset stand/aim/throw/landing), reason (cite what you saw).`
}

log(`${MAP}: surveying ${ITEMS.length} grouped chapters (video ${VIDEO}; survey=${SURVEY_MODEL}/${SURVEY_EFFORT}, loc=${LOC_MODEL}/${LOC_EFFORT}, gate=${GATE_MODEL}/${GATE_EFFORT})`)

const perChapter = await pipeline(
  ITEMS,
  (it) => agent(surveyPrompt(it), { label: 'survey:' + it.nn, phase: 'Survey', schema: SURVEY_SCHEMA, model: SURVEY_MODEL, effort: SURVEY_EFFORT }),
  async (sv, it) => {
    if (!sv || !Array.isArray(sv.placements)) return { item: it, status: 'SURVEY_DIED', results: [] }
    const usable = sv.placements.filter((p) => p && p.complete && p.t1 > p.t0).slice(0, MAX_PER_CHAPTER)
    const dropped = sv.placements.length - usable.length
    if (!usable.length) return { item: it, survey: sv, status: 'NO_COMPLETE_PLACEMENTS', results: [] }

    const subs = usable.map((p, i) => Object.assign({}, it, {
      nn: it.nn + String.fromCharCode(97 + i),   // 03 -> 03a, 03b, ...
      cs: p.t0,
      next: p.t1,
      ability: p.ability || it.ability,
      what: p.what,
      caption: p.caption || '',
      aligned: p.aligned !== false,
      name: (it.name || '') + ' - ' + p.what,
    }))

    const out = await parallel(subs.map((sit) => async () => {
      const loc = await agent(locPrompt(sit, null), { label: 'loc:' + sit.nn, phase: 'Localize', schema: locSchema(sit), model: LOC_MODEL, effort: LOC_EFFORT })
      if (!loc) return { item: sit, status: 'LOCALIZE_DIED' }
      const v = await agent(gatePrompt(sit, loc), { label: 'gate:' + sit.nn, phase: 'Verify', schema: VERDICT_SCHEMA, model: GATE_MODEL, effort: GATE_EFFORT })
      if (v && v.pass) return { item: sit, loc, verdict: v, status: 'GATE_PASSED' }
      const re = await agent(locPrompt(sit, v || { reason: 'gate died' }), { label: 'reloc:' + sit.nn, phase: 'Localize', schema: locSchema(sit), model: LOC_MODEL, effort: LOC_EFFORT })
      if (!re) return { item: sit, loc, verdict: v, status: 'FAILED_GATE' }
      const v2 = await agent(gatePrompt(sit, re), { label: 'regate:' + sit.nn, phase: 'Verify', schema: VERDICT_SCHEMA, model: GATE_MODEL, effort: GATE_EFFORT })
      if (v2 && v2.pass) return { item: sit, loc: re, verdict: v2, status: 'GATE_PASSED' }
      return { item: sit, loc: re, verdict: v2 || v, status: 'FAILED_GATE' }
    }))

    return { item: it, survey: sv, droppedIncomplete: dropped, status: 'OK', results: out.filter(Boolean) }
  }
)

const chapters = perChapter.filter(Boolean)
const results = chapters.flatMap((c) => c.results || [])
const passed = results.filter((r) => r.status === 'GATE_PASSED').length
const droppedIncomplete = chapters.reduce((n, c) => n + (c.droppedIncomplete || 0), 0)
const emptyChapters = chapters.filter((c) => c.status !== 'OK').map((c) => ({ nn: c.item.nn, name: c.item.name, status: c.status }))
if (droppedIncomplete) log(`${MAP}: dropped ${droppedIncomplete} placement(s) the survey marked incomplete`)
if (emptyChapters.length) log(`${MAP}: ${emptyChapters.length} chapter(s) yielded nothing: ${emptyChapters.map((c) => c.nn).join(',')}`)
log(`${MAP} done: ${ITEMS.length} chapters -> ${results.length} placements, ${passed} gate-passed`)
return { recutCount: 0, map: MAP, chapters: ITEMS.length, placements: results.length, passed, droppedIncomplete, emptyChapters, results }
