import { useState } from "react";
import type { SavingsIdea } from "@mybookkeeper/api-client/types/savings/savings-idea";
import { formatSavingsDate, formatSavingsRange } from "@mybookkeeper/api-client/utils/savingsFormat";
import Badge from "@/shared/components/ui/Badge";
import { SAVINGS_CATEGORY_LABELS, SAVINGS_EFFORT_LABELS, SAVINGS_MESSAGES as MSG } from "@/shared/lib/savings-messages";
import SavingsIdeaDetails from "./SavingsIdeaDetails";

export interface SavingsIdeaCardProps {
  idea: SavingsIdea;
}

/** One idea: its title, yearly saving, category and effort; opens to the details. */
export default function SavingsIdeaCard({ idea }: SavingsIdeaCardProps) {
  const [open, setOpen] = useState(false);
  const detailsId = `savings-idea-${idea.id}-details`;

  return (
    <li className="border rounded-lg bg-card" data-testid={`savings-idea-${idea.id}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((was) => !was)}
        className="w-full min-h-[44px] px-4 py-3 text-left space-y-2"
        data-testid="savings-idea-toggle"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="font-medium">{idea.title}</span>
          <span className="shrink-0 tabular-nums font-semibold" data-testid="savings-idea-amount">
            {formatSavingsRange(idea.savings_low_cents, idea.savings_high_cents)}
          </span>
        </span>
        <span className="flex flex-wrap gap-2">
          <Badge label={SAVINGS_CATEGORY_LABELS[idea.category]} color="blue" />
          <Badge label={SAVINGS_EFFORT_LABELS[idea.effort]} color="gray" />
          {idea.expires_on !== null ? <Badge label={MSG.expires(formatSavingsDate(idea.expires_on))} color="orange" /> : null}
        </span>
      </button>
      {open ? <SavingsIdeaDetails idea={idea} id={detailsId} /> : null}
    </li>
  );
}
