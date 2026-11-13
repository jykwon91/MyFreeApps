interface ExpandToggleProps {
  expanded: boolean;
  /** Id of the list this button reveals, for `aria-controls`. */
  controlsId: string;
  /** Button text while collapsed, e.g. "Show 2 more". */
  collapsedLabel: string;
  /** Button text while expanded, e.g. "Show fewer". */
  expandedLabel: string;
  onToggle: () => void;
}

/** The "Show N more" / "Show fewer" text button under a list that folds away its tail. */
export default function ExpandToggle({ expanded, controlsId, collapsedLabel, expandedLabel, onToggle }: ExpandToggleProps) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controlsId}
      onClick={onToggle}
      className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {expanded ? expandedLabel : collapsedLabel}
    </button>
  );
}
