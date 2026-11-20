/**
 * CompanyConfirmationPill — readonly display of the company that was
 * auto-selected (or auto-created) from the JD extract step.
 *
 * Variants
 * ========
 * - "tracked":  green-ish neutral pill, "tracked" badge — company already
 *               existed in the operator's list, we just selected it.
 * - "new":      neutral pill — a company not tracked yet; saving the
 *               application adds it (nothing is added before then).
 * - "error":    amber border + "couldn't auto-create — type a name" hint.
 *               Used when the auto-create threw and we need the operator
 *               to retry / correct via the combobox below.
 *
 * The pill is a CONFIRMATION, not an editor. It exposes a single
 * "not right? change" affordance that, when clicked, asks the parent
 * to expand the combobox in its place.
 */
import type { CompanyPillVariant } from "@/types/company/company-pill-variant";
import CompanyLogo from "@/features/applications/CompanyLogo";
import CompanyPillBadge from "@/features/applications/CompanyPillBadge";

export interface CompanyConfirmationPillProps {
  /** Display name. Required. */
  name: string;
  /** Optional logo URL — falls back to a building icon if unset / fails. */
  logoUrl: string | null;
  /** Variant — controls badge text + border color. */
  variant: CompanyPillVariant;
  /** Click handler for the "change" / "type a name" affordance. */
  onChangeRequest: () => void;
}

export default function CompanyConfirmationPill({
  name,
  logoUrl,
  variant,
  onChangeRequest,
}: CompanyConfirmationPillProps) {
  const borderClass = pickBorderClass(variant);
  return (
    <div
      className={`flex items-center gap-3 rounded-md border ${borderClass} bg-muted/30 px-3 py-2`}
    >
      <CompanyLogo logoUrl={logoUrl} name={name} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
          <CompanyPillBadge variant={variant} />
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onChangeRequest}
            className="underline hover:text-foreground"
          >
            {variant === "error" ? "couldn't auto-create — type a name" : "not right? change"}
          </button>
        </p>
      </div>
    </div>
  );
}

function pickBorderClass(variant: CompanyPillVariant): string {
  if (variant === "error") return "border-amber-400";
  if (variant === "tracked") return "border-green-500/40";
  return "border-border";
}
