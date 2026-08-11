import { UTILITY_PLAN_INPUT_CLASS } from "./utility-plan-input-class";
import UtilityPlanFormActions from "./UtilityPlanFormActions";
import { useMarketRateBenchmarkForm } from "./useMarketRateBenchmarkForm";
import type { MarketRateBenchmark } from "@/shared/types/utility/market-rate-benchmark";
import type { UtilityServiceType } from "@/shared/types/utility/utility-service-type";

export interface MarketRateBenchmarkFormProps {
  serviceType: UtilityServiceType;
  existing: MarketRateBenchmark | undefined;
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * The fields of the market-rate dialog, for one service type.
 *
 * Split from the dialog so the parent can remount it with ``key={serviceType}``
 * — switching service must reload the fields from *that* type's saved
 * benchmark, and state seeded in a ``useState`` initializer would otherwise
 * carry the previous type's figure across.
 */
export default function MarketRateBenchmarkForm({
  serviceType,
  existing,
  onSaved,
  onCancel,
}: MarketRateBenchmarkFormProps) {
  const form = useMarketRateBenchmarkForm({ serviceType, existing, onSaved });

  const figureLabel = form.isFlat
    ? "Going rate ($/month)"
    : "Going rate (¢/kWh, all-in at 1,000 kWh)";
  const figureHint = form.isFlat
    ? "Include any equipment fee — that is how your own plans are measured."
    : "The advertised all-in average, including delivery charges.";

  return (
    <form onSubmit={(e) => void form.handleSubmit(e)} className="space-y-4">
      <div>
        <label htmlFor="benchmark-figure" className="block text-sm font-medium mb-1">
          {figureLabel}
        </label>
        <input
          id="benchmark-figure"
          type="number"
          inputMode="decimal"
          step={form.isFlat ? "0.01" : "0.0001"}
          min="0"
          value={form.figure}
          onChange={(e) => form.setFigure(e.target.value)}
          className={UTILITY_PLAN_INPUT_CLASS}
          data-testid="benchmark-figure"
          required
        />
        <p className="text-xs text-muted-foreground mt-1">{figureHint}</p>
      </div>

      <div>
        <label htmlFor="benchmark-source" className="block text-sm font-medium mb-1">
          Where you saw it
        </label>
        <input
          id="benchmark-source"
          type="text"
          maxLength={255}
          value={form.source}
          onChange={(e) => form.setSource(e.target.value)}
          placeholder="Power to Choose, 77021, 12-month fixed, 4★+"
          className={UTILITY_PLAN_INPUT_CLASS}
          data-testid="benchmark-source"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Include the filters you used — they are what makes the number checkable
          later.
        </p>
      </div>

      <div>
        <label htmlFor="benchmark-observed-on" className="block text-sm font-medium mb-1">
          Date observed
        </label>
        <input
          id="benchmark-observed-on"
          type="date"
          value={form.observedOn}
          max={form.maxObservedOn}
          onChange={(e) => form.setObservedOn(e.target.value)}
          className={UTILITY_PLAN_INPUT_CLASS}
          data-testid="benchmark-observed-on"
          required
        />
      </div>

      <div>
        <label htmlFor="benchmark-notes" className="block text-sm font-medium mb-1">
          Notes
        </label>
        <textarea
          id="benchmark-notes"
          rows={2}
          value={form.notes}
          onChange={(e) => form.setNotes(e.target.value)}
          className={UTILITY_PLAN_INPUT_CLASS}
          data-testid="benchmark-notes"
        />
      </div>

      {/* Removal sits apart from save/cancel: without it a rate recorded from
          a source that turned out not to apply could only ever be overwritten,
          never retracted, and every plan would keep being measured against it. */}
      <div className="flex items-center justify-between gap-3">
        {form.canRemove ? (
          <button
            type="button"
            onClick={() => void form.handleRemove()}
            disabled={!form.canRemove}
            className="text-sm font-medium text-destructive hover:underline disabled:opacity-50"
            data-testid="benchmark-remove-button"
          >
            {form.isRemoving ? "Removing..." : "Remove rate"}
          </button>
        ) : (
          <span />
        )}
        <UtilityPlanFormActions
          isSaving={form.isSaving}
          saveLabel={existing ? "Update rate" : "Save rate"}
          disabled={!form.canSubmit}
          onCancel={onCancel}
        />
      </div>
    </form>
  );
}
