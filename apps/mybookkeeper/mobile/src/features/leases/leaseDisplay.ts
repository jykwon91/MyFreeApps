import { LEASE_ATTACHMENT_KIND_LABELS, SIGNED_LEASE_STATUS_LABELS, SIGNED_LEASE_STATUS_NEXT } from "@mybookkeeper/api-client/constants/leaseLabels";
import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";
import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import type { SignedLeaseStatus } from "@mybookkeeper/api-client/types/lease/signed-lease-status";
import { formatLongDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import { leaseValueText } from "@mybookkeeper/api-client/utils/leasePlaceholderValue";
import { localToday } from "@mybookkeeper/api-client/utils/localToday";
import { LEASE_DETAIL_MESSAGES, madeOn, signedOn } from "../../constants/leaseDetails";
import { LEASE_MESSAGES } from "../../constants/leases";

const DAY_MS = 86_400_000;
const IN_EFFECT: readonly SignedLeaseStatus[] = ["signed", "active"];
const CAN_HAVE_SUCCESSOR: readonly SignedLeaseStatus[] = ["signed", "active", "ended"];

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function leaseIsInEffect(status: SignedLeaseStatus): boolean {
  return IN_EFFECT.includes(status);
}

/** A draft or sent lease is still edited in place, and a terminated one is closed for good. */
export function leaseCanHaveSuccessor(lease: Pick<SignedLeaseDetail, "status" | "successor_lease_id">): boolean {
  return CAN_HAVE_SUCCESSOR.includes(lease.status) && lease.successor_lease_id === null;
}

/**
 * Making files moves a lease to generated, whatever it was, so it's only offered
 * before the lease goes out. A sent or signed lease would quietly lose its status.
 */
export function leaseNeedsFiles(lease: Pick<SignedLeaseDetail, "kind" | "status" | "attachments">): boolean {
  return lease.kind === "generated" && (lease.status === "draft" || (lease.status === "generated" && lease.attachments.length === 0));
}

/** Same rule as the server's `should_auto_email_after_generate`. */
export function leaseEmailsOnGenerate(lease: Pick<SignedLeaseDetail, "auto_email_tenant" | "status" | "last_emailed_to_tenant_at">): boolean {
  return lease.auto_email_tenant && lease.status !== "generated" && !lease.last_emailed_to_tenant_at;
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
 * A draft's values lock once it leaves draft, and its files are made with the lease page's "make
 * the files" button. Moving a draft by status would lock it with no document, so it offers no moves.
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

/** The same kinds the server attaches, so the button never promises an empty email. */
export function leaseHasEmailableFile(files: readonly SignedLeaseAttachment[]): boolean {
  return files.some((file) => file.kind === "rendered_original" || file.kind === "signed_lease");
}

/** The newest signed copy, then every other file, newest first. */
export function sortLeaseFiles(files: readonly SignedLeaseAttachment[]): {
  signedCopy: SignedLeaseAttachment | null;
  others: SignedLeaseAttachment[];
} {
  const newestFirst = [...files].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  const signedCopy = newestFirst.find((file) => file.kind === "signed_lease") ?? null;
  return { signedCopy, others: newestFirst.filter((file) => file !== signedCopy) };
}

export function leaseKindLabel(kind: SignedLeaseDetail["kind"]): string {
  return kind === "imported" ? LEASE_DETAIL_MESSAGES.kindImported : LEASE_DETAIL_MESSAGES.kindGenerated;
}

/** When it was made and signed, for the lines that have a date. */
export function leaseDatesLine(lease: Pick<SignedLeaseDetail, "generated_at" | "signed_at">): string | null {
  const parts = [lease.generated_at ? madeOn(formatLongDate(lease.generated_at)) : null, lease.signed_at ? signedOn(formatLongDate(lease.signed_at)) : null];
  return parts.filter(Boolean).join(" · ") || null;
}

/** "tenant_name" reads as "Tenant name". */
export function leaseValueLabel(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function leaseValueRows(values: SignedLeaseDetail["values"]): { key: string; label: string; text: string }[] {
  return Object.entries(values).map(([key, value]) => ({ key, label: leaseValueLabel(key), text: leaseValueText(value) }));
}
