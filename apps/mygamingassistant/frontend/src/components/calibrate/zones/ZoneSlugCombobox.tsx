/**
 * ZoneSlugCombobox — slug picker with backend-registered slugs + "add new" affordance.
 *
 * Pulls the available `MapZone` slugs from `/api/games/cs2/maps/{slug}` (when
 * the parent passes them in) and shows them in a datalist + select fallback.
 * If the operator types a slug NOT in the list, the parent wraps the
 * polygon's chip with a "warn" badge so they know it won't match anything
 * on the backend side.
 */
import type { ChangeEvent } from "react";

interface ZoneSlugComboboxProps {
  id?: string;
  value: string;
  /** Slugs already registered for this map on the backend. */
  availableSlugs: string[];
  /** True when `value` isn't in `availableSlugs` (parent decides what to do). */
  isUnregistered: boolean;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function ZoneSlugCombobox({
  id = "zone-slug-input",
  value,
  availableSlugs,
  isUnregistered,
  onChange,
  disabled,
}: ZoneSlugComboboxProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    // Normalize to kebab-case lowercase + strip spaces — slugs in the
    // backend are always slugified.
    const normalized = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    onChange(normalized);
  }

  const listId = `${id}-list`;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        Slug
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={handleChange}
        list={listId}
        disabled={disabled}
        placeholder="a-site"
        className="w-full px-2 py-1 rounded-md border bg-background text-sm min-h-[36px] font-mono"
      />
      <datalist id={listId}>
        {availableSlugs.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {value && isUnregistered && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          New slug — not yet registered on the backend. Lineups won't filter
          to this zone in live mode until you add a matching <code>MapZone</code>
          on the server.
        </p>
      )}
    </div>
  );
}
