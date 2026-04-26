import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BACKEND_URL } from "./fixtures/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, ".auth-token");
const ORG_PATH = path.join(__dirname, ".auth-org");
const WORKER_PID_PATH = path.join(__dirname, ".worker-pid");

async function cleanupTestData(token: string, orgId: string): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-Organization-Id": orgId,
  };

  // Clean up E2E transactions
  try {
    const res = await fetch(`${BACKEND_URL}/transactions`, { headers });
    if (res.ok) {
      const txns = (await res.json()) as Array<{ id: string; vendor: string | null }>;
      const e2e = txns.filter((t) => t.vendor?.startsWith("E2E ") || t.vendor?.startsWith("Mobile E2E "));
      for (const txn of e2e) {
        await fetch(`${BACKEND_URL}/transactions/${txn.id}`, { method: "DELETE", headers }).catch(() => {});
      }
      if (e2e.length > 0) console.log(`E2E teardown: deleted ${e2e.length} transaction(s)`);
    }
  } catch { /* non-critical */ }

  // Clean up E2E properties
  try {
    const res = await fetch(`${BACKEND_URL}/properties`, { headers });
    if (res.ok) {
      const props = (await res.json()) as Array<{ id: string; name: string }>;
      const e2e = props.filter((p) =>
        p.name.startsWith("E2E ") ||
        p.name.startsWith("Mobile E2E ") ||
        p.name === "Unique Property 9999 ABCDE" ||
        p.name === "Test ABCDEF12345"
      );
      for (const prop of e2e) {
        await fetch(`${BACKEND_URL}/properties/${prop.id}`, { method: "DELETE", headers }).catch(() => {});
      }
      if (e2e.length > 0) console.log(`E2E teardown: deleted ${e2e.length} propert(ies)`);
    }
  } catch { /* non-critical */ }

  // Clean up E2E classification rules
  try {
    const res = await fetch(`${BACKEND_URL}/classification-rules`, { headers });
    if (res.ok) {
      const rules = (await res.json()) as Array<{ id: string; match_pattern: string }>;
      const e2e = rules.filter((r) =>
        r.match_pattern.startsWith("E2E ") || r.match_pattern.startsWith("API Test Rule ")
      );
      for (const rule of e2e) {
        await fetch(`${BACKEND_URL}/classification-rules/${rule.id}`, { method: "DELETE", headers }).catch(() => {});
      }
      if (e2e.length > 0) console.log(`E2E teardown: deleted ${e2e.length} classification rule(s)`);
    }
  } catch { /* non-critical */ }

  // Clean up E2E reconciliation sources
  try {
    for (const year of [2024, 2025, 2026]) {
      const res = await fetch(`${BACKEND_URL}/reconciliation/sources?tax_year=${year}`, { headers });
      if (res.ok) {
        const sources = (await res.json()) as Array<{ id: string; issuer: string }>;
        const e2e = sources.filter((s) => s.issuer?.startsWith("E2E "));
        for (const src of e2e) {
          await fetch(`${BACKEND_URL}/reconciliation/sources/${src.id}`, { method: "DELETE", headers }).catch(() => {});
        }
        if (e2e.length > 0) console.log(`E2E teardown: deleted ${e2e.length} reconciliation source(s) for ${year}`);
      }
    }
  } catch { /* non-critical */ }

  // Clean up E2E documents (test PDFs)
  try {
    const res = await fetch(`${BACKEND_URL}/documents`, { headers });
    if (res.ok) {
      const docs = (await res.json()) as Array<{ id: string; file_name: string }>;
      const e2e = docs.filter((d) => d.file_name === "plumber-invoice.pdf");
      for (const doc of e2e) {
        await fetch(`${BACKEND_URL}/documents/${doc.id}`, { method: "DELETE", headers }).catch(() => {});
      }
      if (e2e.length > 0) console.log(`E2E teardown: deleted ${e2e.length} test document(s)`);
    }
  } catch { /* non-critical */ }

  // Clean up E2E tax returns (created by tax.spec.ts)
  try {
    const res = await fetch(`${BACKEND_URL}/tax-returns`, { headers });
    if (res.ok) {
      const returns = (await res.json()) as Array<{ id: string; filing_status: string }>;
      const e2e = returns.filter((r) => r.filing_status === "head_of_household");
      for (const ret of e2e) {
        await fetch(`${BACKEND_URL}/tax-returns/${ret.id}`, { method: "DELETE", headers }).catch(() => {});
      }
      if (e2e.length > 0) console.log(`E2E teardown: deleted ${e2e.length} test tax return(s)`);
    }
  } catch { /* non-critical */ }
}

function stopWorker(): void {
  if (!fs.existsSync(WORKER_PID_PATH)) return;

  const pid = parseInt(fs.readFileSync(WORKER_PID_PATH, "utf-8").trim(), 10);
  fs.unlinkSync(WORKER_PID_PATH);

  try {
    if (process.platform === "win32") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { execSync } = require("child_process");
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
