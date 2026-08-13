export interface EquippedPlanFigureProps {
  label: string;
  value: string;
}

/**
 * One labelled figure inside the equipped-plan card's stat list.
 *
 * A `<dt>`/`<dd>` pair rather than two divs so the label stays bound to its
 * value for a screen reader reading the card's `<dl>` out of order.
 */
export default function EquippedPlanFigure({
  label,
  value,
}: EquippedPlanFigureProps) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium mt-0.5">{value}</dd>
    </div>
  );
}
