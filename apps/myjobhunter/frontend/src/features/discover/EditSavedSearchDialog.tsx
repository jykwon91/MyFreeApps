/**
 * EditSavedSearchDialog — full edit dialog for a saved search: its name, refresh frequency and
 * source-specific config (board token, company slug, or the JSearch filters).
 *
 * - The source kind is locked: delete and recreate to switch it.
 * - Only what changed is sent (savedSearchPatch, shared with the phone); a changed config goes
 *   whole, with `source_kind`, so the backend validates it again.
 * - The profile prefill and "save as defaults" are create-time affordances, left out here.
 * - The row mounts this only while it is open, so the form starts from the saved row every time.
 */
import { useState } from "react";
import { ConfirmDialog, showError, showSuccess } from "@platform/ui";
import { useUpdateDiscoverySourceMutation } from "@myjobhunter/api-client/store/discoverApi";
import { DISCOVER_ACTION_MESSAGES } from "@myjobhunter/api-client/constants/discoverMessages";
import { EDIT_SOURCE_DESCRIPTIONS, EDIT_UNKNOWN_SOURCE_DESCRIPTION } from "@myjobhunter/api-client/constants/sourceKinds";
import type { DiscoverySource } from "@myjobhunter/api-client/types/discovery/discovery-source";
import type { JSearchFormValues } from "@myjobhunter/api-client/types/discovery/jsearch-form-values";
import type { SavedSearchFormValues } from "@myjobhunter/api-client/types/discovery/saved-search-form-values";
import { discoverFailureMessage } from "@myjobhunter/api-client/utils/discoverFailureMessage";
import { isSourceKind } from "@myjobhunter/api-client/utils/isSourceKind";
import { savedSearchEditProblem } from "@myjobhunter/api-client/utils/savedSearchEditProblem";
import { savedSearchFormValues } from "@myjobhunter/api-client/utils/savedSearchFormValues";
import { savedSearchNameProblem } from "@myjobhunter/api-client/utils/savedSearchNameProblem";
import { savedSearchPatch } from "@myjobhunter/api-client/utils/savedSearchPatch";
import GreenhouseConfigSection from "./dialog-sections/GreenhouseConfigSection";
import JSearchFields from "./dialog-sections/JSearchFields";
import LeverConfigSection from "./dialog-sections/LeverConfigSection";
import RefreshFrequencyField from "./dialog-sections/RefreshFrequencyField";
import SavedSearchNameField from "./dialog-sections/SavedSearchNameField";

interface EditSavedSearchDialogProps {
  source: DiscoverySource;
  open: boolean;
  onClose: () => void;
}

export default function EditSavedSearchDialog({ source, open, onClose }: EditSavedSearchDialogProps) {
  const [values, setValues] = useState<SavedSearchFormValues>(() =>
    savedSearchFormValues(source, isSourceKind(source.source) ? source.source : "jsearch"),
  );
  const [updateSource, { isLoading }] = useUpdateDiscoverySourceMutation();

  function update(patch: Partial<SavedSearchFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
  }

  function updateJSearch(patch: Partial<JSearchFormValues>) {
    setValues((current) => ({ ...current, jsearch: { ...current.jsearch, ...patch } }));
  }

  async function handleConfirm() {
    const problem = savedSearchEditProblem(source, values);
    if (problem) {
      showError(problem);
      return;
    }

    const patch = savedSearchPatch(source, values);
    if (!patch) {
      // Nothing changed — close without a network round-trip.
      onClose();
      return;
    }

    try {
      await updateSource({ sourceId: source.id, patch }).unwrap();
      showSuccess(DISCOVER_ACTION_MESSAGES.updated);
      onClose();
    } catch (err) {
      showError(discoverFailureMessage(err, DISCOVER_ACTION_MESSAGES.updateFailed));
    }
  }

  const description = isSourceKind(source.source) ? EDIT_SOURCE_DESCRIPTIONS[source.source] : EDIT_UNKNOWN_SOURCE_DESCRIPTION;

  return (
    <ConfirmDialog
      open={open}
      title="Edit saved search"
      description={description}
      confirmLabel="Save changes"
      isLoading={isLoading}
      onConfirm={handleConfirm}
      onCancel={onClose}
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 mt-4">
        <SavedSearchNameField id="edit-source-name" value={values.name} onChange={(name) => update({ name })} error={savedSearchNameProblem(values.name)} />

        <RefreshFrequencyField
          id="edit-refresh-frequency"
          value={values.fetchIntervalMinutes}
          onChange={(fetchIntervalMinutes) => update({ fetchIntervalMinutes })}
        />

        {/* Source-kind locked indicator */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">Job source</label>
          <input
            type="text"
            value={source.source.charAt(0).toUpperCase() + source.source.slice(1)}
            disabled
            aria-label="Job source (read-only)"
            className="w-full rounded border border-border bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground">
            Source kind cannot be changed. Delete and recreate to switch sources.
          </p>
        </div>

        {source.source === "greenhouse" && (
          <GreenhouseConfigSection
            boardToken={values.boardToken}
            onBoardTokenChange={(boardToken) => update({ boardToken })}
            excludedKeywords={values.greenhouseExcludedKeywords}
            onExcludedKeywordsChange={(greenhouseExcludedKeywords) => update({ greenhouseExcludedKeywords })}
          />
        )}

        {source.source === "lever" && (
          <LeverConfigSection
            companySlug={values.companySlug}
            onCompanySlugChange={(companySlug) => update({ companySlug })}
            excludedKeywords={values.leverExcludedKeywords}
            onExcludedKeywordsChange={(leverExcludedKeywords) => update({ leverExcludedKeywords })}
          />
        )}

        {source.source === "jsearch" && (
          <JSearchFields values={values.jsearch} onChange={updateJSearch} roleSuggestions={[]} skillSuggestions={[]} />
        )}
      </div>
    </ConfirmDialog>
  );
}
