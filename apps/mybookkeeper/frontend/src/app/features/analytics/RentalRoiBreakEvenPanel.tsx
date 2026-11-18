import { Link } from "react-router-dom";
import { Panel, PanelCloseButton, PanelTitle } from "@platform/ui";
import {
  RENTAL_ROI_BREAKDOWN_MESSAGES as MESSAGES,
  RENTAL_ROI_MORTGAGE_SOURCE_NOTES,
} from "@mybookkeeper/api-client/constants/rentalRoiBreakdown";
import type { RentalRoiProperty } from "@mybookkeeper/api-client/types/analytics/rental-roi-property";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";
import { formatExactMoneyCents, rentalRoiPeriodLabel } from "@mybookkeeper/api-client/utils/rentalRoi";
import RentalRoiCostSection from "./RentalRoiCostSection";

export interface RentalRoiBreakEvenPanelProps {
  property: RentalRoiProperty;
  windowStart: string;
  windowEnd: string;
  onClose: () => void;
}

/** Every line that adds up to a property's break-even, so a wrong one can be spotted. */
export default function RentalRoiBreakEvenPanel({ property, windowStart, windowEnd, onClose }: RentalRoiBreakEvenPanelProps) {
  const { cost_breakdown: costs, months_averaged: months } = property;
  return (
    <Panel position="right" width="480px" onClose={onClose}>
      <header className="flex items-start gap-3 border-b px-5 py-4">
        <div className="min-w-0 flex-1">
          <PanelTitle asChild>
            <h2 className="font-medium">{MESSAGES.breakEven}: {property.property_name}</h2>
          </PanelTitle>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoneyCents(property.break_even_monthly_cents)}/mo</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{rentalRoiPeriodLabel(windowStart, windowEnd, months)}</p>
        </div>
        <PanelCloseButton onClose={onClose} />
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
        <RentalRoiCostSection
          title={MESSAGES.mortgage}
          subtotalCents={costs.debt_service_monthly_cents}
          lines={costs.mortgage_lines}
          months={months}
          note={
            property.mortgage_source === "none" ? (
              <>
                {RENTAL_ROI_MORTGAGE_SOURCE_NOTES.none}{" "}
                <Link to="/mortgages" className="font-medium text-primary hover:underline">Add a loan</Link>
              </>
            ) : (
              RENTAL_ROI_MORTGAGE_SOURCE_NOTES[property.mortgage_source]
            )
          }
        />
        <RentalRoiCostSection
          title={MESSAGES.operatingCosts}
          subtotalCents={costs.operating_monthly_cents}
          lines={costs.operating_lines}
          months={months}
          note={costs.operating_lines.length > 0 ? MESSAGES.capitalNote : MESSAGES.noOperatingCosts}
        />
        {costs.escrow_covered_lines.length > 0 && (
          <RentalRoiCostSection
            title={MESSAGES.escrowHeading}
            lines={costs.escrow_covered_lines}
            months={months}
            note={MESSAGES.escrowNote}
          />
        )}
      </div>

      <footer className="flex items-baseline justify-between gap-4 border-t px-5 py-3 font-semibold">
        <span>{MESSAGES.breakEven}</span>
        <span className="tabular-nums" data-testid="rental-roi-break-even-total">
          {formatExactMoneyCents(property.break_even_monthly_cents)}/mo
        </span>
      </footer>
    </Panel>
  );
}
