import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import {
  SIGNED_LEASE_STATUS_BADGE_COLORS,
  SIGNED_LEASE_STATUS_LABELS,
  SIGNED_LEASE_STATUS_NEXT,
} from "@/shared/lib/lease-labels";
import type { SignedLeaseStatus } from "@/shared/types/lease/signed-lease-status";
import type { BadgeColor } from "@/shared/components/ui/Badge";
import SignedLeaseStatusBadge from "./SignedLeaseStatusBadge";

const COLOR_CLASSES: Record<BadgeColor, string> = {
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  green: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
};

export interface SignedLeaseStatusPickerProps {
  status: SignedLeaseStatus;
  onChange: (next: SignedLeaseStatus) => void;
  disabled?: boolean;
}

/**
 * Click-to-edit status badge for the lease detail header.
 *
 * Renders the current status as a coloured pill with a chevron to signal
 * interactivity. Clicking opens a Radix dropdown listing only the
 * statuses that are valid next states per ``SIGNED_LEASE_STATUS_NEXT``.
 * Picking a state fires ``onChange`` — the parent owns the mutation +
 * toast.
 *
 * For read-only contexts (``canWrite=false``) callers should use
 * ``SignedLeaseStatusBadge`` directly instead of passing
 * ``disabled={true}`` here.
 */
export default function SignedLeaseStatusPicker({
  status,
  onChange,
  disabled = false,
}: SignedLeaseStatusPickerProps) {
  const color = SIGNED_LEASE_STATUS_BADGE_COLORS[status];
  const nextStates = SIGNED_LEASE_STATUS_NEXT[status];
  const hasNextStates = nextStates.length > 0;
  const canOpen = !disabled && hasNextStates;
  const triggerLabel = SIGNED_LEASE_STATUS_LABELS[status];

  if (!canOpen) {
    return <SignedLeaseStatusBadge status={status} />;
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${COLOR_CLASSES[color]} hover:opacity-80 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          aria-label={`Change status from ${triggerLabel}`}
          data-testid="signed-lease-status-picker-trigger"
        >
          <span>{triggerLabel}</span>
          <ChevronDown size={12} className="shrink-0 opacity-70" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[160px] bg-card border rounded-lg shadow-lg p-1"
          sideOffset={4}
          align="start"
          data-testid="signed-lease-status-picker-menu"
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Move to
          </div>
          {nextStates.map((next) => (
            <DropdownMenu.Item
              key={next}
              className="px-3 py-2 text-sm rounded-md cursor-pointer outline-none hover:bg-muted focus:bg-muted"
              onSelect={() => onChange(next)}
              data-testid={`signed-lease-status-picker-option-${next}`}
            >
              {SIGNED_LEASE_STATUS_LABELS[next]}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
