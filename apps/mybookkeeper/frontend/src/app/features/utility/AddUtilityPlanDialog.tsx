import { useState } from "react";
import { X } from "lucide-react";
import { Button, LoadingButton } from "@platform/ui";
import FormField from "@/shared/components/ui/FormField";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import { useCreateUtilityPlanMutation } from "@/shared/store/utilityPlansApi";
import {
  UTILITY_PLAN_RATE_TYPES,
  UTILITY_PLAN_RATE_TYPE_HINTS,
  UTILITY_PLAN_RATE_TYPE_LABELS,
} from "@/shared/types/utility/utility-plan-rate-type";
import {
  UTILITY_SERVICE_TYPES,
  UTILITY_SERVICE_TYPE_LABELS,
} from "@/shared/types/utility/utility-service-type";
import type { UtilityPlanRateType } from "@/shared/types/utility/utility-plan-rate-type";
import type { UtilityServiceType } from "@/shared/types/utility/utility-service-type";

export interface AddUtilityPlanDialogProps {
  onClose: () => void;
}

const INPUT_CLASS = "w-full px-3 py-2 text-sm border rounded-md";

/** ``""`` → null so an untouched field is absent rather than zero. */
function optionalText(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

/**
 * Dollars → integer cents. Kept separate from the rate fields, which are sent
 * as strings: a rate carries four decimal places and must not round-trip
 * through a float.
 */
function dollarsToCents(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function toInt(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/**
 * Modal dialog for recording a utility plan against a property.
 */
export default function AddUtilityPlanDialog({ onClose }: AddUtilityPlanDialogProps) {
  const { data: properties = [] } = useGetPropertiesQuery();
  const [createPlan, { isLoading }] = useCreateUtilityPlanMutation();

  const [propertyId, setPropertyId] = useState("");
  const [serviceType, setServiceType] = useState<UtilityServiceType>("electricity");
  const [rateType, setRateType] = useState<UtilityPlanRateType>("fixed");
  const [providerName, setProviderName] = useState("");
  const [planName, setPlanName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const [energyCharge, setEnergyCharge] = useState("");
  const [tduCharge, setTduCharge] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [monthlyBase, setMonthlyBase] = useState("");

  const [termMonths, setTermMonths] = useState("");
  const [serviceStartDate, setServiceStartDate] = useState("");
  const [termEndDate, setTermEndDate] = useState("");
  const [etf, setEtf] = useState("");

  const [hasBillCredit, setHasBillCredit] = useState(false);
  const [billCreditAmount, setBillCreditAmount] = useState("");
  const [billCreditThreshold, setBillCreditThreshold] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId) {
      showError("Pick a property.");
      return;
    }
    if (!providerName.trim()) {
      showError("Provider is required.");
      return;
    }
    if (hasBillCredit && (billCreditAmount.trim() === "" || billCreditThreshold.trim() === "")) {
      // The backend rejects a half-recorded credit too; catching it here saves
      // a round trip and points at the field rather than the form.
      showError("A bill credit needs both an amount and a usage threshold.");
      return;
    }

    try {
      await createPlan({
        property_id: propertyId,
        service_type: serviceType,
        rate_type: rateType,
        provider_name: providerName.trim(),
        plan_name: optionalText(planName),
        account_number: optionalText(accountNumber),
        // Rates stay strings end-to-end so 5.3509 survives intact.
        energy_charge_cents_per_kwh: optionalText(energyCharge),
        tdu_charge_cents_per_kwh: optionalText(tduCharge),
        avg_price_cents_per_kwh_at_1000: optionalText(avgPrice),
        monthly_base_charge_cents: dollarsToCents(monthlyBase),
        term_months: toInt(termMonths),
        service_start_date: serviceStartDate || null,
        term_end_date: termEndDate || null,
        early_termination_fee_cents: dollarsToCents(etf),
        has_bill_credit: hasBillCredit,
        bill_credit_amount_cents: hasBillCredit ? dollarsToCents(billCreditAmount) : null,
        bill_credit_threshold_kwh: hasBillCredit ? toInt(billCreditThreshold) : null,
      }).unwrap();
      showSuccess("Utility plan added.");
      onClose();
    } catch {
      showError("Couldn't save the plan. Please try again.");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      data-testid="add-utility-plan-dialog"
    >
      <div className="bg-background rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <h2 className="text-base font-semibold">Add utility plan</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          <FormField label="Property" required>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className={INPUT_CLASS}
              required
              data-testid="utility-plan-property-select"
            >
              <option value="">Select a property…</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Service" required>
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as UtilityServiceType)}
                className={INPUT_CLASS}
                data-testid="utility-plan-service-select"
              >
                {UTILITY_SERVICE_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {UTILITY_SERVICE_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Rate type" required>
              <select
                value={rateType}
                onChange={(e) => setRateType(e.target.value as UtilityPlanRateType)}
                className={INPUT_CLASS}
                data-testid="utility-plan-rate-type-select"
              >
                {UTILITY_PLAN_RATE_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {UTILITY_PLAN_RATE_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <p className="text-xs text-muted-foreground -mt-2" data-testid="utility-plan-rate-hint">
            {UTILITY_PLAN_RATE_TYPE_HINTS[rateType]}
          </p>

          <FormField label="Provider" required>
            <input
              type="text"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              placeholder="e.g. Constellation"
              className={INPUT_CLASS}
              maxLength={255}
              required
              data-testid="utility-plan-provider-input"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Plan name">
              <input
                type="text"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="e.g. 12 Month Fixed"
                className={INPUT_CLASS}
                maxLength={255}
                data-testid="utility-plan-name-input"
              />
            </FormField>

            <FormField label="Account number">
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 6403771807-5"
                className={INPUT_CLASS}
                maxLength={100}
                data-testid="utility-plan-account-input"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Energy charge (¢/kWh)">
              <input
                type="number"
                value={energyCharge}
                onChange={(e) => setEnergyCharge(e.target.value)}
                placeholder="11.6"
                min="0"
                step="0.0001"
                className={INPUT_CLASS}
                data-testid="utility-plan-energy-input"
              />
            </FormField>

            <FormField label="Delivery / TDU charge (¢/kWh)">
              <input
                type="number"
                value={tduCharge}
                onChange={(e) => setTduCharge(e.target.value)}
                placeholder="5.3509"
                min="0"
                step="0.0001"
                className={INPUT_CLASS}
                data-testid="utility-plan-tdu-input"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Average price at 1,000 kWh (¢/kWh)">
              <input
                type="number"
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
                placeholder="13.9"
                min="0"
                step="0.0001"
                className={INPUT_CLASS}
                data-testid="utility-plan-avg-price-input"
              />
            </FormField>

            <FormField label="Monthly base charge (USD)">
              <input
                type="number"
                value={monthlyBase}
                onChange={(e) => setMonthlyBase(e.target.value)}
                placeholder="4.39"
                min="0"
                step="0.01"
                className={INPUT_CLASS}
                data-testid="utility-plan-base-charge-input"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Term (months)">
              <input
                type="number"
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
                placeholder="12"
                min="0"
                max="600"
                step="1"
                className={INPUT_CLASS}
                data-testid="utility-plan-term-months-input"
              />
            </FormField>

            <FormField label="Service start">
              <input
                type="date"
                value={serviceStartDate}
                onChange={(e) => setServiceStartDate(e.target.value)}
                className={INPUT_CLASS}
                data-testid="utility-plan-start-date-input"
              />
            </FormField>

            <FormField label="Term ends">
              <input
                type="date"
                value={termEndDate}
                onChange={(e) => setTermEndDate(e.target.value)}
                className={INPUT_CLASS}
                data-testid="utility-plan-end-date-input"
              />
            </FormField>
          </div>

          <FormField label="Early termination fee (USD)">
            <input
              type="number"
              value={etf}
              onChange={(e) => setEtf(e.target.value)}
              placeholder="150"
              min="0"
              step="0.01"
              className={INPUT_CLASS}
              data-testid="utility-plan-etf-input"
            />
          </FormField>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={hasBillCredit}
              onChange={(e) => setHasBillCredit(e.target.checked)}
              className="rounded"
              data-testid="utility-plan-bill-credit-toggle"
            />
            This plan has a usage-based bill credit
          </label>

          {hasBillCredit ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Credit amount (USD)" required>
                <input
                  type="number"
                  value={billCreditAmount}
                  onChange={(e) => setBillCreditAmount(e.target.value)}
                  placeholder="35"
                  min="0"
                  step="0.01"
                  className={INPUT_CLASS}
                  data-testid="utility-plan-credit-amount-input"
                />
              </FormField>

              <FormField label="Applies at or above (kWh)" required>
                <input
                  type="number"
                  value={billCreditThreshold}
                  onChange={(e) => setBillCreditThreshold(e.target.value)}
                  placeholder="1000"
                  min="0"
                  step="1"
                  className={INPUT_CLASS}
                  data-testid="utility-plan-credit-threshold-input"
                />
              </FormField>
            </div>
          ) : null}

          <div className="flex gap-3 pt-2 justify-end">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              loadingText="Saving..."
              data-testid="utility-plan-save-button"
            >
              Save plan
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
}
