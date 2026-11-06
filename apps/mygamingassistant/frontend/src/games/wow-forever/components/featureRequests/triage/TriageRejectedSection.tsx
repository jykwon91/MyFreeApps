import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import TriageRejectedRow from "@/games/wow-forever/components/featureRequests/triage/TriageRejectedRow";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";

interface TriageRejectedSectionProps {
  items: readonly TriageInboxItem[];
  onDismiss: (item: TriageInboxItem) => Promise<unknown>;
}

/** Collapsed at the bottom: "Rejected by Claude (n)" — rejected submissions and unanswered questions. */
export default function TriageRejectedSection({ items, onDismiss }: TriageRejectedSectionProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (items.length === 0) return null;
  return (
    <section className="space-y-2" data-section="rejected">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium"
      >
        <ChevronDown size={16} aria-hidden className={clsx("transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        {TRIAGE_COPY.rejectedSection} ({items.length})
      </button>
      {open ? (
        <ul id={listId} className="space-y-3">
          {items.map((item) => (
            <TriageRejectedRow key={item.submission_id} item={item} onDismiss={() => onDismiss(item)} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
