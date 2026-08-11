import { CalendarDays, Rows3 } from "lucide-react";
import { CALENDAR_VIEW_OPTIONS } from "@/shared/lib/calendar-constants";
import type { CalendarView } from "@/shared/types/calendar/calendar-view";

export interface CalendarViewToggleProps {
  view: CalendarView;
  onChange: (view: CalendarView) => void;
}

const ICONS = { month: CalendarDays, timeline: Rows3 } as const;

/**
 * `[Month | Timeline]` segmented control.
 *
 * The two views answer different questions — "what's happening this month"
 * vs. "which room is free" — so this is a real mode switch, not a
 * cosmetic preference. The choice lives in the URL so a shared link opens on
 * the view the sender was looking at.
 */
export default function CalendarViewToggle({ view, onChange }: CalendarViewToggleProps) {
  return (
    <div
      className="flex items-center rounded-md border p-0.5"
      role="group"
      aria-label="Calendar view"
      data-testid="calendar-view-toggle"
    >
      {CALENDAR_VIEW_OPTIONS.map(({ value, label }) => {
        const Icon = ICONS[value];
        const active = view === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={
              active
                ? "flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium bg-primary text-primary-foreground"
                : "flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium hover:bg-muted transition-colors"
            }
            aria-pressed={active}
            data-testid={`calendar-view-${value}`}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
