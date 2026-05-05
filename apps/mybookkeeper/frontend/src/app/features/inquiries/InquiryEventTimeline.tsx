import { useState } from "react";
import { ChevronDown, ChevronRight, User, Server, Mail } from "lucide-react";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@/shared/lib/inquiry-date-format";
import { INQUIRY_STAGE_LABELS } from "@/shared/lib/inquiry-labels";
import type { InquiryEvent } from "@/shared/types/inquiry/inquiry-event";
import type { InquiryEventActor } from "@/shared/types/inquiry/inquiry-event-actor";
import type { InquiryStage } from "@/shared/types/inquiry/inquiry-stage";

const ACTOR_ICONS: Record<InquiryEventActor, typeof User> = {
  host: User,
  system: Server,
  applicant: Mail,
};

const ACTOR_LABELS: Record<InquiryEventActor, string> = {
  host: "You",
  system: "System",
  applicant: "Inquirer",
};

export interface InquiryEventTimelineProps {
  events: InquiryEvent[];
  /**
   * Default-collapsed per RENTALS_PLAN.md §9.1 detail-page hierarchy — the
   * timeline is reference data, not the primary task.
   */
  defaultOpen?: boolean;
}

/**
 * ``event_type`` is a free-form string in the schema (it's the stage name OR
 * the seed ``"received"`` token). We match against the stage labels for a
 * polished display, with a graceful capitalised fallback for anything
 * unexpected (e.g. PR 2.2 may add ``"replied"`` events from the email
 * pipeline, which is already in the stage list).
 */
function formatEventType(eventType: string): string {
  if (eventType === "received") return "Received";
  if (eventType in INQUIRY_STAGE_LABELS) {
    return `Moved to ${INQUIRY_STAGE_LABELS[eventType as InquiryStage]}`;
  }
  return eventType.charAt(0).toUpperCase() + eventType.slice(1);
}

export default function InquiryEventTimeline({ events, defaultOpen = false }: InquiryEventTimelineProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border rounded-lg" data-testid="inquiry-event-timeline">
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
                    <span className="text-muted-foreground">— {formatEventType(evt.event_type)}</span>
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
