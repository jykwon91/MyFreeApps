import { useState } from "react";
import { ChevronDown, ChevronRight, Mail, Server, User } from "lucide-react";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import { applicantEventLabel } from "@mybookkeeper/api-client/utils/applicantEvents";
import type { ApplicantEvent } from "@mybookkeeper/api-client/types/applicant/applicant-event";
import type { ApplicantEventActor } from "@mybookkeeper/api-client/types/applicant/applicant-event-actor";

const ACTOR_ICONS: Record<ApplicantEventActor, typeof User> = {
  host: User,
  system: Server,
  applicant: Mail,
};

const ACTOR_LABELS: Record<ApplicantEventActor, string> = {
  host: "You",
  system: "System",
  applicant: "Applicant",
};

export interface ApplicantTimelineListProps {
  events: ApplicantEvent[];
  /**
   * Default-collapsed per RENTALS_PLAN.md §9.1 detail-page hierarchy — the
   * timeline is reference data, not the primary task.
   */
  defaultOpen?: boolean;
}

/**
 * Vertical timeline of applicant events. Mirrors ``InquiryEventTimeline``.
 * Read-only — the host-driven event sources (note_added, screening_*,
 * reference_contacted) ship in PR 3.3 / 3.4.
 */
export default function ApplicantTimelineList({ events, defaultOpen = false }: ApplicantTimelineListProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border rounded-lg" data-testid="applicant-timeline">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium min-h-[44px]"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Activity timeline
          <span className="text-xs text-muted-foreground">({events.length})</span>
        </span>
      </button>
      {open ? (
        <ol className="px-4 pb-4 space-y-3">
          {events.map((evt) => {
            const Icon = ACTOR_ICONS[evt.actor];
            return (
              <li key={evt.id} className="flex items-start gap-3">
                <div className="mt-0.5 h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{ACTOR_LABELS[evt.actor]}</span>{" "}
                    <span className="text-muted-foreground">— {applicantEventLabel(evt.event_type)}</span>
                  </p>
                  {evt.notes ? (
                    <p className="text-xs text-muted-foreground mt-0.5">{evt.notes}</p>
                  ) : null}
                  <p
                    className="text-xs text-muted-foreground mt-0.5"
                    title={formatAbsoluteTime(evt.occurred_at)}
                  >
                    {formatRelativeTime(evt.occurred_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
