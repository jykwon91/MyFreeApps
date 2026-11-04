import { LEASE_ATTACHMENT_KIND_LABELS, SIGNED_LEASE_STATUS_LABELS, SIGNED_LEASE_STATUS_NEXT } from "@mybookkeeper/api-client/constants/leaseLabels";
import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";
import type { SignedLeaseStatus } from "@mybookkeeper/api-client/types/lease/signed-lease-status";
import { formatLongDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import { localToday } from "@mybookkeeper/api-client/utils/tenancyState";
import { LEASE_MESSAGES } from "../../constants/leases";

const DAY_MS = 86_400_000;
const IN_EFFECT: readonly SignedLeaseStatus[] = ["signed", "active"];

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function leaseIsInEffect(status: SignedLeaseStatus): boolean {
  return IN_EFFECT.includes(status);
}

export function leaseTerm(startsOn: string | null, endsOn: string | null): string {
  if (startsOn && endsOn) return `${formatLongDate(startsOn)} to ${formatLongDate(endsOn)}`;
  if (endsOn) return `Through ${formatLongDate(endsOn)}`;
  return startsOn ? `From ${formatLongDate(startsOn)}` : LEASE_MESSAGES.noDates;
}

/**
 * How long is left, by the host's own date. A terminated lease ended early and one still being
 * prepared hasn't begun, so its end date says nothing about either.
 */
export function leaseCountdown(status: SignedLeaseStatus, endsOn: string | null, today: string = localToday()): string | null {
  if (!endsOn || !(leaseIsInEffect(status) || status === "ended")) return null;
  const days = daysBetween(today, endsOn);
  if (days > 1) return status === "ended" ? null : `Ends in ${days} days`;
  if (days === 1) return status === "ended" ? null : "Ends tomorrow";
  if (days === 0) return "Ends today";
  return days === -1 ? "Ended yesterday" : `Ended ${-days} days ago`;
}

/**
 * Generating the document is website-only, and a draft's values lock once it leaves draft. Marking
 * one generated from the phone would lock it with no document, so a draft offers no moves here.
 */
export function leaseStatusMoves(status: SignedLeaseStatus): readonly SignedLeaseStatus[] {
  if (status === "draft") return [];
  // An installed app can be older than the server, and a status it doesn't know offers no moves.
  return SIGNED_LEASE_STATUS_NEXT[status] ?? [];
}

/** Nothing moves on from these, so a wrong tap couldn't be put right. */
export function leaseStatusIsFinal(status: SignedLeaseStatus): boolean {
  return SIGNED_LEASE_STATUS_NEXT[status].length === 0;
}

export function leaseStatusLabel(status: SignedLeaseStatus): string {
  return SIGNED_LEASE_STATUS_LABELS[status];
}

export function leaseFileLine(file: SignedLeaseAttachment): string {
  return `${LEASE_ATTACHMENT_KIND_LABELS[file.kind]}, ${formatLongDate(file.uploaded_at)}`;
}

/** The newest signed copy, then everything else a host would open. Rent receipts have their own home. */
export function sortLeaseFiles(files: readonly SignedLeaseAttachment[]): {
  signedCopy: SignedLeaseAttachment | null;
  others: SignedLeaseAttachment[];
} {
  const newestFirst = files
    .filter((file) => file.kind !== "rent_receipt")
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  const signedCopy = newestFirst.find((file) => file.kind === "signed_lease") ?? null;
  return { signedCopy, others: newestFirst.filter((file) => file !== signedCopy) };
}
