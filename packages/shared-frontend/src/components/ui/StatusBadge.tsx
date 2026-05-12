export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface StatusBadgeProps {
  tone: BadgeTone;
  label: string;
  className?: string;
  "data-testid"?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  success: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

/**
 * Shared status pill used across apps. Drives color from a semantic `tone` prop
 * rather than a raw color string, keeping domain-specific status→tone mapping in
 * the per-feature wrapper (e.g. InviteStatusBadge, SignedLeaseStatusBadge).
 */
export default function StatusBadge({ tone, label, className, "data-testid": testId }: StatusBadgeProps) {
  const base = `inline-block px-2 py-0.5 rounded text-xs font-medium ${TONE_CLASSES[tone]}`;
  return (
    <span className={className ? `${base} ${className}` : base} data-testid={testId}>
      {label}
    </span>
  );
}
