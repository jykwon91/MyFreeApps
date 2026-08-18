import {
  formatLoanDate,
  formatMoneyCents,
  formatRatePct,
} from "@/shared/lib/mortgage-format";
import type { Mortgage } from "@/shared/types/mortgage/mortgage";
import type { MortgagesListMode } from "@/shared/types/mortgage/mortgages-list-mode";

export interface MortgagesListBodyProps {
  mode: MortgagesListMode;
  mortgages: Mortgage[];
  onEdit: (mortgage: Mortgage) => void;
}

/**
 * The loans on record.
 *
 * A row leads with the property and the rate, because those are what the
 * section below compares. An ARM says so on its face — it is the one label
 * that changes whether the comparison applies at all, and burying it inside
 * the edit dialog is how a loan silently drops out of the check.
 */
export default function MortgagesListBody({
  mode,
  mortgages,
  onEdit,
}: MortgagesListBodyProps) {
  switch (mode) {
    case "loading":
      return (
        <div
          className="space-y-2 animate-pulse"
          aria-busy="true"
          data-testid="mortgages-loading"
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-4 space-y-2">
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-4 bg-muted rounded w-1/3" />
            </div>
          ))}
        </div>
      );

    case "empty":
      return (
        <p className="text-sm text-muted-foreground" data-testid="mortgages-empty">
          No mortgages yet. Add one — a photo of your latest statement is enough
          — and this page will tell you whether it&apos;s worth refinancing.
        </p>
      );

    case "list":
      return (
        <ul className="space-y-2" data-testid="mortgages-list">
          {mortgages.map((mortgage) => (
            <li key={mortgage.id} className="border rounded-lg px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onEdit(mortgage)}
                    className="font-medium text-primary hover:underline block truncate text-left min-h-[44px] sm:min-h-0"
                    data-testid={`mortgage-item-${mortgage.id}`}
                  >
                    {mortgage.property_name ?? "Unassigned property"}
                  </button>
                  {mortgage.lender ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {mortgage.lender}
                    </p>
                  ) : null}
                  {mortgage.statement_date ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Balance as of {formatLoanDate(mortgage.statement_date)}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className="font-semibold"
                    data-testid={`mortgage-rate-${mortgage.id}`}
                  >
                    {formatRatePct(mortgage.interest_rate)}
                  </span>
                  {mortgage.rate_type === "arm" ? (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-700 dark:text-amber-400"
                      data-testid={`mortgage-arm-badge-${mortgage.id}`}
                    >
                      Adjustable
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {formatMoneyCents(mortgage.current_balance_cents)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      );
  }
}
