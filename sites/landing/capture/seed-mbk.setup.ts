/**
 * Seeds fake, fictional demo data into a locally running MyBookkeeper
 * instance so portfolio screenshots have something believable to show.
 *
 * Everything here is FAKE — a fictional user ("Alex Rivera"), fictional
 * Houston, TX rental properties, fictional vendors/tenants, and a fake
 * plumbing invoice run through real Claude extraction. Nothing here is the
 * operator's real financial data. This script only ever talks to a LOCAL
 * dev instance (default http://localhost:5190) seeded into its own
 * throwaway Postgres database (portfolio_demo_mbk) — never a deployed
 * environment.
 *
 * Primary target (per the design pass): the receipt-extraction review
 * screen. This script uploads a realistic multi-line fake plumbing/HVAC
 * invoice and waits for the real Anthropic extraction to complete, so the
 * review screen at /documents has a genuine AI-extracted document to show.
 * Everything else (properties, ~6 months of transactions, a tenant + rent
 * ledger with a partial/late payment) is secondary and included because it
 * was already planned and makes the dashboard/rent-ledger screens usable
 * too.
 *
 * Idempotent: safe to run repeatedly. It detects the existing demo account,
 * properties (by name), transactions (by date+vendor+amount), the tenant
 * applicant + lease + rent schedule (by ledger state), and the uploaded
 * invoice (server-side content-hash dedup) and only creates what's missing.
 *
 * Run from sites/landing:
 *   npx playwright test --config capture/playwright.config.ts --project=seed seed-mbk
 */
import { test as setup, expect, type APIRequestContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { DEMO_EMAIL, DEMO_NAME, DEMO_PASSWORD } from "./fixtures/demo-user";
import { markEmailVerified } from "./local-db";
import { PROPERTIES, BAYOU_BEND_DUPLEX, type PropertyFixture } from "./fixtures/mbk/properties";
import { TRANSACTIONS } from "./fixtures/mbk/transactions";
import { TENANT_NAME, RENT_SCHEDULE, RENT_PAYMENTS } from "./fixtures/mbk/tenant";
import { renderInvoiceHtml, INVOICE_VENDOR } from "./fixtures/mbk/invoice";

const BASE_URL = process.env.MBK_URL ?? "http://localhost:5190";
const API = `${BASE_URL}/api`;
const INVOICE_FIXTURE_PATH = path.join(__dirname, "fixtures", "mbk", "plumbing-invoice.png");

// ---------------------------------------------------------------------------
// Auth + org
// ---------------------------------------------------------------------------

async function ensureDemoAccount(request: APIRequestContext): Promise<void> {
  const registerResponse = await request.post(`${API}/auth/register`, {
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: DEMO_NAME },
  });
  if (registerResponse.status() === 201) {
    console.log(`[seed-mbk] created demo account ${DEMO_EMAIL}`);
  } else if (registerResponse.status() === 400) {
    console.log(`[seed-mbk] demo account ${DEMO_EMAIL} already exists — reusing it`);
  } else {
    throw new Error(
      `Unexpected /auth/register response: ${registerResponse.status()} ${await registerResponse.text()}`,
    );
  }
  // Idempotent no-op if already verified.
  markEmailVerified("mybookkeeper", DEMO_EMAIL);
}

