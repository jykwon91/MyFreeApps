import { ArrowRight } from "lucide-react";
import type { DiffChangeKind } from "@/types/recipe/diff";
import { CHANGE_STYLES } from "@/features/recipes/diff-display";

interface Props {
  change: DiffChangeKind;
  /** Text on the "before" side (null for an addition). */
  before: string | null;
  /** Text on the "after" side (null for a removal). */
  after: string | null;
}

/**
 * One diff line. Added rows show only the after text; removed rows show only
 * the before text (struck through); changed rows show before -> after so the
 * edit is obvious at a glance. Color + symbol come from CHANGE_STYLES.
 */
export default function DiffRow({ change, before, after }: Props) {
  const style = CHANGE_STYLES[change];

  return (
    <li className={`flex items-start gap-2 rounded-md border p-2.5 text-sm ${style.container}`}>
      <span
        className={`mt-0.5 w-4 shrink-0 text-center font-semibold ${style.symbolClass}`}
        aria-hidden
      >
        {style.symbol}
      </span>
      <span className="sr-only">{style.label}:</span>
      {change === "changed" ? (
        <span className="flex flex-1 flex-wrap items-center gap-2">
          <span className="text-muted-foreground line-through">{before}</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
          <span className="font-medium">{after}</span>
        </span>
      ) : change === "removed" ? (
        <span className="flex-1 text-muted-foreground line-through">{before}</span>
      ) : (
        <span className="flex-1 font-medium">{after}</span>
      )}
    </li>
  );
}
