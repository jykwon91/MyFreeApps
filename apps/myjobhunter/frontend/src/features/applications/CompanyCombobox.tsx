/**
 * CompanyCombobox — type-ahead picker for tracked companies, with
 * inline "+ Add" affordance for on-the-fly creation.
 *
 * This is the rare-case UI: the dialog's primary path is paste-URL
 * → AI extract → auto-create. The combobox is only shown when:
 *   1. The operator goes through the manual entry path (no URL/text)
 *   2. The operator clicks "not right? change" on the confirmation pill
 *   3. The auto-create failed and the dialog falls back to a typed name
 *
 * Implementation choices
 * ======================
 * No Radix Popover dep — we render a plain controlled `<input>` plus
 * a filtered list of companies + a "+ Add" row at the bottom. The
 * list is rendered inline below the input (not floating) because it
 * lives inside the AddApplicationDialog content region, where there
 * is room and the operator's eye is already there.
 *
 * Keyboard:
 *   - Up/Down arrows move the highlighted row through filtered
 *     companies and the "+ Add" row at the bottom
 *   - Enter on a highlighted row selects it
 *   - Enter when no row is highlighted but the typed name does not
 *     match any company → triggers create-on-the-fly
 *   - Esc clears the typed value (does NOT close the parent dialog)
 *
 * Selecting an existing row calls onSelect(companyId, name). Selecting
 * the "+ Add" row calls onCreate(name) and the parent is responsible
 * for invoking the createCompany mutation.
 */
import { useMemo, useRef, useState } from "react";
import { Plus, Building2 } from "lucide-react";
import type { Company } from "@/types/company";

const NO_HIGHLIGHT = -1;

export interface CompanyComboboxProps {
  /** All tracked companies (unfiltered — combobox does the filtering). */
  companies: Company[];
  /** Initial typed value — useful when the pill expands with the extracted name pre-populated. */
  initialValue?: string;
  /** Called when an existing company is picked. */
  onSelect: (companyId: string, name: string) => void;
  /** Called when the operator confirms a "+ Add <typed name>" row. */
  onCreate: (name: string) => void;
  /** True while a create is in flight — disables the "+ Add" row. */
  isCreating?: boolean;
  /** Auto-focus the input on mount. Default true. */
  autoFocus?: boolean;
  /** Show in amber error state (e.g., when an auto-create just failed). */
  errorState?: boolean;
  /** Esc handler if the parent wants to dismiss (e.g., re-collapse the pill). */
  onCancel?: () => void;
}

