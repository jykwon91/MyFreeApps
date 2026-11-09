import { useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useGetTaxReturnQuery, useGetFormsOverviewQuery, useGetValidationQuery, useRecomputeMutation } from "@mybookkeeper/api-client/store/taxReturnsApi";
import {
  useGetFormFieldsQuery,
  useOverrideFieldMutation,
} from "@/shared/store/taxReturnsApi";
import { useToast } from "@/shared/hooks/useToast";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { Button, LoadingButton, isNotFound } from "@platform/ui";
import Badge from "@/shared/components/ui/Badge";
import TaxReturnSkeleton from "@/app/features/tax/TaxReturnSkeleton";
import FormOverviewGrid from "@/app/features/tax/FormOverviewGrid";
import { buildFormSummaries } from "@/app/features/tax/form-summaries";
import FormFieldsTable from "@/app/features/tax/FormFieldsTable";
import ValidationPanel from "@/app/features/tax/ValidationPanel";
import SourceDocumentsSection from "@/app/features/tax/SourceDocumentsSection";
import TaxAdvisorPanel from "@/app/features/tax/TaxAdvisorPanel";
import { getFormLabel } from "@mybookkeeper/api-client/utils/taxFormLabel";
import type { FieldValueType } from "@/shared/types/tax/tax-form";
import { STATUS_BADGE } from "@/shared/lib/tax-return-config";
import { resolveDetailLoadMode } from "@/shared/lib/detail-load-mode";
import { getApiValidationDetail } from "@/shared/lib/api-validation-detail";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

