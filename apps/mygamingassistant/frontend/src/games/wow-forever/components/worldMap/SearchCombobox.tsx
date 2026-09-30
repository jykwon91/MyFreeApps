import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import clsx from "clsx";

export interface ComboOption {
  id: string;
  primary: string;
  secondary?: string;
}

export interface ComboGroup {
  label: string;
  options: readonly ComboOption[];
}

interface SearchComboboxProps {
  id: string;
  label: ReactNode;
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  groups: readonly ComboGroup[];
  /** An option was chosen (click, or Enter on the highlighted one). */
  onPick: (optionId: string) => void;
  /** Enter with nothing highlighted. Without it, Enter picks the first option. */
  onSubmit?: () => void;
  /** Shown under the box while it's open and nothing matches. */
  emptyText?: string;
  /** Extra ids for aria-describedby (an error or hint below the box). */
  describedBy?: string;
  invalid?: boolean;
  /** A button next to the box (e.g. "Set"). */
  action?: ReactNode;
  icon?: ReactNode;
}

/**
 * A text box with a list of suggestions under it (the ARIA combobox pattern):
 * type to filter, ↑/↓ to move, Enter to choose, Esc to close.
 */
export default function SearchCombobox(props: SearchComboboxProps) {
  const { id, label, placeholder, value, onValueChange, groups, onPick, onSubmit, emptyText } = props;
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const flat = groups.flatMap((g) => g.options);
  const expanded = open && value.trim() !== "" && (flat.length > 0 || emptyText !== undefined);
  const optionId = (index: number) => `${listId}-opt-${index}`;

  function choose(index: number) {
    const option = flat[index];
    if (!option) return;
    setOpen(false);
    setActive(-1);
    onPick(option.id);
  }

  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (!flat.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + flat.length) % flat.length);
      return;
    }
    if (e.key === "Escape" && expanded) {
      // The page's Esc (let go of a selection) shouldn't fire while the list closes.
      e.preventDefault();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (expanded && active >= 0) choose(active);
    else if (onSubmit) onSubmit();
    else choose(0);
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          {props.icon && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {props.icon}
            </span>
          )}
          <input
            id={id}
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
            aria-invalid={props.invalid || undefined}
            aria-describedby={props.describedBy}
            value={value}
            placeholder={placeholder}
            onChange={(e) => {
              onValueChange(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={keyDown}
            className={clsx(
              "w-full rounded-md border bg-card pr-3 text-sm min-h-[44px]",
              props.icon ? "pl-9" : "pl-3",
            )}
          />
          <div
            id={listId}
            role="listbox"
            aria-label="Suggestions"
            hidden={!expanded}
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border bg-card shadow-lg"
          >
            {flat.length === 0 && <p className="p-3 text-sm text-muted-foreground">{emptyText}</p>}
            {groups
              .filter((group) => group.options.length > 0)
              .map((group) => (
                <div key={group.label} role="group" aria-label={group.label}>
                  <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" aria-hidden>
                    {group.label}
                  </p>
                  {group.options.map((option) => {
                    const i = flat.indexOf(option);
                    return (
                      <div
                        key={option.id}
                        id={optionId(i)}
                        role="option"
                        aria-selected={i === active}
                        // Keep focus in the box so the click lands before blur closes the list.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(i)}
                        onMouseEnter={() => setActive(i)}
                        className={clsx("cursor-pointer px-3 py-2 min-h-[44px]", i === active && "bg-muted")}
                      >
                        <p className="text-sm font-medium">{option.primary}</p>
                        {option.secondary && <p className="text-xs text-muted-foreground">{option.secondary}</p>}
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>
        </div>
        {props.action}
      </div>
    </div>
  );
}
