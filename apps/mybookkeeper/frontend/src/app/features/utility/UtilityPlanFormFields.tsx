import { FormField } from "@platform/ui";
import { UTILITY_PLAN_RATE_TYPES, UTILITY_PLAN_RATE_TYPE_HINTS, UTILITY_PLAN_RATE_TYPE_LABELS } from "@mybookkeeper/api-client/constants/utilityPlanRateTypes";
import { UTILITY_SERVICE_TYPES, UTILITY_SERVICE_TYPE_LABELS } from "@mybookkeeper/api-client/constants/utilityServiceTypes";
import type { UtilityPlanRateType } from "@mybookkeeper/api-client/types/utility/utility-plan-rate-type";
import type { UtilityServiceType } from "@mybookkeeper/api-client/types/utility/utility-service-type";
import type { UtilityPlanFormState } from "./useUtilityPlanForm";
import UtilityPlanInternetFields from "./UtilityPlanInternetFields";
import { UTILITY_PLAN_INPUT_CLASS } from "./utility-plan-input-class";

/**
 * The inputs edit one field at a time, so they take only that much of the form
 * state. Aliasing the whole hook state here would make every caller forward
 * setters these fields never touch.
 */
export type UtilityPlanFormFieldsProps = Pick<
  UtilityPlanFormState,
  "values" | "setField"
>;


/**
 * Every field of a utility plan except the property it belongs to.
 *
 * Shared verbatim by the add and edit dialogs — the property selector is
 * add-only, because a saved plan cannot be moved to another property without
 * rewriting that property's rate history.
 */