export default function CompanyCombobox({
  companies,
  initialValue = "",
  onSelect,
  onCreate,
  isCreating = false,
  autoFocus = true,
  errorState = false,
  onCancel,
}: CompanyComboboxProps) {
  // initialValue acts as the seed for the typed query. The parent is
  // expected to use a `key` prop to remount the combobox when it wants
  // to reseed (e.g., expanding the pill with a different extracted name).
  // This avoids the React 19 "set state during effect" cascade rule.
  const [query, setQuery] = useState(initialValue);
  const [rawHighlight, setHighlight] = useState<number>(NO_HIGHLIGHT);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => filterCompanies(companies, query), [companies, query]);

  const trimmed = query.trim();
  const exactMatch = filtered.find(
    (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const showAddRow = trimmed.length > 0 && !exactMatch;
  const addRowIndex = filtered.length;
  const totalRows = filtered.length + (showAddRow ? 1 : 0);

  // Clamp highlight to a valid index — when filtering changes the row
  // count, an out-of-range stored value is treated as "no highlight".
  // This is purely derived; no setState during render.
  const highlight =
    rawHighlight === NO_HIGHLIGHT || rawHighlight >= totalRows ? NO_HIGHLIGHT : rawHighlight;

  function commitHighlighted() {
    if (highlight === NO_HIGHLIGHT) {
      // No row highlighted — fall back to "+ Add" if the typed name is non-empty
      // and doesn't match any existing company.
      if (showAddRow) {
        onCreate(trimmed);
      } else if (exactMatch) {
        onSelect(exactMatch.id, exactMatch.name);
      }
      return;
    }
    if (highlight < filtered.length) {
      const company = filtered[highlight];
      onSelect(company.id, company.name);
      return;
    }
    if (showAddRow && highlight === addRowIndex) {
      onCreate(trimmed);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (totalRows === 0) return;
      setHighlight((h) => (h + 1) % totalRows);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (totalRows === 0) return;
      setHighlight((h) => (h <= 0 ? totalRows - 1 : h - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commitHighlighted();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (onCancel) onCancel();
      else setQuery("");
    }
  }

  const inputBorderClass = errorState
    ? "border-amber-400 focus-visible:ring-amber-400"
    : "border-input";

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a company name…"
        aria-label="Company name"
        autoFocus={autoFocus}
        className={`w-full border rounded-md px-3 py-2 text-sm bg-background ${inputBorderClass}`}
      />

      {totalRows > 0 ? (
        <ul
          role="listbox"
          aria-label="Matching companies"
          className="border rounded-md bg-background max-h-56 overflow-y-auto divide-y divide-border"
        >
          {filtered.map((company, idx) => (
            <CompanyRow
              key={company.id}
              company={company}
              highlighted={idx === highlight}
              onClick={() => onSelect(company.id, company.name)}
              onMouseEnter={() => setHighlight(idx)}
            />
          ))}
          {showAddRow ? (
            <AddCompanyRow
              name={trimmed}
              highlighted={addRowIndex === highlight}
              disabled={isCreating}
              onClick={() => onCreate(trimmed)}
              onMouseEnter={() => setHighlight(addRowIndex)}
            />
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filtering — case-insensitive substring match on name + primary_domain.
// ---------------------------------------------------------------------------

function filterCompanies(companies: Company[], query: string): Company[] {
  const q = query.trim().toLowerCase();
  if (!q) return companies.slice(0, MAX_VISIBLE_ROWS);
  const matches = companies.filter((c) => {
    const name = c.name.toLowerCase();
    const domain = (c.primary_domain ?? "").toLowerCase();
    return name.includes(q) || domain.includes(q);
  });
  return matches.slice(0, MAX_VISIBLE_ROWS);
}

const MAX_VISIBLE_ROWS = 8;

// ---------------------------------------------------------------------------
// Row sub-components — kept tiny so the parent reads top-down.
// ---------------------------------------------------------------------------

interface CompanyRowProps {
  company: Company;
  highlighted: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

function CompanyRow({ company, highlighted, onClick, onMouseEnter }: CompanyRowProps) {
  const baseClass = "flex items-center gap-2 px-3 py-2 cursor-pointer text-sm";
  const stateClass = highlighted ? "bg-muted" : "hover:bg-muted/60";
  return (
    <li
      role="option"
      aria-selected={highlighted}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`${baseClass} ${stateClass}`}
    >
      <CompanyAvatar logoUrl={company.logo_url} name={company.name} />
      <span className="flex-1 truncate">{company.name}</span>
      {company.primary_domain ? (
        <span className="text-xs text-muted-foreground truncate">
          {company.primary_domain}
        </span>
      ) : null}
    </li>
  );
}

interface AddCompanyRowProps {
  name: string;
  highlighted: boolean;
  disabled: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

function AddCompanyRow({
  name,
  highlighted,
  disabled,
  onClick,
  onMouseEnter,
}: AddCompanyRowProps) {
  const baseClass = "flex items-center gap-2 px-3 py-2 text-sm";
  const stateClass = disabled
    ? "text-muted-foreground cursor-not-allowed"
    : highlighted
      ? "bg-muted cursor-pointer"
      : "hover:bg-muted/60 cursor-pointer";
  return (
    <li
      role="option"
      aria-selected={highlighted}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={onMouseEnter}
      className={`${baseClass} ${stateClass}`}
    >
      <Plus size={14} className="shrink-0" />
      <span className="truncate">
        Add <span className="font-medium">{name}</span>
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Avatar — small logo with initial fallback.
// ---------------------------------------------------------------------------

interface CompanyAvatarProps {
  logoUrl: string | null;
  name: string;
}

function CompanyAvatar({ logoUrl, name }: CompanyAvatarProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="w-5 h-5 rounded-sm object-contain shrink-0 bg-muted"
        // If the logo URL fails, fall back to nothing — the name still renders.
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center w-5 h-5 rounded-sm bg-muted text-xs font-medium shrink-0"
    >
      {initial || <Building2 size={12} />}
    </span>
  );
}