async function loginDemoAccount(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API}/auth/jwt/login`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    form: { username: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  if (!body.access_token) throw new Error(`Login did not return an access_token: ${JSON.stringify(body)}`);
  return body.access_token as string;
}

async function ensureOrg(request: APIRequestContext, token: string): Promise<string> {
  const authHeaders = { Authorization: `Bearer ${token}` };
  const orgRes = await request.get(`${API}/organizations`, { headers: authHeaders });
  expect(orgRes.status(), await orgRes.text()).toBe(200);
  const orgs = (await orgRes.json()) as { id: string; name: string }[];
  if (orgs.length > 0) {
    console.log(`[seed-mbk] org acquired (${orgs[0].name})`);
    return orgs[0].id;
  }
  const createRes = await request.post(`${API}/organizations`, {
    headers: authHeaders,
    data: { name: "Alex Rivera Properties" },
  });
  expect(createRes.status(), await createRes.text()).toBe(201);
  const org = await createRes.json();
  console.log(`[seed-mbk] org created (${org.name})`);
  return org.id;
}

function authHeaders(token: string, orgId: string) {
  return { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId };
}

/** RequireOrg redirects every authenticated page to /onboarding until this
 * completes — without it, the demo account can never reach /documents. */
async function ensureOnboarding(request: APIRequestContext, headers: Record<string, string>): Promise<void> {
  const res = await request.post(`${API}/tax-profile/complete-onboarding`, {
    headers,
    data: { tax_situations: ["rental_property"], filing_status: "single", dependents_count: 0 },
  });
  if (res.ok() || res.status() === 400 || res.status() === 409) {
    console.log("[seed-mbk] onboarding complete (or already was)");
    return;
  }
  throw new Error(`Onboarding failed: ${res.status()} ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

interface PropertyRead {
  id: string;
  name: string;
}