export default function UtilityPlanFormFields({
  values,
  setField,
}: UtilityPlanFormFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Service" required>
          {(field) => (
            <select
              value={values.serviceType}
              onChange={(e) => setField("serviceType", e.target.value as UtilityServiceType)}
              className={UTILITY_PLAN_INPUT_CLASS}
              data-testid="utility-plan-service-select"
              {...field}
            >
              {UTILITY_SERVICE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {UTILITY_SERVICE_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField label="Rate type" required>
          {(field) => (
            <select
              value={values.rateType}
              onChange={(e) => setField("rateType", e.target.value as UtilityPlanRateType)}
              className={UTILITY_PLAN_INPUT_CLASS}
              data-testid="utility-plan-rate-type-select"
              {...field}
            >
              {UTILITY_PLAN_RATE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {UTILITY_PLAN_RATE_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </div>

      <p className="text-xs text-muted-foreground -mt-2" data-testid="utility-plan-rate-hint">
        {UTILITY_PLAN_RATE_TYPE_HINTS[values.rateType]}
      </p>

      <FormField label="Provider" required>
        {(field) => (
          <input
            type="text"
            value={values.providerName}
            onChange={(e) => setField("providerName", e.target.value)}
            placeholder="e.g. Constellation"
            className={UTILITY_PLAN_INPUT_CLASS}
            maxLength={255}
            required
            data-testid="utility-plan-provider-input"
            {...field}
          />
        )}
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Plan name">
          {(field) => (
            <input
              type="text"
              value={values.planName}
              onChange={(e) => setField("planName", e.target.value)}
              placeholder="e.g. 12 Month Fixed"
              className={UTILITY_PLAN_INPUT_CLASS}
              maxLength={255}
              data-testid="utility-plan-name-input"
              {...field}
            />
          )}
        </FormField>

        <FormField label="Account number">
          {(field) => (
            <input
              type="text"
              value={values.accountNumber}
              onChange={(e) => setField("accountNumber", e.target.value)}
              placeholder="e.g. 6403771807-5"
              className={UTILITY_PLAN_INPUT_CLASS}
              maxLength={100}
              data-testid="utility-plan-account-input"
              {...field}
            />
          )}
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Energy charge (¢/kWh)">
          {(field) => (
            <input
              type="number"
              value={values.energyCharge}
              onChange={(e) => setField("energyCharge", e.target.value)}
              placeholder="11.6"
              min="0"
              step="0.0001"
              className={UTILITY_PLAN_INPUT_CLASS}
              data-testid="utility-plan-energy-input"
              {...field}
            />
          )}
        </FormField>

        <FormField label="Delivery / TDU charge (¢/kWh)">
          {(field) => (
            <input
              type="number"
              value={values.tduCharge}
              onChange={(e) => setField("tduCharge", e.target.value)}
              placeholder="5.3509"
              min="0"
              step="0.0001"
              className={UTILITY_PLAN_INPUT_CLASS}
              data-testid="utility-plan-tdu-input"
              {...field}
            />
          )}
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Average price at 1,000 kWh (¢/kWh)">
          {(field) => (
            <input
              type="number"
              value={values.avgPrice}
              onChange={(e) => setField("avgPrice", e.target.value)}
              placeholder="13.9"
              min="0"
              step="0.0001"
              className={UTILITY_PLAN_INPUT_CLASS}
              data-testid="utility-plan-avg-price-input"
              {...field}
            />
          )}
        </FormField>

        <FormField label="Monthly base charge (USD)">
          {(field) => (
            <input
              type="number"
              value={values.monthlyBase}
              onChange={(e) => setField("monthlyBase", e.target.value)}
              placeholder="4.39"
              min="0"
              step="0.01"
              className={UTILITY_PLAN_INPUT_CLASS}
              data-testid="utility-plan-base-charge-input"
              {...field}
            />
          )}
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField label="Term (months)">
          {(field) => (
            <input
              type="number"
              value={values.termMonths}
              onChange={(e) => setField("termMonths", e.target.value)}
              placeholder="12"
              min="0"
              max="600"
              step="1"
              className={UTILITY_PLAN_INPUT_CLASS}
              data-testid="utility-plan-term-months-input"
              {...field}
            />
          )}
        </FormField>

        <FormField label="Service start">
          {(field) => (
            <input
              type="date"
              value={values.serviceStartDate}
              onChange={(e) => setField("serviceStartDate", e.target.value)}
              className={UTILITY_PLAN_INPUT_CLASS}
              data-testid="utility-plan-start-date-input"
              {...field}
            />
          )}
        </FormField>

        <FormField label="Term ends">
          {(field) => (
            <input
              type="date"
              value={values.termEndDate}
              onChange={(e) => setField("termEndDate", e.target.value)}
              className={UTILITY_PLAN_INPUT_CLASS}
              data-testid="utility-plan-end-date-input"
              {...field}
            />
          )}
        </FormField>
      </div>

      <FormField label="Early termination fee (USD)">
        {(field) => (
          <input
            type="number"
            value={values.etf}
            onChange={(e) => setField("etf", e.target.value)}
            placeholder="150"
            min="0"
            step="0.01"
            className={UTILITY_PLAN_INPUT_CLASS}
            data-testid="utility-plan-etf-input"
            {...field}
          />
        )}
      </FormField>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={values.hasBillCredit}
          onChange={(e) => setField("hasBillCredit", e.target.checked)}
          className="rounded"
          data-testid="utility-plan-bill-credit-toggle"
        />
        This plan has a usage-based bill credit
      </label>

      {values.hasBillCredit ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Credit amount (USD)" required>
            {(field) => (
              <input
                type="number"
                value={values.billCreditAmount}
                onChange={(e) => setField("billCreditAmount", e.target.value)}
                placeholder="35"
                min="0"
                step="0.01"
                className={UTILITY_PLAN_INPUT_CLASS}
                data-testid="utility-plan-credit-amount-input"
                {...field}
              />
            )}
          </FormField>

          <FormField label="Applies at or above (kWh)" required>
            {(field) => (
              <input
                type="number"
                value={values.billCreditThreshold}
                onChange={(e) => setField("billCreditThreshold", e.target.value)}
                placeholder="1000"
                min="0"
                step="1"
                className={UTILITY_PLAN_INPUT_CLASS}
                data-testid="utility-plan-credit-threshold-input"
                {...field}
              />
            )}
          </FormField>
        </div>
      ) : null}

      {values.serviceType === "internet" ? (
        <UtilityPlanInternetFields values={values} setField={setField} />
      ) : (
        // The bill credit's mirror image: a penalty below a usage floor rather
        // than a reward above one. Both are in kWh, so neither describes an
        // internet plan.
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Minimum usage fee (USD)">
            {(field) => (
              <input
                type="number"
                value={values.minUsageFee}
                onChange={(e) => setField("minUsageFee", e.target.value)}
                placeholder="9.95"
                min="0"
                step="0.01"
                className={UTILITY_PLAN_INPUT_CLASS}
                data-testid="utility-plan-min-usage-fee-input"
                {...field}
              />
            )}
          </FormField>

          <FormField label="Charged below (kWh)">
            {(field) => (
              <input
                type="number"
                value={values.minUsageThreshold}
                onChange={(e) => setField("minUsageThreshold", e.target.value)}
                placeholder="1000"
                min="0"
                step="1"
                className={UTILITY_PLAN_INPUT_CLASS}
                data-testid="utility-plan-min-usage-threshold-input"
                {...field}
              />
            )}
          </FormField>
        </div>
      )}
    </>
  );
}
