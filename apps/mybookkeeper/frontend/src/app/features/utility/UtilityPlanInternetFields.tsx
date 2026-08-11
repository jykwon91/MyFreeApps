import FormField from "@/shared/components/ui/FormField";
import { UTILITY_PLAN_INPUT_CLASS } from "./utility-plan-input-class";
import type { UtilityPlanFormState } from "./useUtilityPlanForm";

export type UtilityPlanInternetFieldsProps = Pick<
  UtilityPlanFormState,
  "values" | "setField"
>;

/**
 * The terms that price an internet plan rather than a metered one.
 *
 * Rendered only for the internet service type, because none of it describes a
 * kWh: a promo that steps up to a standard rate, a modem rental quoted outside
 * the advertised price, and the speeds that say what the money actually buys.
 *
 * Hiding these does not clear them — see ``toUtilityPlanFields``. A plan whose
 * service type is corrected keeps whatever it already recorded.
 */
export default function UtilityPlanInternetFields({
  values,
  setField,
}: UtilityPlanInternetFieldsProps) {
  return (
    <div className="space-y-4" data-testid="utility-plan-internet-fields">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Price after the promo (USD/mo)">
          <input
            type="number"
            value={values.postPromoMonthly}
            onChange={(e) => setField("postPromoMonthly", e.target.value)}
            placeholder="89.99"
            min="0"
            step="0.01"
            className={UTILITY_PLAN_INPUT_CLASS}
            data-testid="utility-plan-post-promo-input"
          />
        </FormField>

        <FormField label="Equipment fee (USD/mo)">
          <input
            type="number"
            value={values.equipmentFeeMonthly}
            onChange={(e) => setField("equipmentFeeMonthly", e.target.value)}
            placeholder="15"
            min="0"
            step="0.01"
            className={UTILITY_PLAN_INPUT_CLASS}
            data-testid="utility-plan-equipment-fee-input"
          />
        </FormField>
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        A promo price needs the date it ends — set "Term ends" above, and the
        renewal alert will name the day the bill goes up. Leave the data cap
        blank if the plan is uncapped.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormField label="Download (Mbps)">
          <input
            type="number"
            value={values.downloadMbps}
            onChange={(e) => setField("downloadMbps", e.target.value)}
            placeholder="1000"
            min="1"
            step="1"
            className={UTILITY_PLAN_INPUT_CLASS}
            data-testid="utility-plan-download-input"
          />
        </FormField>

        <FormField label="Upload (Mbps)">
          <input
            type="number"
            value={values.uploadMbps}
            onChange={(e) => setField("uploadMbps", e.target.value)}
            placeholder="1000"
            min="1"
            step="1"
            className={UTILITY_PLAN_INPUT_CLASS}
            data-testid="utility-plan-upload-input"
          />
        </FormField>

        {/* Blank means uncapped, which is the usual case on fibre — the
            backend rejects 0 so the two never collapse into each other. Said
            in the hint above rather than the placeholder, which this column is
            too narrow to show in full. */}
        <FormField label="Data cap (GB)">
          <input
            type="number"
            value={values.dataCapGb}
            onChange={(e) => setField("dataCapGb", e.target.value)}
            placeholder="1200"
            min="1"
            step="1"
            className={UTILITY_PLAN_INPUT_CLASS}
            data-testid="utility-plan-data-cap-input"
          />
        </FormField>
      </div>
    </div>
  );
}
