import { DIFF_CHANGE_DISPLAY } from "@myrecipes/api-client/constants/versions";
import type { DiffChangeKind } from "@myrecipes/api-client/types/recipe/diff";
import { CHANGE_STYLES } from "@/features/recipes/diff-display";
import DiffRowText from "@/features/recipes/DiffRowText";

interface Props {
  change: DiffChangeKind;
  /** What the line is about, shown before it ("Cook time"); omitted for ingredient and step lines. */
  label?: string;
  /** Text on the "before" side (null for an addition). */
  before: string | null;
  /** Text on the "after" side (null for a removal). */
  after: string | null;
}

/**
 * One diff line. Added rows show only the after text; removed rows show only
 * the before text (struck through); changed rows show before -> after so the
 * edit is obvious at a glance. Color comes from CHANGE_STYLES; the symbol and
 * label from DIFF_CHANGE_DISPLAY.
 */
export default function DiffRow({ change, label, before, after }: Props) {
  const style = CHANGE_STYLES[change];
  const display = DIFF_CHANGE_DISPLAY[change];

  return (
    <li className={`flex items-start gap-2 rounded-md border p-2.5 text-sm ${style.container}`}>
      <span
        className={`mt-0.5 w-4 shrink-0 text-center font-semibold ${style.symbolClass}`}
        aria-hidden
      >
        {display.symbol}
      </span>
      <span className="sr-only">{display.label}:</span>
      {label ? <span className="font-medium">{label}:</span> : null}
      <DiffRowText change={change} before={before} after={after} />
    </li>
  );
}
