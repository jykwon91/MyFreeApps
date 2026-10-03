import { cn } from "@platform/ui";
import { RAID_FOCUS_RING_CLASS } from "@/games/wow-forever/data/raidPage";
import { PLANNER_HOVER_CLASS } from "@/games/wow-forever/data/raidPlanner";

interface PublishSwitchProps {
  checked: boolean;
  disabled: boolean;
  /** The hint that says what it does. */
  describedBy: string;
  onChange: (checked: boolean) => void;
}

/** "Visible to raiders": the groups on the raid's web page, and [Groups] on its post — from the next Save. */
export default function PublishSwitch({ checked, disabled, describedBy, onChange }: PublishSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex min-h-[44px] items-center gap-2 rounded-md px-2 text-sm font-medium disabled:opacity-50",
        PLANNER_HOVER_CLASS,
        RAID_FOCUS_RING_CLASS,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none",
          trackClass(checked),
        )}
      >
        <span
          className={cn(
            "h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none",
            knobClass(checked),
          )}
        />
      </span>
      Visible to raiders
    </button>
  );
}

function trackClass(checked: boolean): string {
  if (checked) return "bg-emerald-600";
  return "bg-slate-300 dark:bg-slate-600";
}

function knobClass(checked: boolean): string {
  if (checked) return "translate-x-[22px]";
  return "translate-x-0.5";
}
