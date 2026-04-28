import { Check } from "lucide-react";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@/shared/lib/inquiry-date-format";
import type { ApplicantReference } from "@/shared/types/applicant/applicant-reference";

interface Props {
  reference: ApplicantReference;
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  landlord: "Previous landlord",
  employer: "Employer",
  personal: "Personal",
  professional: "Professional",
  family: "Family",
  other: "Other",
};

/**
 * Single reference row. Shows relationship, name, and contact, plus a
 * "Contacted" badge with timestamp if the host has marked it contacted.
 *
 * Per RENTALS_PLAN.md §9.1: contacted_at is the actionable signal — the
 * host should know at a glance which references they've already chased.
 */
export default function ReferenceRow({ reference }: Props) {
  const relationship =
    RELATIONSHIP_LABELS[reference.relationship] ?? reference.relationship;

  return (
    <li
      data-testid={`reference-row-${reference.id}`}
      className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b last:border-b-0 py-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{reference.reference_name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {relationship} · {reference.reference_contact}
        </p>
        {reference.notes ? (
          <p className="text-xs text-muted-foreground mt-1 italic">{reference.notes}</p>
        ) : null}
      </div>
      <div className="text-xs">
        {reference.contacted_at ? (
          <span
            className="inline-flex items-center gap-1 text-green-700 dark:text-green-400"
            title={formatAbsoluteTime(reference.contacted_at)}
          >
            <Check className="h-3 w-3" aria-hidden="true" />
            Contacted {formatRelativeTime(reference.contacted_at)}
          </span>
        ) : (
          <span className="text-muted-foreground">Not contacted yet</span>
        )}
      </div>
    </li>
  );
}
