import { formatMoney } from "@/lib/formatMoney";
import type { ToppingChipProps } from "@/types/public/ToppingChipProps";

export default function ToppingChip({ topping, selected, onClick }: ToppingChipProps) {
  const priceSuffix =
    Number(topping.price_delta) === 0 ? "" : ` +$${formatMoney(topping.price_delta)}`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "px-3 py-1 text-sm rounded-full border transition-colors",
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-input hover:bg-muted/50",
      ].join(" ")}
    >
      {topping.name}
      {priceSuffix}
    </button>
  );
}
