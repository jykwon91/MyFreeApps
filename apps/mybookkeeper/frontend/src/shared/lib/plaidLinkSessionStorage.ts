import type { PlaidLinkSession } from "@/shared/types/plaid/plaid-link-session";
import { PLAID_LINK_SESSION_STORAGE_KEY } from "./session-storage-keys";

// Storage can be blocked; a failure reads as "no session" and Link simply
// can't resume after an OAuth bank, which /plaid-oauth explains.

function isSession(value: unknown): value is PlaidLinkSession {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.linkToken === "string"
    && candidate.linkToken.length > 0
    && (candidate.itemId === null || typeof candidate.itemId === "string")
    && (candidate.addInvestments === undefined || typeof candidate.addInvestments === "boolean");
}

export function readPlaidLinkSession(): PlaidLinkSession | null {
  try {
    const raw = localStorage.getItem(PLAID_LINK_SESSION_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function persistPlaidLinkSession(session: PlaidLinkSession): void {
  try {
    localStorage.setItem(PLAID_LINK_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // storage unavailable
  }
}

export function forgetPlaidLinkSession(): void {
  try {
    localStorage.removeItem(PLAID_LINK_SESSION_STORAGE_KEY);
  } catch {
    // storage unavailable
  }
}