export default function TaxReturnDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedForm = searchParams.get("form");

  const returnQuery = useGetTaxReturnQuery(id!, { skip: !id });
  const overviewQuery = useGetFormsOverviewQuery(id!, { skip: !id });
  const validationQuery = useGetValidationQuery(id!, { skip: !id });
  const formQuery = useGetFormFieldsQuery(
    { return_id: id!, form_name: selectedForm! },
    { skip: !id || !selectedForm },
  );
  const taxReturn = returnQuery.currentData;
  const formsOverview = overviewQuery.currentData;
  const validation = validationQuery.currentData;
  const formData = formQuery.currentData;

  const [recompute, { isLoading: isRecomputing }] = useRecomputeMutation();
  const [overrideField, { isLoading: isOverriding }] = useOverrideFieldMutation();

  const handleRecompute = useCallback(async () => {
    if (!id) return;
    try {
      await recompute(id).unwrap();
      showSuccess("Recompute complete. I've recalculated everything.");
    } catch {
      showError("I ran into a problem recomputing. Want to try again?");
    }
  }, [id, recompute, showSuccess, showError]);

  const handleOverride = useCallback(async (fieldId: string, value: number | string | boolean | null, reason: string, fieldType: FieldValueType): Promise<boolean> => {
    if (!id) return false;
    try {
      await overrideField({ return_id: id, field_id: fieldId, value, override_reason: reason, field_type: fieldType }).unwrap();
      showSuccess("Override saved");
      return true;
    } catch (err) {
      showError(getApiValidationDetail(err, "I couldn't save that override. Please try again."));
      return false;
    }
  }, [id, overrideField, showSuccess, showError]);

  const handleFormClick = useCallback((formName: string) => {
    setSearchParams({ form: formName });
  }, [setSearchParams]);

  const handleNavigateToField = useCallback((formName: string, _fieldId: string | null) => {
    setSearchParams({ form: formName });
  }, [setSearchParams]);

  const returnMode = resolveDetailLoadMode({ hasData: taxReturn !== undefined, hasError: returnQuery.error !== undefined });
  // The forms grid is built from both lists, so it waits for both, like the return.
  const sectionsPending = [overviewQuery, validationQuery].some(
    (q) => q.currentData === undefined && q.error === undefined,
  );
  const backButton = (
    <button
      onClick={() => navigate("/tax-returns")}
      className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3 min-h-[44px]"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to Tax Returns
    </button>
  );

  if (returnMode === "loading" || (returnMode === "content" && sectionsPending)) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <TaxReturnSkeleton />
      </main>
    );
  }

  if (!taxReturn && isNotFound(returnQuery.error)) {
    return (
      <main className="p-4 sm:p-8">
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">I couldn't find that tax return.</p>
          <Button variant="link" onClick={() => navigate("/tax-returns")} className="mt-2">
            Back to Tax Returns
          </Button>
        </div>
      </main>
    );
  }

  if (!taxReturn) {
    return (
      <main className="p-4 sm:p-8">
        {backButton}
        <LoadErrorAlert
          message="I couldn't load this tax return. Want me to try again?"
          isRetrying={returnQuery.isFetching}
          onRetry={() => returnQuery.refetch()}
        />
      </main>
    );
  }

  const badge = STATUS_BADGE[taxReturn.status];
  const validationResults = validation ?? [];

  // Build form list from actual form instances + any forms with validation results
  const overviewNames = (formsOverview ?? []).map((f) => f.form_name);
  const validationNames = validationResults.map((v) => v.form_name);
  const formNames = [...new Set([...overviewNames, ...validationNames])];

  const instanceCounts: Record<string, number> = {};
  const fieldCounts: Record<string, number> = {};
  for (const f of formsOverview ?? []) {
    instanceCounts[f.form_name] = f.instance_count;
    fieldCounts[f.form_name] = f.field_count;
  }

  const formSummaries = buildFormSummaries(formNames, instanceCounts, fieldCounts, validationResults);

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <div>
        {backButton}
        {returnQuery.error ? (
          <LoadErrorAlert
            message="I couldn't refresh this tax return. Want me to try again?"
            isRetrying={returnQuery.isFetching}
            onRetry={() => returnQuery.refetch()}
          />
        ) : null}
        <SectionHeader
          title={`${taxReturn.tax_year} Tax Return`}
          subtitle={taxReturn.filing_status.replace(/_/g, " ")}
          actions={
            <div className="flex items-center gap-3">
              <Badge label={badge.label} color={badge.color} />
              {taxReturn.needs_recompute ? (
                <Badge label="Needs recompute" color="yellow" />
              ) : null}
              <LoadingButton
                size="sm"
                variant="secondary"
                onClick={handleRecompute}
                isLoading={isRecomputing}
                loadingText="Recomputing..."
                title="Recalculate all tax form values based on your current transactions and documents"
              >
                <RefreshCw size={14} className="mr-1.5" />
                Recompute
              </LoadingButton>
            </div>
          }
        />
        {taxReturn.filed_at ? (
          <p className="text-sm text-muted-foreground mt-1">
            Filed on {format(parseISO(taxReturn.filed_at), "MMM d, yyyy")}
          </p>
        ) : null}
      </div>

      {selectedForm ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSearchParams({})}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              All Forms
            </button>
            <h2 className="text-lg font-semibold">{getFormLabel(selectedForm)}</h2>
          </div>

          {formQuery.error ? (
            <LoadErrorAlert
              message="I couldn't load this form. Want me to try again?"
              isRetrying={formQuery.isFetching}
              onRetry={() => formQuery.refetch()}
            />
          ) : null}
          {!formData ? (
            formQuery.error ? null : <TaxReturnSkeleton />
          ) : formData.instances.length > 0 ? (
            <div className="space-y-6">
              {formData.instances.map((instance) => (
                <FormFieldsTable
                  key={instance.instance_id}
                  fields={instance.fields}
                  instanceLabel={instance.instance_label}
                  sourceType={instance.source_type}
                  documentId={instance.document_id}
                  onOverride={handleOverride}
                  isSaving={isOverriding}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No data found for this form.</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <section>
            <h2 className="text-lg font-semibold mb-4">Forms</h2>
            {overviewQuery.error ? (
              <LoadErrorAlert
                message="I couldn't load the forms for this return. Want me to try again?"
                isRetrying={overviewQuery.isFetching}
                onRetry={() => overviewQuery.refetch()}
              />
            ) : null}
            {formsOverview ? (
              <FormOverviewGrid
                forms={formSummaries}
                validationResults={validationResults}
                onFormClick={handleFormClick}
              />
            ) : null}
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-4">Source Documents</h2>
            <SourceDocumentsSection taxReturnId={id!} />
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-4">Validation</h2>
            {validationQuery.error ? (
              <LoadErrorAlert
                message="I couldn't load the validation checks. Want me to try again?"
                isRetrying={validationQuery.isFetching}
                onRetry={() => validationQuery.refetch()}
              />
            ) : null}
            {validation ? (
              <ValidationPanel
                results={validation}
                onNavigateToField={handleNavigateToField}
              />
            ) : null}
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-4">AI Tax Advisor</h2>
            {/* Its "no forms yet" note would be wrong if the forms didn't load. */}
            {formsOverview ? (
              <TaxAdvisorPanel taxReturnId={id!} formCount={formNames.length} />
            ) : null}
          </section>
        </>
      )}

    </main>
  );
}