async function ensureProperties(
  request: APIRequestContext,
  headers: Record<string, string>,
): Promise<Map<string, string>> {
  const listRes = await request.get(`${API}/properties`, { headers });
  expect(listRes.status(), await listRes.text()).toBe(200);
  const existing = (await listRes.json()) as PropertyRead[];
  const byName = new Map(existing.map((p) => [p.name, p.id]));

  for (const fixture of PROPERTIES) {
    if (byName.has(fixture.name)) {
      console.log(`[seed-mbk] property "${fixture.name}" already exists — reusing it`);
      continue;
    }
    const res = await request.post(`${API}/properties`, {
      headers,
      data: {
        name: fixture.name,
        address: fixture.address,
        classification: fixture.classification,
        type: fixture.type,
      } satisfies PropertyFixture & { name: string; address: string },
    });
    expect(res.status(), await res.text()).toBe(200);
    const created = (await res.json()) as PropertyRead;
    byName.set(created.name, created.id);
    console.log(`[seed-mbk] created property "${fixture.name}"`);
  }
  return byName;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

interface TransactionRead {
  id: string;
  transaction_date: string;
  vendor: string | null;
  amount: string;
  property_id: string | null;
}

async function ensureTransactions(
  request: APIRequestContext,
  headers: Record<string, string>,
  propertyIds: Map<string, string>,
): Promise<void> {
  // One fetch per property, then dedupe client-side against (date|vendor|amount).
  const existingKeys = new Set<string>();
  for (const propId of new Set(propertyIds.values())) {
    const res = await request.get(`${API}/transactions?property_id=${propId}&limit=1000`, { headers });
    expect(res.status(), await res.text()).toBe(200);
    const rows = (await res.json()) as TransactionRead[];
    for (const t of rows) {
      existingKeys.add(`${t.property_id}|${t.transaction_date}|${t.vendor}|${Number(t.amount).toFixed(2)}`);
    }
  }

  let created = 0;
  for (const tx of TRANSACTIONS) {
    const propertyId = propertyIds.get(tx.propertyName);
    if (!propertyId) throw new Error(`Unknown property in transaction fixture: ${tx.propertyName}`);
    const key = `${propertyId}|${tx.date}|${tx.vendor}|${tx.amount.toFixed(2)}`;
    if (existingKeys.has(key)) continue;

    const res = await request.post(`${API}/transactions`, {
      headers,
      data: {
        property_id: propertyId,
        transaction_date: tx.date,
        vendor: tx.vendor,
        description: tx.description,
        amount: tx.amount,
        transaction_type: tx.transactionType,
        category: tx.category,
        sub_category: tx.subCategory ?? null,
        schedule_e_line: tx.scheduleELine ?? null,
        tags: tx.tags ?? [],
        tax_relevant: tx.taxRelevant ?? false,
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    created++;
  }
  console.log(`[seed-mbk] transactions: ${created} created, ${TRANSACTIONS.length - created} already present`);
}

// ---------------------------------------------------------------------------
// Tenant + lease + rent ledger (FIFO allocation demo)
// ---------------------------------------------------------------------------

interface ApplicantSummary {
  id: string;
  legal_name: string | null;
  stage: string;
}

interface RentLedger {
  applicant_id: string;
  schedules: unknown[];
  payments: { amount: string; paid_on: string }[];
}

async function ensureTenantAndLease(
  request: APIRequestContext,
  headers: Record<string, string>,
  bayouPropertyId: string,
): Promise<string> {
  const listRes = await request.get(`${API}/applicants?stage=lease_signed`, { headers });
  expect(listRes.status(), await listRes.text()).toBe(200);
  const list = (await listRes.json()) as { items: ApplicantSummary[] };
  let applicant = list.items.find((a) => a.legal_name === TENANT_NAME);

  if (applicant) {
    console.log(`[seed-mbk] applicant "${TENANT_NAME}" already exists — reusing it`);
  } else {
    const res = await request.post(`${API}/test/seed-applicant`, {
      headers,
      data: { legal_name: TENANT_NAME, stage: "lease_signed" },
    });
    expect(res.status(), await res.text()).toBe(200);
    const created = (await res.json()) as { id: string };
    applicant = { id: created.id, legal_name: TENANT_NAME, stage: "lease_signed" };
    console.log(`[seed-mbk] created applicant "${TENANT_NAME}"`);

    const leaseRes = await request.post(`${API}/test/seed-signed-lease`, {
      headers,
      data: {
        applicant_id: applicant.id,
        starts_on: RENT_SCHEDULE.startDate,
        ends_on: "2027-03-31",
      },
    });
    expect(leaseRes.status(), await leaseRes.text()).toBe(201);
    console.log(`[seed-mbk] created signed lease for "${TENANT_NAME}"`);
  }

  // Ledger read auto-generates charges up to today and is the cheapest way
  // to check whether a schedule already exists for this applicant.
  const ledgerRes = await request.get(`${API}/rent-ledger/tenants/${applicant.id}`, { headers });
  expect(ledgerRes.status(), await ledgerRes.text()).toBe(200);
  const ledger = (await ledgerRes.json()) as RentLedger;

  if (ledger.schedules.length === 0) {
    const scheduleRes = await request.post(`${API}/rent-ledger/schedules`, {
      headers,
      data: {
        applicant_id: applicant.id,
        property_id: bayouPropertyId,
        amount: RENT_SCHEDULE.amount,
        cadence: RENT_SCHEDULE.cadence,
        start_date: RENT_SCHEDULE.startDate,
        grace_days: RENT_SCHEDULE.graceDays,
      },
    });
    expect(scheduleRes.status(), await scheduleRes.text()).toBe(201);
    console.log(`[seed-mbk] created rent schedule for "${TENANT_NAME}"`);
  } else {
    console.log(`[seed-mbk] rent schedule for "${TENANT_NAME}" already exists — reusing it`);
  }

  const existingPaymentKeys = new Set(
    ledger.payments.map((p) => `${p.paid_on}|${Number(p.amount).toFixed(2)}`),
  );

  let created = 0;
  for (const payment of RENT_PAYMENTS) {
    const key = `${payment.date}|${payment.amount.toFixed(2)}`;
    if (existingPaymentKeys.has(key)) continue;

    const txRes = await request.post(`${API}/transactions`, {
      headers,
      data: {
        property_id: bayouPropertyId,
        transaction_date: payment.date,
        vendor: TENANT_NAME,
        description: payment.description,
        amount: payment.amount,
        transaction_type: "income",
        category: "rental_revenue",
        schedule_e_line: "line_3_rents_received",
        tax_relevant: true,
      },
    });
    expect(txRes.status(), await txRes.text()).toBe(201);
    const tx = (await txRes.json()) as { id: string };

    const attrRes = await request.post(`${API}/transactions/${tx.id}/attribute`, {
      headers,
      data: { applicant_id: applicant.id },
    });
    expect(attrRes.status(), await attrRes.text()).toBe(200);
    created++;
  }
  console.log(`[seed-mbk] rent payments: ${created} created, ${RENT_PAYMENTS.length - created} already present`);

  return applicant.id;
}

// ---------------------------------------------------------------------------
// Extraction document (PRIMARY target — the receipt-review screen)
// ---------------------------------------------------------------------------

async function ensureInvoiceFixture(page: Page): Promise<Buffer> {
  // Read first and treat ENOENT as "not rendered yet" — no separate exists-check to race.
  try {
    const cached = readFileSync(INVOICE_FIXTURE_PATH);
    console.log("[seed-mbk] invoice fixture PNG already rendered — reusing it");
    return cached;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await page.setViewportSize({ width: 850, height: 1100 });
  await page.setContent(renderInvoiceHtml());
  const png = await page.locator("body").screenshot();
  mkdirSync(path.dirname(INVOICE_FIXTURE_PATH), { recursive: true });
  writeFileSync(INVOICE_FIXTURE_PATH, png);
  console.log(`[seed-mbk] rendered invoice fixture PNG -> ${INVOICE_FIXTURE_PATH}`);
  return png;
}

async function ensureExtractionDocument(
  request: APIRequestContext,
  headers: Record<string, string>,
  page: Page,
  bayouPropertyId: string,
): Promise<void> {
  const fileContent = await ensureInvoiceFixture(page);

  const uploadRes = await request.post(`${API}/documents/upload?property_id=${bayouPropertyId}`, {
    headers,
    multipart: { file: { name: "plumbing-invoice.png", mimeType: "image/png", buffer: fileContent } },
  });
  expect(uploadRes.status(), await uploadRes.text()).toBe(202);
  const { document_id: documentId } = (await uploadRes.json()) as { document_id: string };
  console.log(`[seed-mbk] uploaded invoice -> document ${documentId}`);

  const deadline = Date.now() + 90_000;
  let status = "processing";
  while (Date.now() < deadline) {
    const statusRes = await request.get(`${API}/documents/upload-status/${documentId}`, { headers });
    expect(statusRes.status(), await statusRes.text()).toBe(200);
    status = (await statusRes.json()).status as string;
    if (status !== "processing" && status !== "extracting") break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (status === "completed") {
    const txRes = await request.get(
      `${API}/transactions?property_id=${bayouPropertyId}&limit=1000`,
      { headers },
    );
    expect(txRes.status()).toBe(200);
    const rows = (await txRes.json()) as { vendor: string | null; amount: string; source_document_id: string | null }[];
    const extracted = rows.find((t) => t.source_document_id === documentId);
    if (extracted) {
      console.log(
        `[seed-mbk] extraction SUCCEEDED — vendor="${extracted.vendor}" amount=${extracted.amount} (expected vendor "${INVOICE_VENDOR}")`,
      );
    } else {
      console.log(
        `[seed-mbk] extraction reported "completed" but no transaction with source_document_id=${documentId} was found — check the review screen manually`,
      );
    }
  } else if (status === "processing" || status === "extracting") {
    console.log(`[seed-mbk] extraction TIMED OUT after 90s — document ${documentId} is still "${status}"`);
  } else {
    const docRes = await request.get(`${API}/documents/${documentId}`, { headers });
    const doc = await docRes.json();
    console.log(
      `[seed-mbk] extraction FAILED — status="${status}" error="${doc.error_message ?? "(none)"}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// Setup test
// ---------------------------------------------------------------------------

setup("seed MyBookkeeper demo data", async ({ request, page }) => {
  await ensureDemoAccount(request);
  const token = await loginDemoAccount(request);
  const orgId = await ensureOrg(request, token);
  const headers = authHeaders(token, orgId);
  await ensureOnboarding(request, headers);

  const propertyIds = await ensureProperties(request, headers);
  const bayouId = propertyIds.get(BAYOU_BEND_DUPLEX.name);
  if (!bayouId) throw new Error("Bayou Bend Duplex was not created/found");

  await ensureTransactions(request, headers, propertyIds);
  await ensureTenantAndLease(request, headers, bayouId);
  await ensureExtractionDocument(request, headers, page, bayouId);

  console.log(`[seed-mbk] done — demo account ${DEMO_EMAIL} ready at ${BASE_URL}`);
});
