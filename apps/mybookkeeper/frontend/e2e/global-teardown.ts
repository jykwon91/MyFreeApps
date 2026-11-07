import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BACKEND_URL } from "./fixtures/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, ".auth-token");
const ORG_PATH = path.join(__dirname, ".auth-org");
const WORKER_PID_PATH = path.join(__dirname, ".worker-pid");

interface Row {
  id: string;
}

interface Cleanup<T extends Row> {
  label: string;
  listPaths: string[];
  isE2e: (row: T) => boolean;
  deletePath: (id: string) => string;
}

// Deletes every E2E row one list endpoint returns. A 404 on delete means the
// row is already gone; anything else is recorded so the run reports it.
async function cleanup<T extends Row>(
  { label, listPaths, isE2e, deletePath }: Cleanup<T>,
  headers: Record<string, string>,
  failures: string[],
): Promise<void> {
  let deleted = 0;
  for (const listPath of listPaths) {
    const res = await fetch(`${BACKEND_URL}${listPath}`, { headers }).catch(() => null);
    if (!res?.ok) {
      failures.push(`list ${listPath}: ${res?.status ?? "network error"}`);
      continue;
    }
    const rows = ((await res.json()) as T[]).filter(isE2e);
    for (const row of rows) {
      const del = await fetch(`${BACKEND_URL}${deletePath(row.id)}`, { method: "DELETE", headers })
        .catch(() => null);
      if (del?.ok) deleted += 1;
      else if (del?.status !== 404) failures.push(`delete ${deletePath(row.id)}: ${del?.status ?? "network error"}`);
    }
  }
  if (deleted > 0) console.log(`E2E teardown: deleted ${deleted} ${label}`);
}

async function cleanupTestData(token: string, orgId: string): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-Organization-Id": orgId,
  };
  const failures: string[] = [];
  const thisYear = new Date().getFullYear();

  await cleanup<Row & { vendor: string | null }>({
    label: "transaction(s)",
    listPaths: ["/transactions"],
    isE2e: (t) => !!t.vendor && (t.vendor.startsWith("E2E ") || t.vendor.startsWith("Mobile E2E ")),
    deletePath: (id) => `/transactions/${id}`,
  }, headers, failures);

  await cleanup<Row & { name: string }>({
    label: "propert(ies)",
    listPaths: ["/properties"],
    isE2e: (p) =>
      p.name.startsWith("E2E ") ||
      p.name.startsWith("Mobile E2E ") ||
      p.name === "Unique Property 9999 ABCDE" ||
      p.name === "Test ABCDEF12345",
    deletePath: (id) => `/properties/${id}`,
  }, headers, failures);

  await cleanup<Row & { match_pattern: string }>({
    label: "classification rule(s)",
    listPaths: ["/classification-rules"],
    isE2e: (r) => r.match_pattern.startsWith("E2E ") || r.match_pattern.startsWith("API Test Rule "),
    deletePath: (id) => `/classification-rules/${id}`,
  }, headers, failures);

  // Specs file reconciliation sources under recent tax years.
  await cleanup<Row & { issuer: string | null }>({
    label: "reconciliation source(s)",
    listPaths: [thisYear - 2, thisYear - 1, thisYear].map((y) => `/reconciliation/sources?tax_year=${y}`),
    isE2e: (s) => !!s.issuer?.startsWith("E2E "),
    deletePath: (id) => `/test/reconciliation-sources/${id}`,
  }, headers, failures);

  await cleanup<Row & { file_name: string | null }>({
    label: "test document(s)",
    listPaths: ["/documents"],
    isE2e: (d) => d.file_name === "plumber-invoice.pdf" || !!d.file_name?.startsWith("e2e-doc-"),
    deletePath: (id) => `/documents/${id}`,
  }, headers, failures);

  // tax.spec.ts and chrome-extension-sidepanel.spec.ts mark their returns head_of_household.
  await cleanup<Row & { filing_status: string }>({
    label: "test tax return(s)",
    listPaths: ["/tax-returns"],
    isE2e: (r) => r.filing_status === "head_of_household",
    deletePath: (id) => `/tax-returns/${id}`,
  }, headers, failures);

  if (failures.length > 0) {
    throw new Error(`E2E teardown left test data behind:\n  ${failures.join("\n  ")}`);
  }
}

function stopWorker(): void {
  if (!fs.existsSync(WORKER_PID_PATH)) return;

  const pid = parseInt(fs.readFileSync(WORKER_PID_PATH, "utf-8").trim(), 10);
  fs.unlinkSync(WORKER_PID_PATH);

  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGTERM");
    }
    console.log(`E2E worker: stopped (PID ${pid})`);
  } catch {
    console.log(`E2E worker: PID ${pid} already exited`);
  }
}

async function globalTeardown() {
  stopWorker();

  if (!fs.existsSync(TOKEN_PATH)) return;
  const token = fs.readFileSync(TOKEN_PATH, "utf-8").trim();
  if (!token) return;

  const orgId = fs.existsSync(ORG_PATH)
    ? fs.readFileSync(ORG_PATH, "utf-8").trim()
    : "";
  if (!orgId) return;

  await cleanupTestData(token, orgId);
}

export default globalTeardown;
