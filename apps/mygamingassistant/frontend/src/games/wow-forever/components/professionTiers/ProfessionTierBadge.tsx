import clsx from "clsx";

interface ProfessionTierBadgeProps {
  label: string;
  testId: string;
  className?: string;
}

/** A tier's name in a small outlined badge. */
export default function ProfessionTierBadge({ label, testId, className }: ProfessionTierBadgeProps) {
  return (
    <span
      data-testid={testId}
      className={clsx("inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium", className)}
    >
      {label}
    </span>
  );
}
