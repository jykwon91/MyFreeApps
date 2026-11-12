import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

interface CharacterCollapsibleSectionProps {
  title: string;
  /** What the section says while closed ("Unranked · 21 honorable kills"). */
  summary: string;
  defaultOpen: boolean;
  testId: string;
  children: ReactNode;
}

/** A sheet section whose heading opens and closes it; the summary keeps a closed one useful. */
export default function CharacterCollapsibleSection({
  title,
  summary,
  defaultOpen,
  testId,
  children,
}: CharacterCollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section aria-label={title} className="rounded-xl border bg-card" data-testid={testId}>
      <h2 className="text-lg font-semibold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex-1">{title}</span>
          <span className="text-sm font-normal text-muted-foreground" data-testid={`${testId}-summary`}>
            {summary}
          </span>
          <ChevronDown aria-hidden className={clsx("h-4 w-4 shrink-0", open && "rotate-180")} />
        </button>
      </h2>
      <div id={panelId} hidden={!open} className="space-y-3 border-t p-4">
        {children}
      </div>
    </section>
  );
}
