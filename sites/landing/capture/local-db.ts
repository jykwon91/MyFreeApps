/**
 * Direct SQL against an app's LOCAL demo database, for the few things no API
 * exposes (marking the demo account's email verified, finding the MyJobHunter
 * refinement session). The connection comes from the app's own gitignored
 * backend/.env — the same DATABASE_URL the local backend runs on — so no
 * credential lives in this directory. Never point an app's .env at a shared
 * or deployed database while capturing.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type SeededApp = "mybookkeeper" | "myjobhunter" | "myrecipes";

const APPS_DIR = path.resolve(__dirname, "..", "..", "..", "apps");

function databaseUrl(app: SeededApp): URL {
  const envPath = path.join(APPS_DIR, app, "backend", ".env");
  const line = readFileSync(envPath, "utf-8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error(`DATABASE_URL is not set in ${envPath}`);
  const url = new URL(line.slice("DATABASE_URL=".length).trim());
  if (!url.pathname.slice(1).startsWith("portfolio_demo_")) {
    throw new Error(`${envPath} must point at a portfolio_demo_* database, not ${url.pathname.slice(1)}`);
  }
  return url;
}

function psqlPath(): string {
  if (process.env.PSQL_PATH) return process.env.PSQL_PATH;
  const installed = ["18", "17"]
    .map((v) => `C:\\Program Files\\PostgreSQL\\${v}\\bin\\psql.exe`)
    .find((p) => existsSync(p));
  return installed ?? "psql";
}

/** Runs `sql` and returns the unaligned, tuples-only output, trimmed. */
export function psql(app: SeededApp, sql: string): string {
  const url = databaseUrl(app);
  return execFileSync(
    psqlPath(),
    [
      "-h", url.hostname,
      "-p", url.port || "5432",
      "-U", decodeURIComponent(url.username),
      "-d", url.pathname.slice(1),
      "-v", "ON_ERROR_STOP=1",
      "-t", "-A",
      "-c", sql,
    ],
    { env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) }, stdio: "pipe" },
  )
    .toString()
    .trim();
}

/** Registration emails go nowhere locally, so verify the demo account directly. */
export function markEmailVerified(app: SeededApp, email: string): void {
  psql(app, `UPDATE users SET is_verified = true WHERE email = '${email}';`);
}
