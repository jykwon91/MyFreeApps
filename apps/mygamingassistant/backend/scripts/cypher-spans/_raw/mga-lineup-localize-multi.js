// MGA lineup localize+gate for GROUPED-CHAPTER sources.
//
// The original mga-lineup-localize assumes 1 chapter == 1 lineup, which held for the
// Sova/Fade/Brimstone sources. Sentinel sources (cypher, killjoy, ...) are usually
// filmed as "Ascent B Trips" -- one 30s chapter containing 2-4 separate placements.
// Forcing those through the 1:1 workflow silently drops every placement but the first.
//
// This adds a SURVEY stage in front: one agent enumerates the distinct placements in a
// chapter and returns a tight sub-window for each; every placement then goes through the
// SAME localize -> gate -> reloc -> regate path as before, unchanged. `cs` is not the
// chapter start -- ingest_agent.py defines it as floor(STAND.start), unique per lineup --
// so several lineups from one chapter is already a legal pack shape.
//
// Launch with:
//   Workflow({ scriptPath: '<this file>', args: {
//     map, video, instr,
//     items: [{ nn, cs, next, ability, name, placed?, varNote?, varNoteAdd? }],
//     locModel?, locEffort?, gateModel?, gateEffort?, surveyModel?, surveyEffort?,
//     maxPerChapter?,        // safety cap, default 6
//     surveyed?,             // true: items are placements from a prior run -- skip the survey
//   } })
export const meta = {
  name: 'mga-lineup-localize-multi',
  description: 'Survey grouped chapters into N placements, then localize + adversarially gate each one',
  whenToUse: 'MGA lineup batches where one chapter contains several placements (sentinel sources: cypher, killjoy, deadlock)',
  phases: [{ title: 'Survey' }, { title: 'Localize' }, { title: 'Verify' }],
}

let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { A = {} } }
if (!A || typeof A !== 'object') A = {}
const VIDEO = A.video, INSTR = A.instr, MAP = A.map || 'map'
const MAX_PER_CHAPTER = A.maxPerChapter || 6
// Whether the source burns a caption over each placement. spawns' Cypher guide does, and the
// survey prompt used to state that as a fact about every source. ItsFlameBTW's Abyss guide
// burns nothing onto the frame, and a survey agent told the captions are 'the best evidence
// available' will reach for a HUD string or an editor flourish and transcribe that instead.
// Pass captions:false for a source with none.
const CAPTIONS = A.captions !== false

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

// The ability VOCABULARY is per AGENT, not per pipeline. The survey and gate prompts named
// Cypher's three abilities as literals, so aiming this workflow at Killjoy (which the header
// has always advertised) would have told every survey agent to call each placement one of
// trapwire/spycam/cyber-cage -- none of which Killjoy has. Pass `abilities` as
// slug -> { survey, landing, release? }:
//   survey  -- how the DEPLOYED object looks, for the survey's "call it from what is deployed" list
//   landing -- what the LANDING beat must show, quoted to both the localizer and the gate
//   release -- thrown abilities only: what the THROW beat must show
// Omitted, this falls back to Cypher's set, so existing Cypher args files run unchanged.
const CYPHER_ABILITIES = {
  'trapwire': {
    survey: 'a thin beam strung across a gap with a small dark anchor disc = trapwire',
    landing: 'the tripwire STRUNG -- the beam/wire spans the gap and its anchor is stuck to the surface (a wire still in hand or a bare aiming reticle = FAIL).',
  },
  'spycam': {
    survey: 'a small camera stuck to a surface = spycam',
    landing: 'the camera MOUNTED -- stuck to the wall/surface and active (lens glow / placement confirmation), not merely aimed at the spot.',
  },
  'cyber-cage': {
    survey: 'a thrown device that blooms into a translucent cage box = cyber-cage',
    landing: 'the cyber-cage DEPLOYED at the destination (it lands, then blooms into its cage/smoke box -- the bloom, not the mid-air object)',
    release: 'the cage leaves the hand with its trail -- a held cage with NO release = FAIL',
  },
}
const ABILITIES = A.abilities || CYPHER_ABILITIES
const ABIL_SLUGS = Object.keys(ABILITIES)
const ABIL_LIST = ABIL_SLUGS.join(', ')
const ABIL_DESCR = ABIL_SLUGS.map((k) => ABILITIES[k].survey).filter(Boolean).join('; ')
const GENERIC_LANDING = 'the device DEPLOYED and visible in place at the destination -- not merely aimed at the spot.'
const landingOf = (ab) => (ABILITIES[ab] && ABILITIES[ab].landing) || GENERIC_LANDING
const releaseOf = (ab) => (ABILITIES[ab] && ABILITIES[ab].release)
  || 'the device actually LEAVES THE HAND into its arc -- a held device with NO release = FAIL'
