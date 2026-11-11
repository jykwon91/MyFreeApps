import { DISCOVER_ACTION_MESSAGES as ACTIONS } from "@myjobhunter/api-client/constants/discoverMessages";
import { EMPTY_SAVED_SEARCH_FORM_VALUES } from "@myjobhunter/api-client/constants/emptySavedSearchFormValues";
import { SAVED_SEARCH_FIELD_HINTS as HINTS } from "@myjobhunter/api-client/constants/savedSearchProblems";
import { EDIT_SOURCE_DESCRIPTIONS, EDIT_UNKNOWN_SOURCE_DESCRIPTION, SOURCE_DESCRIPTIONS, SOURCE_KIND_OPTIONS } from "@myjobhunter/api-client/constants/sourceKinds";
import { SAVED_SEARCH_NAME_MAX_LENGTH } from "@myjobhunter/api-client/constants/textFieldLimits";
import { useDiscoveryDefaultsPrefill } from "@myjobhunter/api-client/hooks/useDiscoveryDefaultsPrefill";
import { useCreateDiscoverySourceMutation, useUpdateDiscoverySourceMutation } from "@myjobhunter/api-client/store/discoverApi";
import { useUpdateProfileMutation } from "@myjobhunter/api-client/store/profileApi";
import type { JSearchFormValues } from "@myjobhunter/api-client/types/discovery/jsearch-form-values";
import type { SavedSearchFormValues } from "@myjobhunter/api-client/types/discovery/saved-search-form-values";
import { buildSavedSearchSummary } from "@myjobhunter/api-client/utils/buildSavedSearchSummary";
import { characterCounter } from "@myjobhunter/api-client/utils/characterCounter";
import { discoverFailureMessage } from "@myjobhunter/api-client/utils/discoverFailureMessage";
import { discoveryDefaultsFrom } from "@myjobhunter/api-client/utils/discoveryDefaultsFrom";
import { discoverySourceLabel } from "@myjobhunter/api-client/utils/discoverySourceLabel";
import { isSourceKind } from "@myjobhunter/api-client/utils/isSourceKind";
import { isTypedBoardTokenInvalid } from "@myjobhunter/api-client/utils/isTypedBoardTokenInvalid";
import { isTypedCompanySlugInvalid } from "@myjobhunter/api-client/utils/isTypedCompanySlugInvalid";
import { savedSearchCreateRequest } from "@myjobhunter/api-client/utils/savedSearchCreateRequest";
import { savedSearchEditProblem } from "@myjobhunter/api-client/utils/savedSearchEditProblem";
import { savedSearchFormValues } from "@myjobhunter/api-client/utils/savedSearchFormValues";
import { savedSearchNameProblem } from "@myjobhunter/api-client/utils/savedSearchNameProblem";
import { savedSearchPatch } from "@myjobhunter/api-client/utils/savedSearchPatch";
import { savedSearchProblem } from "@myjobhunter/api-client/utils/savedSearchProblem";
import { FormField, FormSheet, SwitchRow, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Text } from "react-native";
import ChoiceGroup from "../../components/forms/ChoiceGroup";
import SheetButtons from "../../components/forms/SheetButtons";
import { REFRESH_FREQUENCY_OPTIONS } from "../../constants/refreshFrequency";
import { SAVED_SEARCH_SHEET_MESSAGES as MESSAGES } from "../../constants/savedSearchSheet";
import { withChipDrafts } from "../../lib/withChipDrafts";
import type { ChipDraftField } from "../../types/ChipDraftField";
import type { ChipDrafts } from "../../types/ChipDrafts";
import type { SavedSearchSheetProps } from "../../types/SavedSearchSheetProps";
import BoardFields from "./BoardFields";
import BoldText from "./BoldText";
import JSearchFields from "./JSearchFields";
import PrefillSkeleton from "./PrefillSkeleton";

/**
 * The website's new and edit saved-search dialogs as one sheet. A new JSearch search is filled in
 * from the profile and can keep its filters as the defaults; an edit keeps its source and sends only
 * what changed. Building, checking and summarising the request is shared with the website.
 */
