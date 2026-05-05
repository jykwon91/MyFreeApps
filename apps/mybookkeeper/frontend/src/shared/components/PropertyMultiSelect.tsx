import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import type { Property } from "@/shared/types/property/property";

export interface PropertyMultiSelectProps {
  properties: Property[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  maxSelected?: number;
}

function getTriggerLabel(properties: Property[], selectedIds: string[]): string {
  if (selectedIds.length === 0) return "All Properties";
  if (selectedIds.length === 1) {
    const prop = properties.find((p) => p.id === selectedIds[0]);
    return prop?.name ?? "1 property";
  }
  return `${selectedIds.length} properties`;
}

export default function PropertyMultiSelect({ properties, selectedIds, onChange, maxSelected }: PropertyMultiSelectProps) {
  function handleCheck(id: string, checked: boolean) {
    if (checked) {
      if (maxSelected !== undefined && selectedIds.length >= maxSelected) return;
      onChange([...selectedIds, id]);
    } else {
      onChange(selectedIds.filter((s) => s !== id));
    }
  }

  function handleSelectAll() {
    onChange([]);
  }

  function handleClear() {
    onChange([]);
  }

  const atMax = maxSelected !== undefined && selectedIds.length >= maxSelected;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex items-center gap-2 h-9 px-3 border rounded-md text-sm bg-background hover:bg-muted transition-colors min-w-[140px] justify-between"
          aria-label="Filter by property"
          data-testid="property-filter-trigger"
        >
          <span className="truncate">{getTriggerLabel(properties, selectedIds)}</span>
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
              onSelect={(e) => { e.preventDefault(); handleSelectAll(); }}
            >
              All
            </DropdownMenu.Item>
            <span className="text-xs text-muted-foreground">·</span>
            <DropdownMenu.Item
              className="text-xs text-muted-foreground hover:underline cursor-pointer outline-none"
              onSelect={(e) => { e.preventDefault(); handleClear(); }}
            >
              Clear
            </DropdownMenu.Item>
          </div>
          <DropdownMenu.Separator className="h-px bg-border my-1" />
          {atMax && (
            <p className="px-3 py-1 text-xs text-muted-foreground">
              Max {maxSelected} properties
            </p>
          )}
          {properties.map((prop) => {
            const checked = selectedIds.includes(prop.id);
            const disabled = !checked && atMax;
            return (
              <DropdownMenu.CheckboxItem
                key={prop.id}
                checked={checked}
                onCheckedChange={(c) => handleCheck(prop.id, c)}
                onSelect={(e) => e.preventDefault()}
                disabled={disabled}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer outline-none hover:bg-muted data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed"
              >
                <DropdownMenu.ItemIndicator>
                  <span className="block h-3.5 w-3.5 rounded border-2 border-primary bg-primary" aria-hidden />
                </DropdownMenu.ItemIndicator>
                {!checked && (
                  <span className="block h-3.5 w-3.5 rounded border border-muted-foreground" aria-hidden />
                )}
                <span className="flex-1 truncate">{prop.name}</span>
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
