import { useEffect, useId, useRef, useState } from "react";
import { formatPrice, parsePrice } from "@/games/wow-forever/crafting/matPrices";

/** Commit this long after the last keystroke, so the route updates without waiting for blur. */
export const PRICE_DEBOUNCE_MS = 300;

interface CraftPriceFieldProps {
  itemId: number;
  name: string;
  /** Copper; undefined = no price entered. */
  value: number | undefined;
  onCommit: (itemId: number, copper: number | null) => void;
  /** e.g. "3 make 1 Greater Astral Essence" — under the field. */
  hint?: string;
}

function toText(value: number | undefined): string {
  if (value === undefined) return "";
  return formatPrice(value);
}

/** What the field read, so a bare "35" (= 35 silver) is never a guess. */
function helperText(text: string): { message: string; invalid: boolean } {
  if (text.trim() === "") return { message: "", invalid: false };
  const copper = parsePrice(text);
  if (copper === null) return { message: "Try 1g 20s", invalid: true };
  return { message: `= ${formatPrice(copper)}`, invalid: false };
}

/** One material's auction house price. Commits on blur, Enter, or a pause in typing. */
export default function CraftPriceField({ itemId, name, value, onCommit, hint }: CraftPriceFieldProps) {
  const id = useId();
  const [text, setText] = useState(toText(value));
  const [lastValue, setLastValue] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow outside changes (Clear prices, Undo) without fighting what's being typed.
  if (value !== lastValue) {
    setLastValue(value);
    const typed = parsePrice(text) ?? undefined;
    if (typed !== value) setText(toText(value));
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function commit(next: string): void {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (next.trim() === "") {
      if (value !== undefined) onCommit(itemId, null);
      return;
    }
    const copper = parsePrice(next);
    if (copper === null || copper === value) return;
    onCommit(itemId, copper);
  }

  function change(next: string): void {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), PRICE_DEBOUNCE_MS);
  }

  const helper = helperText(text);
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label htmlFor={id} className="text-sm font-medium break-words">
        {name}
      </label>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="e.g. 1g 20s"
        value={text}
        aria-invalid={helper.invalid || undefined}
        aria-describedby={`${id}-help`}
        onChange={(e) => change(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
        }}
        className="border rounded-md px-3 py-2 text-sm min-h-[44px] w-full bg-card aria-[invalid=true]:border-red-500"
      />
      <p id={`${id}-help`} className="text-xs text-muted-foreground min-h-[1rem]">
        <span className={helper.invalid ? "text-destructive" : undefined}>{helper.message}</span>
        {hint ? <span className="block">{hint}</span> : null}
      </p>
    </div>
  );
}
