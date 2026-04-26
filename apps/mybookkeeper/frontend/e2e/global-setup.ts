import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BACKEND_URL, E2E_EMAIL, E2E_PASSWORD } from "./fixtures/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, ".auth-token");
const ORG_PATH = path.join(__dirname, ".auth-org");
const WORKER_PID_PATH = path.join(__dirname, ".worker-pid");
const BACKEND_DIR = path.resolve(__dirname, "../../backend");

function startWorker(): ChildProcess | null {
  const isWindows = process.platform === "win32";
  const python = isWindows
    ? path.join(BACKEND_DIR, ".venv", "Scripts", "python.exe")
    : path.join(BACKEND_DIR, ".venv", "bin", "python");

  if (!fs.existsSync(python)) {
    console.log(`E2E worker: skipped (venv not found at ${python})`);
    return null;
  }

  const worker = spawn(python, ["-m", "app.workers.upload_processor_worker"], {
    cwd: BACKEND_DIR,
    stdio: "ignore",
    detached: !isWindows,
  });

  fs.writeFileSync(WORKER_PID_PATH, String(worker.pid));
  console.log(`E2E worker: started (PID ${worker.pid})`);

  worker.unref();
  return worker;
}

async function tryExistingToken(): Promise<boolean> {
  if (!fs.existsSync(TOKEN_PATH)) return false;

  const token = fs.readFileSync(TOKEN_PATH, "utf-8").trim();
  if (!token) return false;

  try {
    const res = await fetch(`${BACKEND_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      console.log("E2E auth: reusing cached token");
      return true;
    }
  } catch {
    // Token invalid or backend down
  }
  return false;
}

async function login(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BACKEND_URL}/auth/jwt/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token;
}

async function register(email: string, password: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "E2E Test User" }),
  });
  if (!res.ok && res.status !== 400) {
    throw new Error(`E2E registration failed: ${res.status} ${await res.text()}`);
  }
  // 400 means user already exists — that's fine
}

async function promoteToAdmin(token: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/test/promote-admin`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) {
    console.log("E2E auth: promoted to admin");
  } else if (res.status === 404) {
    console.log("E2E auth: admin promotion endpoint not available (ALLOW_TEST_ADMIN_PROMOTION not set)");
  } else {
    console.warn(`E2E auth: admin promotion failed (${res.status})`);
  }
}

async function completeOnboarding(token: string, orgId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/tax-profile/complete-onboarding`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Organization-Id": orgId,
    },
    body: JSON.stringify({
      tax_situations: ["rental_property"],
      filing_status: "single",
      dependents_count: 0,
    }),
  });
  // 400/409 likely means already onboarded — that's fine
  if (!res.ok && res.status !== 400 && res.status !== 409) {
    throw new Error(`E2E onboarding failed: ${res.status} ${await res.text()}`);
  }
}

async function fetchOrCreateOrg(token: string): Promise<string> {
  const orgRes = await fetch(`${BACKEND_URL}/organizations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!orgRes.ok) {
    throw new Error(`E2E org fetch failed: ${orgRes.status} ${await orgRes.text()}`);
  }
  const orgs = await orgRes.json();

  if (orgs.length > 0) {
    fs.writeFileSync(ORG_PATH, orgs[0].id);
    console.log(`E2E auth: org acquired (${orgs[0].name})`);
    return orgs[0].id;
  }

  // No org exists — create one
  console.log("E2E auth: creating organization...");
  const createRes = await fetch(`${BACKEND_URL}/organizations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: "E2E Test Workspace" }),
  });
  if (!createRes.ok) {
    throw new Error(`E2E org creation failed: ${createRes.status} ${await createRes.text()}`);
  }
  const newOrg = await createRes.json();
  fs.writeFileSync(ORG_PATH, newOrg.id);
  console.log(`E2E auth: org created (${newOrg.name})`);
  return newOrg.id;
}

async function globalSetup() {
  // Reuse existing token if still valid
  if (await tryExistingToken()) {
    // Ensure admin role even with cached token (DB may have been reset)
    const cachedToken = fs.readFileSync(TOKEN_PATH, "utf-8").trim();
    await promoteToAdmin(cachedToken);
    startWorker();
    return;
  }

  const email = E2E_EMAIL;
  const password = E2E_PASSWORD;

  // Try login first
  let token = await login(email, password);

  if (!token) {
    // User doesn't exist — register, then login
    console.log("E2E auth: registering test user...");
    await register(email, password);
    token = await login(email, password);
    if (!token) {
      throw new Error("E2E auth: failed to login after registration");
    }
  }

  // Promote to admin — ensures the E2E user has admin role for admin page tests
  await promoteToAdmin(token);

  fs.writeFileSync(TOKEN_PATH, token);
  const orgId = await fetchOrCreateOrg(token);

  // Always attempt onboarding — idempotent, no-ops if already done
  await completeOnboarding(token, orgId);

  console.log("E2E auth: ready");

  startWorker();
}

export default globalSetup;