// Every PLACED landing in this agent's vocabulary, for the localize prompt: an agent that has to
// correct a misread ability still needs to know what the right one looks like deployed.
const PLACED_LANDINGS = ABIL_SLUGS.filter((k) => PLACED_ABILITIES.has(k))
  .map((k) => ABILITIES[k].landing).filter(Boolean).join(' / ') || GENERIC_LANDING

// These three sentences describe the SOURCE's editing, not the pipeline, and were written from
// spawns' Cypher guide. A source whose chapter titles name no ability at all needs to say so.
const GROUP_NOTE = A.groupNote || `This source groups several separate utility placements into ONE chapter (e.g. a "Trips" chapter demonstrates 2-4 different tripwire spots back to back).`
const TITLE_NOTE = A.titleNote || `CHAPTER BOUNDARIES ARE OFFSET on this source -- a "Cages" chapter can open on the tail of the previous chapter's cam. Trust the footage, never the title, when calling the ability.`
const TITLE_SHORT = A.titleShort || `titles on this source are offset and unreliable`
const CAPTION_EXAMPLES = A.captionExamples || `"Different early B main info cam", "Crouch + lineup with crosshair", "Just solid cages for playing backsite, no lineup"`

const SPAN = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }
const LOC_PROPS = {
  stand: SPAN, aim: SPAN, 'throw': SPAN, landing: SPAN,
  ability: { type: 'string', enum: ABIL_SLUGS }, charge: { type: 'string' }, bounces: { type: 'string' }, technique: { type: 'string' },
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
          // A closed set, enforced by the schema rather than asked for in the prose. The prompt
          // already said "one of ..." and a Killjoy survey still returned Gekko's `mosh_pit` for a
          // whole chapter after misreading the HUD -- an instruction is not a constraint.
          ability: { type: 'string', enum: ABIL_SLUGS },
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
  return `You are a VALORANT lineup SURVEY subagent for MGA. You are NOT localizing anything precisely -- you are producing an INVENTORY so that later agents each get one placement.

Video ${VIDEO}, map ${it.map}. Chapter NN=${it.nn} titled "${it.name || ''}", window [${it.cs}, ${it.next}].${vn}

${GROUP_NOTE} Your job: watch the chapter and enumerate EVERY DISTINCT placement it contains.

Method: a single COARSE pass is enough -- frame_study.py --video ${VIDEO} --t0 ${it.cs} --t1 ${it.next} --step 0.5 --label ${it.map}-${it.nn}-survey, then montage_study.py to read it as a grid. Use the PowerShell tool. Read the montage and identify the shot boundaries: each placement typically runs walk-to-spot -> aim at surface -> deploy -> brief look at the result, then cuts to the next spot.

${CAPTIONS ? `READ THE ON-SCREEN CAPTIONS. This creator burns a caption into the footage for each placement (${CAPTION_EXAMPLES}). They name the spot and state the intent, and they are the best evidence available. Transcribe them verbatim.` : `THIS SOURCE HAS NO ON-SCREEN CAPTIONS, no chapter title plates and no drawn marks. Return caption:"" for every placement. Do not transcribe a HUD string, a location readout or an editor flourish as though it were a caption -- there is nothing to quote, and an invented one becomes the next agent's "best available statement" of what the spot is for.`}

For EACH distinct placement return: t0/t1 = a GENEROUS sub-window (absolute seconds) that fully contains that placement's stand+aim+deploy, padded ~1s on each side and allowed to overlap its neighbours slightly; ability = one of ${ABIL_LIST}, called from WHAT IS ACTUALLY DEPLOYED, not from the chapter title (${ABIL_DESCR}); what = a one-line description of the spot; caption = ${CAPTIONS ? 'the on-screen caption verbatim, or "" if none' : '"" (this source has none)'}; aligned = whether this is an ALIGNED lineup (a deliberate stand spot + a crosshair/alignment reference, as in "lineup with crosshair") rather than a freehand close-range drop -- the creator often says which; complete = whether the chapter actually SHOWS the full stand->aim->deploy for it (false if it only shows the result, or cuts away mid-placement).

Rules:
- ${TITLE_NOTE}
- To avoid double-counting across that offset, report a placement ONLY if its DEPLOY moment falls inside your window. A placement whose deploy happens before ${it.cs} belongs to the previous chapter's agent.
- Report placements that are genuinely DIFFERENT spots. The same placement re-shown from another angle, or reviewed afterwards from the camera's own remote view, is ONE placement, not two.
- Set complete=false rather than inventing a window -- incomplete ones get dropped, and that is the correct outcome.
- Do NOT localize precisely, do NOT build verify cards, do NOT run recut, do NOT edit repo files.
- Cap: at most ${MAX_PER_CHAPTER}. If the chapter genuinely has more, return the ${MAX_PER_CHAPTER} clearest and say so in notes.
- Disk hygiene: Remove-Item -Recurse -Force your frame-dump + montage dirs under mga-frame-study before returning.

Return via StructuredOutput: placements[] and notes.`
}

function locPrompt(it, fb) {
  const label = it.map + '-' + it.nn + (fb ? '-r2' : '')
  const fbb = fb ? `\n\nA PRIOR ATTEMPT FAILED the gate (events: ${(fb.failed_events || []).join(',') || '?'}; reason: ${fb.reason || '?'}). Re-localize honestly -- don't resubmit the same spans.` : ''
  const vn = it.varNote ? `\nNOTE: ${it.varNote}` : ''
  const placed = isPlaced(it)
  const mode = placed
    ? `\n\n*** PLACED UTILITY -- 3 EVENTS ONLY ***\n${it.ability} is DEPLOYED at the surface under the crosshair rather than thrown: there is no projectile, no arc and no release, so there is NO THROW event. (An EQUIP animation may briefly flip the device up out of the hand before the aim -- that is an equip, not a release, and it is not a THROW.) The instructions file describes 4 events -- for THIS lineup, ignore its THROW section entirely.\nLocalize exactly THREE: STAND, AIM, LANDING, where LANDING = the moment the device is DEPLOYED and visible in place (${PLACED_LANDINGS}). Do NOT return a 'throw' span. Do NOT invent one, do NOT copy AIM into it, do NOT return a zero-length placeholder. Omitting it is the correct and expected answer; a fabricated throw span is a hard failure.`
    : ''
  const beats = placed ? 'all 3 events' : 'all 4 events'
  const pin = placed ? 'the DEPLOY instant pinned at 60fps' : 'THROW release pinned at 60fps'
  const ret = placed ? 'stand/aim/landing=[start,end] abs seconds (NO throw)' : 'stand/aim/throw/landing=[start,end] abs seconds'
  const cap = it.caption ? `\nThe creator's own on-screen caption for it reads: "${it.caption}" -- treat that as the best available statement of what this spot is for, and carry it into NOTES.` : ''
  const scoped = `\n\n*** SCOPED SUB-WINDOW ***\nThis chapter contains several separate placements. YOURS is only: "${it.what}" inside [${it.cs}, ${it.next}]. Other placements appear before/after that window -- localize ONLY yours and ignore the neighbours entirely. If your window turns out to contain no complete placement, say so in WEAKEST with low confidence rather than localizing a neighbour's.${cap}\nThe ability below came from a survey pass reading the footage, not from the chapter title (${TITLE_SHORT}). CONFIRM it against what you see deployed and correct it in your return if it disagrees.`
  return `You are a VALORANT lineup-localization subagent for MGA. FIRST read this instructions file COMPLETELY and follow it (tooling, the events, mode-invariance, honesty contract): ${INSTR}\nIt points to a domain reference (valorant-lineup-expert.md) -- read that too.\n\nYOUR LINEUP: NN=${it.nn} name="${it.name || ''}" window [${it.cs}, ${it.next}] ability=${it.ability} on video ${VIDEO} (map ${it.map}). Use label prefix ${label} for ALL frame_study/montage/verify_events labels.${vn}${scoped}${mode}\n\nLocalize ${beats} by DENSE frame study (${pin}, --step 0). Build the verify_events CARD (--video ${VIDEO} --label ${label}) and READ it yourself; if a strip mismatches its event, re-localize before returning. Do NOT run recut_lineup_clips.py, do NOT edit repo files. Disk hygiene: Remove-Item -Recurse -Force your frame-dump + montage dirs under mga-frame-study before returning, KEEP verify-cards.${fbb}\n\nReturn via StructuredOutput: ${ret}; ability; charge; bounces; technique; target+stand_loc (callouts); side; confidence; weakest; notes; card_path (absolute path to the CARD png).`
}

