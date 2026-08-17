import { useState } from "react";
import { UTILITY_PLAN_INPUT_CLASS } from "./utility-plan-input-class";
import MarketRateBenchmarkForm from "./MarketRateBenchmarkForm";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import { useGetMarketRateBenchmarksQuery } from "@/shared/store/marketRateBenchmarksApi";
import {
  UTILITY_SERVICE_TYPES,
  UTILITY_SERVICE_TYPE_LABELS,
} from "@/shared/types/utility/utility-service-type";
import type { UtilityServiceType } from "@/shared/types/utility/utility-service-type";

export interface MarketRateBenchmarkDialogProps {
  onClose: () => void;
}

/**
 * Records what the market currently charges, one service type at a time.
 *
 * Operator-entered rather than fetched: the authoritative source differs per
 * market and per service — Power to Choose in deregulated Texas, a tariff sheet
 * elsewhere, a competitor quote for internet — and a confidently wrong
 * automatic rate would be worse than none, because the badge it drives would
 * look just as certain.
 */
export default function MarketRateBenchmarkDialog({
  onClose,
}: MarketRateBenchmarkDialogProps) {
  const [serviceType, setServiceType] = useState<UtilityServiceType>("electricity");
  const { data: benchmarks } = useGetMarketRateBenchmarksQuery();
  const existing = benchmarks?.find((b) => b.service_type === serviceType);

  return (
    <FormDialogShell
      title="Record the market rate"
      testId="market-rate-benchmark-dialog"
      onClose={onClose}
    >
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          What a comparable plan costs today. Your plans get measured against
          this, so note where the figure came from — a rate with no source is
          impossible to check later.
        </p>

        <div>
          <label
            htmlFor="benchmark-service-type"
            className="block text-sm font-medium mb-1"
          >
            Service
          </label>
          <select
            id="benchmark-service-type"
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as UtilityServiceType)}
            className={UTILITY_PLAN_INPUT_CLASS}
            data-testid="benchmark-service-type"
          >
            {UTILITY_SERVICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {UTILITY_SERVICE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <MarketRateBenchmarkForm
          key={serviceType}
          serviceType={serviceType}
          existing={existing}
          onSaved={onClose}
          onCancel={onClose}
        />
      </div>
    </FormDialogShell>
  );
}
