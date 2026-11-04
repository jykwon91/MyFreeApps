import type { ApplicantPromoteConflictDetail } from "../types/applicant/applicant-promote-conflict";

export function promoteConflictDetail(error: unknown): ApplicantPromoteConflictDetail | null {
  if (!error || typeof error !== "object") return null;
  const { status, data } = error as { status?: number; data?: { detail?: unknown } };
  if (status !== 409) return null;
  const detail = data?.detail;
  if (!detail || typeof detail !== "object") return null;
  const code = (detail as { code?: unknown }).code;
  return code === "already_promoted" || code === "not_promotable" ? (detail as ApplicantPromoteConflictDetail) : null;
}