function gatePrompt(it, loc) {
  if (isPlaced(it)) {
    const dep = landingOf(it.ability)
    return `INDEPENDENT ADVERSARIAL gate for a lineup localization (MGA). Judge ONLY what you SEE in the card; default FAIL when uncertain (a wrong PASS ships a bad clip).\nLineup ${it.map}-${it.nn} ability ${it.ability}, window [${it.cs},${it.next}] video ${VIDEO}. This window is ONE placement out of several in its chapter: "${it.what}".\nThis is PLACED utility -- mounted at the player's own position, never in flight, so there are THREE events and NO THROW. Claimed: STAND ${f(loc.stand)} | AIM ${f(loc.aim)} | LANDING ${f(loc.landing)}.\nRead this card: ${loc.card_path}\nIf missing/unreadable -> pass=false, reason="card missing". Strips top->bottom: STAND, AIM, LANDING.\nPASS needs ALL: STAND stable at the spot (title-card overlay OK); AIM settled on the placement surface / alignment reference; LANDING ${dep}; no editor-overlay-only evidence; spans within/near the window with positive length.\nALSO FAIL if the localizer returned a 'throw' span at all -- placed utility has no throw beat, so any value there is fabricated. It returned: ${loc['throw'] ? f(loc['throw']) : 'none (correct)'}.\nReturn pass (bool), failed_events (subset stand/aim/landing), reason (cite what you saw).`
  }
  return `INDEPENDENT ADVERSARIAL gate for a lineup localization (MGA). Judge ONLY what you SEE in the card; default FAIL when uncertain (a wrong PASS ships a bad clip).\nLineup ${it.map}-${it.nn} ability ${it.ability}, window [${it.cs},${it.next}] video ${VIDEO}. This window is ONE placement out of several in its chapter: "${it.what}".\nClaimed: STAND ${f(loc.stand)} | AIM ${f(loc.aim)} | THROW ${f(loc['throw'])} | LANDING ${f(loc.landing)}.\nRead this card: ${loc.card_path}\nIf missing/unreadable -> pass=false, reason="card missing". Strips top->bottom: STAND, AIM, THROW, LANDING.\nPASS needs ALL: STAND stable at the spot; AIM settled on an alignment reference; THROW the actual RELEASE visible (${releaseOf(it.ability)}); LANDING ${landingOf(it.ability)}; no editor-overlay-only evidence; spans within/near the window with positive length.\nReturn pass (bool), failed_events (subset stand/aim/throw/landing), reason (cite what you saw).`
}

