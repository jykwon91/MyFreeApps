import { Button, FieldFeedback, fieldFeedbackAria, LoadingButton } from "@platform/ui";
import {
  BENCHMARK_NOTES_MAX_LENGTH,
  BENCHMARK_SOURCE_MAX_LENGTH,
  INSURANCE_BENCHMARK_REGION_MAX_LENGTH,
} from "@mybookkeeper/api-client/constants/benchmarkForm";
import { INSURANCE_POLICY_INPUT_CLASS } from "./insurance-policy-input-class";
import { useInsuranceBenchmarkForm } from "./useInsuranceBenchmarkForm";
import type { InsuranceBenchmark } from "@mybookkeeper/api-client/types/insurance/insurance-benchmark";

export interface InsuranceBenchmarkFormProps {
  existing: InsuranceBenchmark | null | undefined;
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * The fields of the market-premium dialog.
 *
 * Premium and coverage are asked for together and side by side because they
 * are only meaningful as a pair — the comparison divides one by the other, and
 * a quote copied without the dwelling amount it was priced against is not a
 * benchmark, just a number.
 */
export default function InsuranceBenchmarkForm({
  existing,
  onSaved,
  onCancel,
}: InsuranceBenchmarkFormProps) {
  const form = useInsuranceBenchmarkForm({ existing, onSaved });

  return (
    <form onSubmit={(e) => void form.handleSubmit(e)} noValidate className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="insurance-benchmark-premium"
            className="block text-sm font-medium mb-1"
          >
            Annual premium ($)
          </label>
          <input
            id="insurance-benchmark-premium"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={form.premium}
            onChange={(e) => form.setPremium(e.target.value)}
            className={INSURANCE_POLICY_INPUT_CLASS}
            data-testid="insurance-benchmark-premium"
            {...fieldFeedbackAria({ id: "insurance-benchmark-premium", error: form.problems.premium, testId: "insurance-benchmark-premium-problem" })}
            required
          />
          <FieldFeedback id="insurance-benchmark-premium" error={form.problems.premium} testId="insurance-benchmark-premium-problem" />
          <p className="text-xs text-muted-foreground mt-1">
            The yearly cost, even if the quote was monthly.
          </p>
        </div>

        <div>
          <label
            htmlFor="insurance-benchmark-coverage"
            className="block text-sm font-medium mb-1"
          >
            Dwelling coverage ($)
          </label>
          <input
            id="insurance-benchmark-coverage"
            type="number"
            inputMode="numeric"
            step="1000"
            min="0"
            value={form.coverage}
            onChange={(e) => form.setCoverage(e.target.value)}
            className={INSURANCE_POLICY_INPUT_CLASS}
            data-testid="insurance-benchmark-coverage"
            {...fieldFeedbackAria({ id: "insurance-benchmark-coverage", error: form.problems.coverage, testId: "insurance-benchmark-coverage-problem" })}
            required
          />
          <FieldFeedback id="insurance-benchmark-coverage" error={form.problems.coverage} testId="insurance-benchmark-coverage-problem" />
          <p className="text-xs text-muted-foreground mt-1">
            What that premium buys — your policies are measured per $1,000 of it.
          </p>
        </div>
      </div>

      <div>
        <label
          htmlFor="insurance-benchmark-region"
          className="block text-sm font-medium mb-1"
        >
          Area it applies to
        </label>
        <input
          id="insurance-benchmark-region"
          type="text"
          maxLength={INSURANCE_BENCHMARK_REGION_MAX_LENGTH}
          value={form.regionLabel}
          onChange={(e) => form.setRegionLabel(e.target.value)}
          placeholder="Harris County, TX"
          className={INSURANCE_POLICY_INPUT_CLASS}
          data-testid="insurance-benchmark-region"
          {...fieldFeedbackAria({ id: "insurance-benchmark-region", error: form.problems.regionLabel, testId: "insurance-benchmark-region-problem" })}
        />
        <FieldFeedback id="insurance-benchmark-region" error={form.problems.regionLabel} testId="insurance-benchmark-region-problem" />
        <p className="text-xs text-muted-foreground mt-1">
          Premiums swing hard by county — coastal wind exposure alone can double
          them, so a figure with no area attached cannot be sanity-checked later.
        </p>
      </div>

      <div>
        <label
          htmlFor="insurance-benchmark-source"
          className="block text-sm font-medium mb-1"
        >
          Where you saw it
        </label>
        <input
          id="insurance-benchmark-source"
          type="text"
          maxLength={BENCHMARK_SOURCE_MAX_LENGTH}
          value={form.source}
          onChange={(e) => form.setSource(e.target.value)}
          placeholder="TDI HelpInsure quote, HO-3, $2,500 deductible"
          className={INSURANCE_POLICY_INPUT_CLASS}
          data-testid="insurance-benchmark-source"
          {...fieldFeedbackAria({ id: "insurance-benchmark-source", error: form.problems.source, testId: "insurance-benchmark-source-problem" })}
        />
        <FieldFeedback id="insurance-benchmark-source" error={form.problems.source} testId="insurance-benchmark-source-problem" />
        <p className="text-xs text-muted-foreground mt-1">
          Include the policy form and deductible — they are what makes the number
          checkable against your own.
        </p>
      </div>

      <div>
        <label
          htmlFor="insurance-benchmark-observed-on"
          className="block text-sm font-medium mb-1"
        >
          Date observed
        </label>
        <input
          id="insurance-benchmark-observed-on"
          type="date"
          value={form.observedOn}
          max={form.maxObservedOn}
          onChange={(e) => form.setObservedOn(e.target.value)}
          className={INSURANCE_POLICY_INPUT_CLASS}
          data-testid="insurance-benchmark-observed-on"
          {...fieldFeedbackAria({ id: "insurance-benchmark-observed-on", error: form.problems.observedOn, testId: "insurance-benchmark-observed-on-problem" })}
          required
        />
        <FieldFeedback id="insurance-benchmark-observed-on" error={form.problems.observedOn} testId="insurance-benchmark-observed-on-problem" />
      </div>

      <div>
        <label
          htmlFor="insurance-benchmark-notes"
          className="block text-sm font-medium mb-1"
        >
          Notes
        </label>
        <textarea
          id="insurance-benchmark-notes"
          rows={2}
          value={form.notes}
          onChange={(e) => form.setNotes(e.target.value)}
          className={`${INSURANCE_POLICY_INPUT_CLASS} resize-none`}
          maxLength={BENCHMARK_NOTES_MAX_LENGTH}
          data-testid="insurance-benchmark-notes"
          {...fieldFeedbackAria({ id: "insurance-benchmark-notes", error: form.problems.notes, testId: "insurance-benchmark-notes-problem" })}
        />
        <FieldFeedback id="insurance-benchmark-notes" error={form.problems.notes} testId="insurance-benchmark-notes-problem" />
      </div>

      {/* Removal sits apart from save/cancel: without it a premium recorded
          from a quote that turned out not to apply could only ever be
          overwritten, never retracted, and every policy would keep being
          measured against it. */}
      <div className="flex items-center justify-between gap-3">
        {form.canRemove ? (
          <button
            type="button"
            onClick={() => void form.handleRemove()}
            disabled={!form.canRemove}
            className="text-sm font-medium text-destructive hover:underline disabled:opacity-50"
            data-testid="insurance-benchmark-remove-button"
          >
            {form.isRemoving ? "Removing..." : "Remove premium"}
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-3 pt-2 justify-end">
          <Button type="button" variant="secondary" size="md" onClick={onCancel}>
            Cancel
          </Button>
          <LoadingButton
            type="submit"
            variant="primary"
            size="md"
            isLoading={form.isSaving}
            loadingText="Saving..."
            disabled={!form.canSubmit}
            data-testid="insurance-benchmark-save-button"
          >
            {existing ? "Update premium" : "Save premium"}
          </LoadingButton>
        </div>
      </div>
    </form>
  );
}