export default function SavedSearchSheet({ source, onClose }: SavedSearchSheetProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const { showToast } = useToast();
  const [values, setValues] = useState<SavedSearchFormValues>(() =>
    source ? savedSearchFormValues(source, isSourceKind(source.source) ? source.source : "jsearch") : EMPTY_SAVED_SEARCH_FORM_VALUES,
  );
  const [drafts, setDrafts] = useState<ChipDrafts>({});
  const [saveAsDefaults, setSaveAsDefaults] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [createSource, { isLoading: isCreating }] = useCreateDiscoverySourceMutation();
  const [updateProfile, { isLoading: isUpdatingProfile }] = useUpdateProfileMutation();
  const [updateSource, { isLoading: isUpdating }] = useUpdateDiscoverySourceMutation();
  const isBusy = isCreating || isUpdatingProfile || isUpdating;
  // An edit keeps the saved search's own source, even one this build doesn't know.
  const kind = source ? source.source : values.source;

  function update(patch: Partial<SavedSearchFormValues>): void {
    setValues((current) => ({ ...current, ...patch }));
  }

  function updateDraft(field: ChipDraftField, draft: string): void {
    setDrafts((current) => ({ ...current, [field]: draft }));
  }

  function updateJSearch(patch: Partial<JSearchFormValues>): void {
    setValues((current) => ({ ...current, jsearch: { ...current.jsearch, ...patch } }));
  }

  const prefill = useDiscoveryDefaultsPrefill(!source && values.source === "jsearch", updateJSearch);

  async function create(form: SavedSearchFormValues): Promise<void> {
    try {
      await createSource(savedSearchCreateRequest(form)).unwrap();
    } catch (error) {
      setFailure(discoverFailureMessage(error, ACTIONS.createFailed));
      return;
    }
    if (form.source === "jsearch" && saveAsDefaults) {
      try {
        await updateProfile({ discovery_defaults: discoveryDefaultsFrom(prefill.profile?.discovery_defaults, form.jsearch) }).unwrap();
      } catch {
        // The search was made; this says so, rather than the server's reason the defaults weren't kept.
        showToast(ACTIONS.defaultsFailed, "error");
        onClose();
        return;
      }
    }
    showToast(ACTIONS.created);
    onClose();
  }

  async function saveChanges(form: SavedSearchFormValues): Promise<void> {
    if (!source) return;
    const patch = savedSearchPatch(source, form);
    if (!patch) {
      onClose();
      return;
    }
    try {
      await updateSource({ sourceId: source.id, patch }).unwrap();
      showToast(ACTIONS.updated);
      onClose();
    } catch (error) {
      setFailure(discoverFailureMessage(error, ACTIONS.updateFailed));
    }
  }

  async function submit(): Promise<void> {
    // Tapping a button doesn't take the keyboard away from a list field, so what's still typed there is added here.
    const settled = withChipDrafts(values, drafts);
    setValues(settled);
    setDrafts({});
    const problem = source ? savedSearchEditProblem(source, settled) : savedSearchProblem(settled);
    setFailure(problem);
    if (problem) return;
    await (source ? saveChanges(settled) : create(settled));
  }

  const description = source ? (isSourceKind(source.source) ? EDIT_SOURCE_DESCRIPTIONS[source.source] : EDIT_UNKNOWN_SOURCE_DESCRIPTION) : SOURCE_DESCRIPTIONS[values.source];
  const mutedText = { fontSize: fontSize.sm, color: colors.mutedForeground };

  return (
    <FormSheet failure={failure} isOpen onRequestClose={() => (isBusy ? undefined : onClose())} title={source ? MESSAGES.editTitle : MESSAGES.newTitle}>
      <Text style={mutedText}>{description}</Text>
      <FormField
        counter={characterCounter(values.name.trim(), SAVED_SEARCH_NAME_MAX_LENGTH)}
        editable={!isBusy}
        error={savedSearchNameProblem(values.name)}
        hint={source ? undefined : MESSAGES.nameHint}
        label={MESSAGES.nameLabel}
        onChangeText={(name) => update({ name })}
        placeholder={MESSAGES.namePlaceholder}
        value={values.name}
      />
      {source ? (
        <FormField editable={false} hint={MESSAGES.sourceLocked} label={MESSAGES.sourceLabel} value={discoverySourceLabel(source.source)} />
      ) : (
        <ChoiceGroup disabled={isBusy} label={MESSAGES.sourceLabel} onChange={(next) => update({ source: next })} options={SOURCE_KIND_OPTIONS} value={values.source} />
      )}
      <ChoiceGroup
        disabled={isBusy}
        label={MESSAGES.frequencyLabel}
        onChange={(minutes) => update({ fetchIntervalMinutes: Number(minutes) })}
        options={REFRESH_FREQUENCY_OPTIONS}
        value={String(values.fetchIntervalMinutes)}
      />
      {source ? null : <Text style={mutedText}>{MESSAGES.frequencyHint}</Text>}
      {kind === "greenhouse" ? (
        <BoardFields
          disabled={isBusy}
          hint={isTypedBoardTokenInvalid(values.boardToken) ? HINTS.badBoardToken : HINTS.boardToken}
          isInvalid={isTypedBoardTokenInvalid(values.boardToken)}
          keywords={values.greenhouseExcludedKeywords}
          keywordsDraft={drafts.greenhouseExcludedKeywords ?? ""}
          keywordsHint={MESSAGES.greenhouseKeywordsHint}
          label={MESSAGES.boardTokenLabel}
          onChangeKeywords={(greenhouseExcludedKeywords) => update({ greenhouseExcludedKeywords })}
          onKeywordsDraftChange={(draft) => updateDraft("greenhouseExcludedKeywords", draft)}
          onChangeValue={(boardToken) => update({ boardToken: boardToken.trim() })}
          placeholder={MESSAGES.boardTokenPlaceholder}
          value={values.boardToken}
        />
      ) : null}
      {kind === "lever" ? (
        <BoardFields
          disabled={isBusy}
          hint={isTypedCompanySlugInvalid(values.companySlug) ? HINTS.badCompanySlug : HINTS.companySlug}
          isInvalid={isTypedCompanySlugInvalid(values.companySlug)}
          keywords={values.leverExcludedKeywords}
          keywordsDraft={drafts.leverExcludedKeywords ?? ""}
          keywordsHint={MESSAGES.leverKeywordsHint}
          label={MESSAGES.companySlugLabel}
          onChangeKeywords={(leverExcludedKeywords) => update({ leverExcludedKeywords })}
          onKeywordsDraftChange={(draft) => updateDraft("leverExcludedKeywords", draft)}
          onChangeValue={(companySlug) => update({ companySlug: companySlug.toLowerCase().trim() })}
          placeholder={MESSAGES.companySlugPlaceholder}
          value={values.companySlug}
        />
      ) : null}
      {kind === "jsearch" && prefill.isPrefillLoading ? <PrefillSkeleton /> : null}
      {kind === "jsearch" && !prefill.isPrefillLoading ? (
        <>
          {prefill.didPrefill ? <Text style={[mutedText, { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.muted }]}>{MESSAGES.prefilled}</Text> : null}
          <JSearchFields
            disabled={isBusy}
            drafts={drafts}
            onChange={updateJSearch}
            onDraftChange={updateDraft}
            roleSuggestions={prefill.recentRoleSuggestions}
            skillSuggestions={prefill.skillSuggestions}
            values={values.jsearch}
          />
          {source ? null : <SwitchRow disabled={isBusy} label={MESSAGES.saveAsDefaults} onValueChange={setSaveAsDefaults} value={saveAsDefaults} />}
          <BoldText style={mutedText} text={buildSavedSearchSummary(values.jsearch)} />
        </>
      ) : null}
      <SheetButtons
        cancelLabel={MESSAGES.cancel}
        isSubmitting={isBusy}
        onCancel={onClose}
        onSubmit={submit}
        submitLabel={source ? MESSAGES.saveChanges : MESSAGES.create}
        submittingLabel={source ? MESSAGES.saving : MESSAGES.creating}
      />
    </FormSheet>
  );
}