async function localizeAndGate(sit) {
  const loc = await agent(locPrompt(sit, null), { label: 'loc:' + sit.nn, phase: 'Localize', schema: locSchema(sit), model: LOC_MODEL, effort: LOC_EFFORT })
  if (!loc) return { item: sit, status: 'LOCALIZE_DIED' }
  const v = await agent(gatePrompt(sit, loc), { label: 'gate:' + sit.nn, phase: 'Verify', schema: VERDICT_SCHEMA, model: GATE_MODEL, effort: GATE_EFFORT })
  if (v && v.pass) return { item: sit, loc, verdict: v, status: 'GATE_PASSED' }
  const re = await agent(locPrompt(sit, v || { reason: 'gate died' }), { label: 'reloc:' + sit.nn, phase: 'Localize', schema: locSchema(sit), model: LOC_MODEL, effort: LOC_EFFORT })
  if (!re) return { item: sit, loc, verdict: v, status: 'FAILED_GATE' }
  const v2 = await agent(gatePrompt(sit, re), { label: 'regate:' + sit.nn, phase: 'Verify', schema: VERDICT_SCHEMA, model: GATE_MODEL, effort: GATE_EFFORT })
  if (v2 && v2.pass) return { item: sit, loc: re, verdict: v2, status: 'GATE_PASSED' }
  return { item: sit, loc: re, verdict: v2 || v, status: 'FAILED_GATE' }
}

// Retry mode: `items` are already-surveyed placements (the `item` of a prior run's results,
// with nn/cs/next/what set). A run cut short by a usage limit leaves placements that never
// got a verdict, and workflow resume only works inside the session that started it. Re-running
// their chapters would re-survey them into different sub-windows and duplicate the placements
// that already passed, so skip the survey and localize exactly the windows given.
if (A.surveyed) {
  log(`${MAP}: retrying ${ITEMS.length} surveyed placements (video ${VIDEO}; loc=${LOC_MODEL}/${LOC_EFFORT}, gate=${GATE_MODEL}/${GATE_EFFORT})`)
  const results = (await parallel(ITEMS.map((sit) => () => localizeAndGate(sit)))).filter(Boolean)
  const passed = results.filter((r) => r.status === 'GATE_PASSED').length
  log(`${MAP} retry done: ${results.length} placements, ${passed} gate-passed`)
  return { recutCount: 0, map: MAP, chapters: 0, placements: results.length, passed, droppedIncomplete: 0, emptyChapters: [], results }
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
      // Belt-and-braces behind the schema enum: an out-of-vocabulary call never reaches a
      // localizer as its starting ability; the chapter's fallback does, and the localizer is
      // still told to confirm or correct it from the footage.
      ability: ABIL_SLUGS.includes(p.ability) ? p.ability : it.ability,
      what: p.what,
      caption: p.caption || '',
      aligned: p.aligned !== false,
      name: (it.name || '') + ' -- ' + p.what,
    }))

    const out = await parallel(subs.map((sit) => () => localizeAndGate(sit)))

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
