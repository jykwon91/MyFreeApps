/**
 * Seeds fake, fictional demo data into a locally running MyJobHunter
 * instance so portfolio screenshots have something believable to show.
 *
 * Everything here is FAKE — a fictional user ("Alex Rivera"), fictional
 * companies, fictional job applications, and a resume-refinement session
 * run against a fictional resume. Nothing is real job-search data. This
 * script only ever talks to a LOCAL dev instance (default
 * http://localhost:5191) seeded into its own throwaway Postgres database
 * (portfolio_demo_mjh) — never a deployed environment.
 *
 * Idempotent: safe to run repeatedly. It detects the existing demo
 * account, companies (by name), applications (by company + role title),
 * events (by count already present on an application), the completed
 * resume-upload job, and the resume-refinement session (by source job id)
 * and only creates what's missing. The "advance the refinement session"
 * step (accept one proposal, try to trigger the hallucination guard on
 * another) only runs the FIRST time the session is created — a second run
 * detects the existing session and leaves its state untouched so the
 * on-screen demo state doesn't keep drifting forward on re-seed.
 *
 * Run from sites/landing:
 *   npx playwright test --config capture/playwright.config.ts --project=seed seed-mjh
 */
import { test as setup, expect, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { DEMO_EMAIL, DEMO_NAME, DEMO_PASSWORD } from "./fixtures/demo-user";
import { markEmailVerified, psql } from "./local-db";
import { applications, type ApplicationFixture, type EventFixture } from "./fixtures/mjh/applications";

const BASE_URL = process.env.MJH_URL ?? "http://localhost:5191";
const API = `${BASE_URL}/api`;
const RESUME_FIXTURE_PATH = path.resolve(__dirname, "fixtures/mjh/resume.txt");

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgoToISO = (daysAgo: number): string => new Date(Date.now() - daysAgo * DAY_MS).toISOString();

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  { timeoutMs, intervalMs, label }: { timeoutMs: number; intervalMs: number; label: string },
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  for (;;) {
    last = await fn();
    if (predicate(last)) return last;
    if (Date.now() > deadline) {
      throw new Error(`[seed-mjh] timed out waiting for ${label}. Last value: ${JSON.stringify(last)}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function ensureDemoAccount(request: APIRequestContext): Promise<void> {
  const registerResponse = await request.post(`${API}/auth/register`, {
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD, display_name: DEMO_NAME },
  });

  if (registerResponse.status() === 201) {
    console.log(`[seed-mjh] created demo account ${DEMO_EMAIL}`);
  } else if (registerResponse.status() === 400) {
    console.log(`[seed-mjh] demo account ${DEMO_EMAIL} already exists — reusing it`);
  } else {
    throw new Error(
      `Unexpected /auth/register response: ${registerResponse.status()} ${await registerResponse.text()}`,
    );
  }

  // Idempotent no-op if already verified.
  markEmailVerified("myjobhunter", DEMO_EMAIL);
}

async function loginDemoAccount(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API}/auth/jwt/login`, {
    form: { username: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  if (!body.access_token) {
    throw new Error(`Login did not return an access_token: ${JSON.stringify(body)}`);
  }
  return body.access_token as string;
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

interface CompanyRecord {
  id: string;
  name: string;
}

async function ensureCompany(
  request: APIRequestContext,
  token: string,
  fixture: ApplicationFixture,
): Promise<CompanyRecord> {
  const searchResponse = await request.get(
    `${API}/companies?name_search=${encodeURIComponent(fixture.companyName)}`,
    { headers: authHeaders(token) },
  );
  expect(searchResponse.status(), await searchResponse.text()).toBe(200);
  const { items } = (await searchResponse.json()) as { items: CompanyRecord[] };
  const existing = items.find((c) => c.name === fixture.companyName);
  if (existing) return existing;

  const createResponse = await request.post(`${API}/companies`, {
    headers: authHeaders(token),
    data: {
      name: fixture.companyName,
      primary_domain: fixture.companyDomain,
      industry: fixture.companyIndustry,
      size_range: fixture.companySize,
    },
  });
  expect(createResponse.status(), await createResponse.text()).toBe(201);
  const created = (await createResponse.json()) as CompanyRecord;
  console.log(`[seed-mjh] created company "${fixture.companyName}"`);
  return created;
}

// ---------------------------------------------------------------------------
// Applications + events + contacts
// ---------------------------------------------------------------------------

interface ApplicationRecord {
  id: string;
  company_id: string;
  role_title: string;
}

async function listAllApplications(request: APIRequestContext, token: string): Promise<ApplicationRecord[]> {
  const response = await request.get(`${API}/applications?limit=500`, { headers: authHeaders(token) });
  expect(response.status(), await response.text()).toBe(200);
  const { items } = (await response.json()) as { items: ApplicationRecord[] };
  return items;
}

async function ensureApplication(
  request: APIRequestContext,
  token: string,
  company: CompanyRecord,
  fixture: ApplicationFixture,
  existing: ApplicationRecord[],
): Promise<{ record: ApplicationRecord; wasCreated: boolean }> {
  const found = existing.find((a) => a.company_id === company.id && a.role_title === fixture.roleTitle);
  if (found) return { record: found, wasCreated: false };

  let jdText: string | undefined;
  let jdParsed: Record<string, unknown> | undefined;
  if (fixture.jdText) {
    const parseResponse = await request.post(`${API}/applications/parse-jd`, {
      headers: authHeaders(token),
      data: { jd_text: fixture.jdText },
    });
    expect(parseResponse.status(), await parseResponse.text()).toBe(200);
    jdParsed = await parseResponse.json();
    jdText = fixture.jdText;
    console.log(`[seed-mjh] AI-parsed JD for "${fixture.companyName}" (${fixture.roleTitle})`);
  }

  const createResponse = await request.post(`${API}/applications`, {
    headers: authHeaders(token),
    data: {
      company_id: company.id,
      role_title: fixture.roleTitle,
      jd_text: jdText ?? null,
      jd_parsed: jdParsed ?? null,
      source: fixture.source,
      applied_at: daysAgoToISO(fixture.appliedDaysAgo),
      posted_salary_min: fixture.salaryMin ?? null,
      posted_salary_max: fixture.salaryMax ?? null,
      location: fixture.location,
      remote_type: fixture.remoteType,
      fit_score: fixture.fitScore ?? null,
      notes: fixture.notes ?? null,
    },
  });
  expect(createResponse.status(), await createResponse.text()).toBe(201);
  const created = (await createResponse.json()) as ApplicationRecord;
  console.log(`[seed-mjh] created application "${fixture.roleTitle}" @ "${fixture.companyName}"`);
  return { record: created, wasCreated: true };
}

function buildEventPayload(event: EventFixture) {
  const interviewDetails = event.interviewDetails
    ? {
        type: event.interviewDetails.type,
        scheduled_at:
          event.interviewDetails.scheduledDaysAgo !== undefined
            ? daysAgoToISO(event.interviewDetails.scheduledDaysAgo)
            : null,
        duration_minutes: event.interviewDetails.durationMinutes ?? null,
        location_or_link: event.interviewDetails.locationOrLink ?? null,
        interviewer_names: event.interviewDetails.interviewerNames ?? null,
      }
    : null;

  return {
    event_type: event.eventType,
    occurred_at: daysAgoToISO(event.daysAgo),
    source: "manual",
    note: event.note ?? null,
    interview_details: interviewDetails,
  };
}

async function ensureEvents(
  request: APIRequestContext,
  token: string,
  applicationId: string,
  fixture: ApplicationFixture,
): Promise<void> {
  const existingResponse = await request.get(`${API}/applications/${applicationId}/events`, {
    headers: authHeaders(token),
  });
  expect(existingResponse.status(), await existingResponse.text()).toBe(200);
  const { items } = (await existingResponse.json()) as { items: { event_type: string }[]; total: number };
  // Compare by event_type, not just total>0 — an earlier version of this
  // fixture only had the "applied" event, so a coarse total>0 skip would
  // have permanently short-circuited backfilling the richer pipeline
  // events (interview_scheduled, offer_received, rejected, etc.) added
  // later, since every application already has at least one event.
  const existingTypes = new Set(items.map((e) => e.event_type));
  const missing = fixture.events.filter((e) => !existingTypes.has(e.eventType));
  if (missing.length === 0) {
    console.log(`[seed-mjh] application ${applicationId} already has all ${fixture.events.length} event(s) — skipping`);
    return;
  }

  for (const event of missing) {
    const response = await request.post(`${API}/applications/${applicationId}/events`, {
      headers: authHeaders(token),
      data: buildEventPayload(event),
    });
    expect(response.status(), await response.text()).toBe(201);
  }
  console.log(
    `[seed-mjh] logged ${missing.length} new event(s) (of ${fixture.events.length} total) for "${fixture.roleTitle}" @ "${fixture.companyName}"`,
  );
}

async function ensureContacts(
  request: APIRequestContext,
  token: string,
  applicationId: string,
  fixture: ApplicationFixture,
): Promise<void> {
  if (!fixture.contacts || fixture.contacts.length === 0) return;

  const detailResponse = await request.get(`${API}/applications/${applicationId}`, {
    headers: authHeaders(token),
  });
  expect(detailResponse.status(), await detailResponse.text()).toBe(200);
  const detail = (await detailResponse.json()) as { contacts: { name: string | null; email: string | null }[] };

  for (const contact of fixture.contacts) {
    const already = detail.contacts.some(
      (c) => (contact.name && c.name === contact.name) || (contact.email && c.email === contact.email),
    );
    if (already) continue;

    const response = await request.post(`${API}/applications/${applicationId}/contacts`, {
      headers: authHeaders(token),
      data: {
        name: contact.name ?? null,
        email: contact.email ?? null,
        role: contact.role,
        notes: contact.notes ?? null,
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    console.log(`[seed-mjh] added contact "${contact.name ?? contact.email}" to application ${applicationId}`);
  }
}

// ---------------------------------------------------------------------------
// Resume upload
// ---------------------------------------------------------------------------

interface ResumeJob {
  id: string;
  file_filename: string | null;
  status: string;
  error_message: string | null;
}

async function ensureResumeUploadJob(request: APIRequestContext, token: string): Promise<ResumeJob> {
  const listResponse = await request.get(`${API}/resume-upload-jobs`, { headers: authHeaders(token) });
  expect(listResponse.status(), await listResponse.text()).toBe(200);
  const jobs = (await listResponse.json()) as ResumeJob[];
  const existingComplete = jobs.find((j) => j.file_filename === "resume.txt" && j.status === "complete");
  if (existingComplete) {
    console.log(`[seed-mjh] resume already parsed (job ${existingComplete.id}) — reusing it`);
    return existingComplete;
  }
  const existingInFlight = jobs.find(
    (j) => j.file_filename === "resume.txt" && (j.status === "queued" || j.status === "processing"),
  );

  let jobId: string;
  if (existingInFlight) {
    jobId = existingInFlight.id;
    console.log(`[seed-mjh] resume upload job ${jobId} already in flight — polling it`);
  } else {
    const fileBuffer = readFileSync(RESUME_FIXTURE_PATH);
    const uploadResponse = await request.post(`${API}/resumes`, {
      headers: authHeaders(token),
      multipart: {
        file: {
          name: "resume.txt",
          mimeType: "text/plain",
          buffer: fileBuffer,
        },
      },
    });
    expect(uploadResponse.status(), await uploadResponse.text()).toBe(201);
    const created = (await uploadResponse.json()) as ResumeJob;
    jobId = created.id;
    console.log(`[seed-mjh] uploaded fake resume — job ${jobId} queued for AI parsing`);
  }

  // The worker polls every 5s and makes a real Claude call to extract the
  // resume fields, so give this a generous window.
  const finalJob = await pollUntil(
    async () => {
      const r = await request.get(`${API}/resume-upload-jobs/${jobId}`, { headers: authHeaders(token) });
      expect(r.status(), await r.text()).toBe(200);
      return (await r.json()) as ResumeJob;
    },
    (job) => job.status === "complete" || job.status === "failed",
    { timeoutMs: 120_000, intervalMs: 3_000, label: `resume upload job ${jobId} to finish parsing` },
  );

  if (finalJob.status === "failed") {
    throw new Error(`[seed-mjh] resume parse job ${jobId} failed: ${finalJob.error_message}`);
  }
  console.log(`[seed-mjh] resume parse complete (job ${jobId})`);
  return finalJob;
}

// ---------------------------------------------------------------------------
// Profile preferences (seniority, summary, salary/location/remote prefs)
// ---------------------------------------------------------------------------
//
// Resume parsing only fills work_history/education/skills — seniority,
// summary, target salary, target locations, and remote preference are
// user-editable fields the app never derives from the resume (confirmed
// by grepping the backend: nothing assigns profile.seniority/.summary
// outside jd_parsing_service, which is unrelated). Left blank, the
// Profile screenshot shows "Level not set" / "No summary yet" / "No
// target locations set" empty states, so this step fills them via the
// real PATCH /profile endpoint with fictional-but-believable values.

interface ProfileRecord {
  seniority: string | null;
  summary: string | null;
}

async function ensureProfilePreferences(request: APIRequestContext, token: string): Promise<void> {
  const getResponse = await request.get(`${API}/profile`, { headers: authHeaders(token) });
  expect(getResponse.status(), await getResponse.text()).toBe(200);
  const profile = (await getResponse.json()) as ProfileRecord;
  if (profile.seniority && profile.summary) {
    console.log(`[seed-mjh] profile preferences already set — skipping`);
    return;
  }

  const patchResponse = await request.patch(`${API}/profile`, {
    headers: authHeaders(token),
    data: {
      seniority: "senior",
      summary:
        "Backend-focused full-stack engineer with 8 years building and scaling distributed " +
        "systems for B2B SaaS products. Comfortable owning a service from design through " +
        "on-call, with a track record of shipping migrations that cut latency and cost " +
        "without breaking customers.",
      desired_salary_min: 165000,
      desired_salary_max: 195000,
      salary_currency: "USD",
      salary_period: "annual",
      locations: ["Portland, OR", "Seattle, WA", "Remote (US)"],
      remote_preference: "remote_only",
      work_auth_status: "citizen",
    },
  });
  expect(patchResponse.status(), await patchResponse.text()).toBe(200);
  console.log(`[seed-mjh] set profile preferences (seniority, summary, salary/location/remote prefs)`);
}

// ---------------------------------------------------------------------------
// No API lists a user's refinement sessions (only GET /sessions/{id} exists),
// so the idempotency check reads the local demo database.
// ---------------------------------------------------------------------------
function findExistingSessionId(sourceResumeJobId: string): string | null {
  const id = psql(
    "myjobhunter",
    `SELECT s.id FROM resume_refinement_sessions s JOIN users u ON u.id = s.user_id ` +
      `WHERE u.email = '${DEMO_EMAIL}' AND s.source_resume_job_id = '${sourceResumeJobId}' ` +
      `ORDER BY s.created_at DESC LIMIT 1;`,
  );
  return id || null;
}

// ---------------------------------------------------------------------------
// Resume-refinement session
// ---------------------------------------------------------------------------

interface SessionState {
  id: string;
  status: string;
  source_resume_job_id: string | null;
  target_index: number;
  turn_count: number;
  pending_proposal: string | null;
  pending_rationale: string | null;
  pending_clarifying_question: string | null;
  pending_guard_flagged: string[] | null;
  improvement_targets: unknown[] | null;
  error_message: string | null;
}

async function getSession(request: APIRequestContext, token: string, sessionId: string): Promise<SessionState> {
  const r = await request.get(`${API}/resume-refinement/sessions/${sessionId}`, { headers: authHeaders(token) });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as SessionState;
}

async function ensureRefinementSession(
  request: APIRequestContext,
  token: string,
  sourceResumeJobId: string,
): Promise<{ session: SessionState; wasCreated: boolean }> {
  const existingId = findExistingSessionId(sourceResumeJobId);

  let session: SessionState;
  let wasCreated = false;
  if (existingId) {
    session = await getSession(request, token, existingId);
    console.log(`[seed-mjh] resume-refinement session ${session.id} already exists (status=${session.status}) — reusing it`);
  } else {
    const startResponse = await request.post(`${API}/resume-refinement/sessions`, {
      headers: authHeaders(token),
      data: { source_resume_job_id: sourceResumeJobId },
    });
    expect(startResponse.status(), await startResponse.text()).toBe(201);
    session = (await startResponse.json()) as SessionState;
    wasCreated = true;
    console.log(`[seed-mjh] started resume-refinement session ${session.id} (status=preparing)`);
  }

  // The background worker (app.workers.resume_parser_worker, which also
  // polls refinement-prepare) runs the critique pass + prefetches a
  // proposal for every improvement target — several parallel Claude
  // calls, so give this a generous window.
  session = await pollUntil(
    () => getSession(request, token, session.id),
    (s) => s.status === "active" || s.status === "failed",
    { timeoutMs: 180_000, intervalMs: 3_000, label: `resume-refinement session ${session.id} to become active` },
  );
  if (session.status === "failed") {
    throw new Error(`[seed-mjh] resume-refinement session ${session.id} failed to prepare: ${session.error_message}`);
  }
  console.log(`[seed-mjh] resume-refinement session ${session.id} is active (${session.improvement_targets?.length ?? 0} targets)`);
  return { session, wasCreated };
}

/** Walk the cursor to `targetIndex` via repeated /navigate calls (cache hits — cheap, no Claude cost). */
async function navigateTo(
  request: APIRequestContext,
  token: string,
  sessionId: string,
  session: SessionState,
  targetIndex: number,
): Promise<SessionState> {
  let current = session;
  while (current.target_index !== targetIndex) {
    const direction = targetIndex > current.target_index ? "next" : "prev";
    const r = await request.post(`${API}/resume-refinement/sessions/${sessionId}/navigate`, {
      headers: authHeaders(token),
      data: { direction },
    });
    expect(r.status(), await r.text()).toBe(200);
    current = (await r.json()) as SessionState;
  }
  return current;
}

const GUARD_HINTS = [
  "Make this more quantitative — mention that this specific change reduced " +
    "infrastructure spend by 63% and that it won the team the company's internal " +
    "Innovation Award that year.",
  "Add a precise number of engineers who depended on this work (say, 14) and note " +
    "that it replaced a third-party vendor called CloudScale Inc.",
  "Quantify the impact — state that on-call incident volume dropped by 47% within " +
    "two months of this shipping.",
  "Mention this was presented at the internal 'Founders Summit' conference and cut " +
    "customer support tickets by 31%.",
  "Add a specific dollar figure — say this saved roughly $180K per year — and credit " +
    "a partner team called the Meridian Reliability Group.",
  "Name a specific number of production incidents prevented (say 22) and mention this " +
    "earned a shout-out from the VP of Engineering, Casey Whitfield.",
];

/**
 * Advance a freshly-created session so the /resume screenshot shows a
 * believable in-progress state:
 *   1. Accept the first AI proposal that's a plain rewrite (not a
 *      clarifying question) as-is — a real chat-style accepted history
 *      entry. Scans the WHOLE target list via /navigate since which
 *      targets prefetch as a plain proposal vs. a clarify question
 *      depends on the critique pass and isn't predictable up front.
 *   2. Try to naturally trigger the hallucination guard on a DIFFERENT
 *      target by asking for an unsourced metric/award/name via the real
 *      /alternative endpoint — never faked in SQL. Every other target is
 *      tried in turn (navigating back to ones skipped in step 1, which
 *      are exactly the metric/outcome/scope-type critique targets most
 *      likely to comply with a fabrication hint). The moment a target's
 *      pending proposal comes back guard-flagged, we STOP completely —
 *      no further /alternative, /accept, or /navigate call — so the
 *      flagged clarify state stays the CURRENT on-screen state for the
 *      capture step.
 *
 * If the guard never triggers within the attempt budget, the session is
 * simply left with whatever plain pending proposal + rationale the last
 * attempt produced — a perfectly good fallback per the design brief.
 */
async function advanceSessionForScreenshot(
  request: APIRequestContext,
  token: string,
  sessionId: string,
): Promise<void> {
  let session = await getSession(request, token, sessionId);
  const totalTargets = session.improvement_targets?.length ?? 0;

  // Phase A: find a target whose prefetched proposal is a plain rewrite
  // (not a clarifying question) and accept it — real accepted history.
  let acceptedIndex: number | null = null;
  for (let i = 0; i < totalTargets; i += 1) {
    session = await navigateTo(request, token, sessionId, session, i);
    if (session.pending_proposal) {
      const acceptResponse = await request.post(`${API}/resume-refinement/sessions/${sessionId}/accept`, {
        headers: authHeaders(token),
      });
      expect(acceptResponse.status(), await acceptResponse.text()).toBe(200);
      session = (await acceptResponse.json()) as SessionState;
      acceptedIndex = i;
      console.log(`[seed-mjh] accepted proposal for target_index ${i}`);
      break;
    }
  }
  if (acceptedIndex === null) {
    console.log(`[seed-mjh] every target prefetched as a clarify question — no accepted history entry this run`);
  }

  // Phase B: try every OTHER target (in original order, skipping the one
  // we just accepted — its draft text has already changed) for the
  // hallucination guard, escalating through a small set of fabrication
  // hints. Stop completely on the first flag.
  let guardTriggered = false;
  let attempt = 0;
  for (let i = 0; i < totalTargets; i += 1) {
    if (i === acceptedIndex) continue;

    session = await navigateTo(request, token, sessionId, session, i);
    const hint = GUARD_HINTS[attempt % GUARD_HINTS.length];
    attempt += 1;

    const altResponse = await request.post(`${API}/resume-refinement/sessions/${sessionId}/alternative`, {
      headers: authHeaders(token),
      data: { hint },
    });
    expect(altResponse.status(), await altResponse.text()).toBe(200);
    session = (await altResponse.json()) as SessionState;

    if (session.pending_guard_flagged && session.pending_guard_flagged.length > 0) {
      guardTriggered = true;
      console.log(
        `[seed-mjh] hallucination guard triggered on target_index ${i}: ` +
          `flagged ${JSON.stringify(session.pending_guard_flagged)} — leaving this state on screen`,
      );
      break;
    }
    console.log(`[seed-mjh] attempt ${attempt}: hint did not trigger the guard on target_index ${i}`);
  }

  if (!guardTriggered) {
    console.log(
      `[seed-mjh] hallucination guard did not trigger across ${attempt} target(s) — ` +
        `leaving a clean pending proposal + rationale on screen instead (acceptable fallback per design brief)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Setup test
// ---------------------------------------------------------------------------

setup("seed MyJobHunter demo data", async ({ request }) => {
  await ensureDemoAccount(request);
  const token = await loginDemoAccount(request);

  // Companies + applications + events + contacts.
  const existingApplications = await listAllApplications(request, token);
  for (const fixture of applications) {
    const company = await ensureCompany(request, token, fixture);
    const { record: application } = await ensureApplication(
      request,
      token,
      company,
      fixture,
      existingApplications,
    );
    await ensureEvents(request, token, application.id, fixture);
    await ensureContacts(request, token, application.id, fixture);
  }

  // Resume upload + AI parse (fills work history/education/skills on Profile).
  const resumeJob = await ensureResumeUploadJob(request, token);

  // Seniority/summary/salary/location/remote prefs — not derived from the
  // resume, filled separately so Profile doesn't show empty states.
  await ensureProfilePreferences(request, token);

  // Resume-refinement session — the most important screenshot target.
  const { session, wasCreated } = await ensureRefinementSession(request, token, resumeJob.id);
  if (wasCreated) {
    await advanceSessionForScreenshot(request, token, session.id);
  } else {
    console.log(`[seed-mjh] session ${session.id} was already present — leaving its state untouched (idempotent re-run)`);
  }

  console.log(`[seed-mjh] done — demo account ${DEMO_EMAIL} ready at ${BASE_URL}`);
});
