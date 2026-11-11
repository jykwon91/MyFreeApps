import { useState } from "react";
import { ConfirmDialog, showError, showSuccess, InlineBoldText, Skeleton } from "@platform/ui";
import { useCreateDiscoverySourceMutation } from "@myjobhunter/api-client/store/discoverApi";
import { useUpdateProfileMutation } from "@myjobhunter/api-client/store/profileApi";
import { useDiscoveryDefaultsPrefill } from "@myjobhunter/api-client/hooks/useDiscoveryDefaultsPrefill";
import { DISCOVER_ACTION_MESSAGES } from "@myjobhunter/api-client/constants/discoverMessages";
import { EMPTY_SAVED_SEARCH_FORM_VALUES } from "@myjobhunter/api-client/constants/emptySavedSearchFormValues";
import { SOURCE_DESCRIPTIONS, SOURCE_KIND_OPTIONS } from "@myjobhunter/api-client/constants/sourceKinds";
import type { JSearchFormValues } from "@myjobhunter/api-client/types/discovery/jsearch-form-values";
import type { SavedSearchFormValues } from "@myjobhunter/api-client/types/discovery/saved-search-form-values";
import type { SourceKind } from "@myjobhunter/api-client/types/discovery/source-kind";
import { buildSavedSearchSummary } from "@myjobhunter/api-client/utils/buildSavedSearchSummary";
import { discoverFailureMessage } from "@myjobhunter/api-client/utils/discoverFailureMessage";
import { discoveryDefaultsFrom } from "@myjobhunter/api-client/utils/discoveryDefaultsFrom";
import { savedSearchCreateRequest } from "@myjobhunter/api-client/utils/savedSearchCreateRequest";
import { savedSearchNameProblem } from "@myjobhunter/api-client/utils/savedSearchNameProblem";
import { savedSearchProblem } from "@myjobhunter/api-client/utils/savedSearchProblem";
import GreenhouseConfigSection from "./dialog-sections/GreenhouseConfigSection";
import JSearchFields from "./dialog-sections/JSearchFields";
import LeverConfigSection from "./dialog-sections/LeverConfigSection";
import RefreshFrequencyField from "./dialog-sections/RefreshFrequencyField";
import SavedSearchNameField from "./dialog-sections/SavedSearchNameField";

interface NewSavedSearchDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Dialog for creating a new saved search: JSearch (structured filters, prefilled from the
 * profile), Greenhouse (a board token) or Lever (a company slug). The source picker at the top
 * chooses which config form shows. Building, checking and summarising the request is shared with
 * the phone (api-client utils); this dialog holds the form state and renders it.
 */
