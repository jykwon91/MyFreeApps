import type { PaymentMethodChipProps } from "@/types/public/PaymentMethodChipProps";

export default function PaymentMethodChip({ label, selected, onClick }: PaymentMethodChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "px-3 py-1.5 text-sm rounded border transition-colors",
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-input hover:bg-muted/50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
