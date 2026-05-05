import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import {
  CALENDAR_FILTER_SOURCES,
  getSourceColor,
  getSourceLabel,
} from "@/shared/lib/calendar-constants";
import type { CalendarSource } from "@/shared/types/calendar/calendar-source";

export interface CalendarSourceFilterProps {
  selectedSources: readonly string[];
  onChange: (sources: string[]) => void;
}

function getTriggerLabel(selected: readonly string[]): string {
  if (selected.length === 0) return "All sources";
  if (selected.length === 1) return getSourceLabel(selected[0]);
  return `${selected.length} sources`;
}

/**
 * Multi-select dropdown for filtering by event source (channel).
 *
 * Mirrors PropertyMultiSelect's UX so the page feels consistent.
 * Selecting nothing == "all sources" (no filter applied).
 */
export default function CalendarSourceFilter({ selectedSources, onChange }: CalendarSourceFilterProps) {
  function handleCheck(source: CalendarSource, checked: boolean) {
    if (checked) {
      onChange([...selectedSources, source]);
    } else {
      onChange(selectedSources.filter((s) => s !== source));
    }
  }

  function handleSelectAll() {
    onChange([]);
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex items-center gap-2 h-9 px-3 border rounded-md text-sm bg-background hover:bg-muted transition-colors min-w-[140px] justify-between"
          aria-label="Filter by source"
          data-testid="source-filter-trigger"
        >
          <span className="truncate">{getTriggerLabel(selectedSources)}</span>
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[200px] bg-card border rounded-lg shadow-lg p-1"
          sideOffset={4}
          align="start"
        >
          <div className="flex gap-1 px-2 py-1">
            <DropdownMenu.Item
              className="text-xs text-primary hover:underline cursor-pointer outline-none"
              onSelect={(e) => {
                e.preventDefault();
                handleSelectAll();
              }}
            >
              All
            </DropdownMenu.Item>
          </div>
          <DropdownMenu.Separator className="h-px bg-border my-1" />
          {CALENDAR_FILTER_SOURCES.map((source) => {
            const checked = selectedSources.includes(source);
            return (
              <DropdownMenu.CheckboxItem
                key={source}
                checked={checked}
                onCheckedChange={(c) => handleCheck(source, c)}
                onSelect={(e) => e.preventDefault()}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer outline-none hover:bg-muted"
              >
                <DropdownMenu.ItemIndicator>
                  <span
                    className="block h-3.5 w-3.5 rounded border-2 border-primary bg-primary"
                    aria-hidden
                  />
                </DropdownMenu.ItemIndicator>
                {!checked && (
                  <span
                    className="block h-3.5 w-3.5 rounded border border-muted-foreground"
                    aria-hidden
                  />
                )}
                <span
                  className="inline-block h-3 w-3 rounded-sm shrink-0"
                  style={{ backgroundColor: getSourceColor(source) }}
                  aria-hidden
                />
                <span className="flex-1 truncate">{getSourceLabel(source)}</span>
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
