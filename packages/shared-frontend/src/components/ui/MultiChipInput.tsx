import { useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

interface MultiChipInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Suggestions shown as one-tap chips below the input. Already-added
   *  values are filtered out automatically. */
  suggestions?: string[];
}

/**
 * Controlled multi-chip text input.
 *
 * Operator types a value, presses Enter (or comma), and the value
 * becomes a chip. Backspace on an empty input removes the last chip.
 *
 * Mobile-friendly: each chip's remove button is a 36px tap target.
 */
export default function MultiChipInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  suggestions,
}: MultiChipInputProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addValue(raw: string) {
    const cleaned = raw.trim();
    if (!cleaned) return;
    if (value.includes(cleaned)) return;
    onChange([...value, cleaned]);
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addValue(draft);
      setDraft("");
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      removeAt(value.length - 1);
    }
  }

  const availableSuggestions = (suggestions ?? []).filter(
    (s) => !value.includes(s),
  );

  return (
    <div>
      <div
        className="flex flex-wrap gap-1.5 items-center px-2 py-1.5 border border-input rounded-md bg-background min-h-[44px]"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((chip, i) => (
          <span
            key={`${chip}-${i}`}
            className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs"
          >
            <span>{chip}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(i);
              }}
              className="inline-flex items-center justify-center w-4 h-4 hover:text-destructive"
              aria-label={`Remove ${chip}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (draft.trim()) {
              addValue(draft);
              setDraft("");
            }
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          aria-label={ariaLabel}
          className="flex-1 min-w-[120px] bg-transparent text-sm focus:outline-none py-1"
        />
      </div>
      {availableSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {availableSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addValue(s)}
              className="px-2 py-0.5 text-xs border border-dashed border-muted-foreground/40 rounded text-muted-foreground hover:text-foreground hover:border-foreground"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