export default function NewSavedSearchDialog({ open, onClose }: NewSavedSearchDialogProps) {
  const [values, setValues] = useState<SavedSearchFormValues>(EMPTY_SAVED_SEARCH_FORM_VALUES);
  const [saveAsDefaults, setSaveAsDefaults] = useState(false);

  const [createSource, { isLoading: isCreating }] = useCreateDiscoverySourceMutation();
  const [updateProfile, { isLoading: isUpdatingProfile }] = useUpdateProfileMutation();
  const isLoading = isCreating || isUpdatingProfile;

  function update(patch: Partial<SavedSearchFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
  }

  function updateJSearch(patch: Partial<JSearchFormValues>) {
    setValues((current) => ({ ...current, jsearch: { ...current.jsearch, ...patch } }));
  }

  const { profile, recentRoleSuggestions, skillSuggestions, isPrefillLoading, didPrefill, resetPrefill } =
    useDiscoveryDefaultsPrefill(open && values.source === "jsearch", updateJSearch);

  function resetAll() {
    setValues(EMPTY_SAVED_SEARCH_FORM_VALUES);
    setSaveAsDefaults(false);
    resetPrefill();
  }

  async function handleConfirm() {
    const problem = savedSearchProblem(values);
    if (problem) {
      showError(problem);
      return;
    }

    try {
      await createSource(savedSearchCreateRequest(values)).unwrap();

      // Only JSearch has filters worth keeping as the defaults for new searches.
      if (values.source === "jsearch" && saveAsDefaults) {
        try {
          await updateProfile({ discovery_defaults: discoveryDefaultsFrom(profile?.discovery_defaults, values.jsearch) }).unwrap();
        } catch {
          // The search was created; say so rather than the server's reason for the defaults.
          showError(DISCOVER_ACTION_MESSAGES.defaultsFailed);
        }
      }

      showSuccess(DISCOVER_ACTION_MESSAGES.created);
      resetAll();
      onClose();
    } catch (err) {
      showError(discoverFailureMessage(err, DISCOVER_ACTION_MESSAGES.createFailed));
    }
  }

  function handleCancel() {
    resetAll();
    onClose();
  }

  const summary = values.source === "jsearch" ? buildSavedSearchSummary(values.jsearch) : null;

  return (
    <ConfirmDialog
      open={open}
      title="New saved search"
      description={SOURCE_DESCRIPTIONS[values.source]}
      confirmLabel="Create"
      isLoading={isLoading}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Name — optional label that allows multiple sources of the same kind */}
        <SavedSearchNameField id="source-name" value={values.name} onChange={(name) => update({ name })} error={savedSearchNameProblem(values.name)}>
          <p className="text-xs text-muted-foreground">
            A label for this search. Required only if you want multiple active
            searches of the same type — each must have a unique name.
          </p>
        </SavedSearchNameField>

        {/* Source picker */}
        <div className="space-y-1">
          <label htmlFor="source-select" className="block text-sm font-medium">
            Job source
          </label>
          <select
            id="source-select"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={values.source}
            onChange={(e) => update({ source: e.target.value as SourceKind })}
          >
            {SOURCE_KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Refresh frequency — every source type is fetched on this schedule. */}
        <RefreshFrequencyField
          id="refresh-frequency"
          value={values.fetchIntervalMinutes}
          onChange={(fetchIntervalMinutes) => update({ fetchIntervalMinutes })}
        >
          <p className="text-xs text-muted-foreground">
            How often this saved search will fetch new postings automatically.
            You can also refresh on demand from the saved-search list.
          </p>
        </RefreshFrequencyField>

        {values.source === "greenhouse" && (
          <GreenhouseConfigSection
            boardToken={values.boardToken}
            onBoardTokenChange={(boardToken) => update({ boardToken })}
            excludedKeywords={values.greenhouseExcludedKeywords}
            onExcludedKeywordsChange={(greenhouseExcludedKeywords) => update({ greenhouseExcludedKeywords })}
          />
        )}

        {values.source === "lever" && (
          <LeverConfigSection
            companySlug={values.companySlug}
            onCompanySlugChange={(companySlug) => update({ companySlug })}
            excludedKeywords={values.leverExcludedKeywords}
            onExcludedKeywordsChange={(leverExcludedKeywords) => update({ leverExcludedKeywords })}
          />
        )}

        {values.source === "jsearch" &&
          (isPrefillLoading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-3/4" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-1/2" />
            </div>
          ) : (
            <>
              {didPrefill && (
                <p className="text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded">
                  Pre-filled from your profile. Edit anything below.
                </p>
              )}

              <JSearchFields
                values={values.jsearch}
                onChange={updateJSearch}
                roleSuggestions={recentRoleSuggestions}
                skillSuggestions={skillSuggestions}
              />

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={saveAsDefaults}
                  onChange={(e) => setSaveAsDefaults(e.target.checked)}
                  className="rounded"
                />
                <span>
                  Save these filters (industries, employment, experience, etc.)
                  as my defaults for new searches
                </span>
              </label>

              {summary && (
                <div className="border-t pt-3 mt-2">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <InlineBoldText text={summary} />
                  </p>
                </div>
              )}
            </>
          ))}
      </div>
    </ConfirmDialog>
  );
}
