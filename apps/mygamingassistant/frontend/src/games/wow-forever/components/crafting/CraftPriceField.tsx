import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@platform/ui";
import { NOT_SOLD_YET, resetPriceLabel } from "@/games/wow-forever/crafting/autoPriceText";
import { formatPrice, parsePrice } from "@/games/wow-forever/crafting/matPrices";
import type { AutoPrice } from "@/games/wow-forever/types/autoPrice";

/** Commit this long after the last keystroke, so the route updates without waiting for blur. */
export const PRICE_DEBOUNCE_MS = 300;

interface CraftPriceFieldProps {
  itemId: number;
  name: string;
  /** Your own price in copper; undefined = use the automatic one. */
  value: number | undefined;
  /** The price nobody typed (auction, else worked out); undefined = there is none. */
  auto: AutoPrice | undefined;
  /** "Auction house", "From its materials" — where `auto` came from. */
  autoSource: string;
  /** The auction prices are in, so a missing price means nobody sells it yet (not "still loading"). */
  loaded: boolean;
  onCommit: (itemId: number, copper: number | null) => void;
  /** e.g. "3 make 1 Greater Astral Essence" — under the field. */
  hint?: string;
}

function toText(copper: number | undefined): string {
  if (copper === undefined) return "";
  return formatPrice(copper);
}

/** What the field read, so a bare "35" (= 35 silver) is never a guess, or where the price in it came from. */
function helperText(
  text: string,
  auto: AutoPrice | undefined,
  autoSource: string,
  loaded: boolean,
): { message: string; invalid: boolean } {
  if (text.trim() !== "") {
    const copper = parsePrice(text);
    if (copper === null) return { message: "Try 1g 20s", invalid: true };
    if (copper !== auto?.copper) return { message: `= ${formatPrice(copper)} · your price`, invalid: false };
  }
  if (auto) return { message: autoSource, invalid: false };
  if (loaded) return { message: NOT_SOLD_YET, invalid: false };
  return { message: "", invalid: false };
}

/**
 * One material's price, filled in automatically (its auction price, else one
 * worked out from other prices). Typing your own overrides it; commits on
 * blur, Enter, or a pause in typing.
 */
export default function CraftPriceField({ itemId, name, value, auto, autoSource, loaded, onCommit, hint }: CraftPriceFieldProps) {
  const id = useId();
  const shown = value ?? auto?.copper;
  const [text, setText] = useState(toText(shown));
  const [lastShown, setLastShown] = useState(shown);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow outside changes (new prices, Use auction prices for all, Undo) without fighting what's being typed.
  if (shown !== lastShown) {
    setLastShown(shown);
    const typed = parsePrice(text) ?? undefined;
    if (typed !== shown) setText(toText(shown));
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function cancelPending(): void {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function commit(next: string): void {
    cancelPending();
    // Emptying the field, or typing the automatic price, means "use the automatic price".
    if (next.trim() === "" || parsePrice(next) === auto?.copper) {
      if (value !== undefined) onCommit(itemId, null);
      return;
    }
    const copper = parsePrice(next);
    if (copper === null || copper === value) return;
    onCommit(itemId, copper);
  }

  function change(next: string): void {
    setText(next);
    cancelPending();
    timer.current = setTimeout(() => commit(next), PRICE_DEBOUNCE_MS);
  }

  function blur(next: string): void {
    commit(next);
    if (next.trim() === "") setText(toText(auto?.copper));
  }

  function reset(): void {
    cancelPending();
    setText(toText(auto?.copper));
    onCommit(itemId, null);
  }

  const helper = helperText(text, auto, autoSource, loaded);
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
        value={text}
        aria-invalid={helper.invalid || undefined}
        aria-describedby={`${id}-help`}
        onChange={(e) => change(e.target.value)}
        onBlur={(e) => blur(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
        }}
        className="border rounded-md px-3 py-2 text-sm min-h-[44px] w-full bg-card aria-[invalid=true]:border-red-500"
      />
      <div id={`${id}-help`} className="text-xs text-muted-foreground min-h-[1rem]">
        <p className={helper.invalid ? "text-destructive" : undefined}>{helper.message}</p>
        {hint ? <p>{hint}</p> : null}
      </div>
      {value === undefined ? null : (
        <Button variant="link" className="min-h-[44px] self-start h-auto px-0 text-xs whitespace-normal text-left" onClick={reset}>
          {resetPriceLabel(auto)}
        </Button>
      )}
    </div>
  );
}
