import clsx from "clsx";
import type { AuctionChipOption } from "@/games/wow-forever/types/auctionHouse/auctionChipOption";

interface AuctionFilterChipsProps<T extends string> {
  legend: string;
  options: readonly AuctionChipOption<T>[];
  /** The chips that are on. */
  value: readonly T[];
  /** A chip was pressed; the caller decides whether that adds to or replaces the choice. */
  onToggle: (id: T) => void;
  testId: string;
}

/** A group of toggle chips (aria-pressed, 44px tall, wrapping on phones). */
export default function AuctionFilterChips<T extends string>({ legend, options, value, onToggle, testId }: AuctionFilterChipsProps<T>) {
  return (
    <fieldset className="min-w-0 space-y-1" data-testid={testId}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.id)}
              className={clsx(
                "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                on && "border-primary bg-primary text-primary-foreground",
                !on && "bg-card hover:bg-muted/40",
              )}
            >
              {o.swatch && <span className={clsx("size-3 shrink-0 rounded-full border-2", o.swatch)} aria-hidden />}
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
