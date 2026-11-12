import { RESUME_SESSION_STORAGE_KEY } from "@/constants/resume-session-storage";

/** The refinement session this browser was last working on, if any. */
export function readStoredResumeSession(): string | null {
  return localStorage.getItem(RESUME_SESSION_STORAGE_KEY);
}

/** Keeps the session so /resume reopens it. */
export function storeResumeSession(id: string): void {
  localStorage.setItem(RESUME_SESSION_STORAGE_KEY, id);
}

/** Forgets the session: on Start a different session, and when the account in this browser changes. */
export function forgetResumeSession(): void {
  localStorage.removeItem(RESUME_SESSION_STORAGE_KEY);
}
