import { EXTERNAL_ID_MAX_LENGTH, EXTERNAL_ID_SOURCE_HINTS, EXTERNAL_URL_MAX_LENGTH } from "@mybookkeeper/api-client/constants/externalIdForm";
import { LISTING_SOURCE_LABELS, LISTING_SOURCES } from "@mybookkeeper/api-client/constants/listingLabels";
import type { ListingExternalId } from "@mybookkeeper/api-client/types/listing/listing-external-id";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import type { ListingSource } from "@mybookkeeper/api-client/types/listing/listing-source";
import { externalIdChanged, externalIdProblem } from "@mybookkeeper/api-client/utils/externalIdForm";
import { Banner, EmptyState, FormField, LoadingButton, OptionSheet, PickerField, useDiscardPrompt, useTheme } from "@platform/mobile";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { LISTING_LINK_MESSAGES as MESSAGES } from "../../constants/listingLinks";
import { useSaveListingLink } from "./useSaveListingLink";

interface ListingLinkFormScreenProps {
  listing: ListingResponse;
  /** The link being changed, or null to add one. */
  original: ListingExternalId | null;
}

/** Adds a link to another site, or changes `original`. The site can't change once linked. */
export default function ListingLinkFormScreen({ listing, original }: ListingLinkFormScreenProps) {
  const { spacing } = useTheme();
  const free = LISTING_SOURCES.filter((source) => !listing.external_ids.some((link) => link.source === source));
  const [source, setSource] = useState<ListingSource | null>(original?.source ?? free[0] ?? null);
  const [externalId, setExternalId] = useState(original?.external_id ?? "");
  const [externalUrl, setExternalUrl] = useState(original?.external_url ?? "");
  const [hasTried, setHasTried] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const { submit, isBusy, isLeaving, failure } = useSaveListingLink(listing.id, original);

  const problem = externalIdProblem(externalId, externalUrl);
  const isDirty = original ? externalIdChanged(original, externalId, externalUrl) : externalId.trim() !== "" || externalUrl.trim() !== "";
  const locked = isBusy || isLeaving;
  useDiscardPrompt(isDirty && !isLeaving, isBusy);

  if (!source) return <EmptyState body="" heading={MESSAGES.allLinked} />;

  function save(): void {
    setHasTried(true);
    if (problem || !source) return;
    void submit(source, externalId, externalUrl);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {failure ? <Banner message={failure} /> : null}
        <PickerField disabled={locked || original !== null} hint={EXTERNAL_ID_SOURCE_HINTS[source]} label={MESSAGES.source} onPress={() => setIsPicking(true)} valueLabel={LISTING_SOURCE_LABELS[source]} />
        <FormField
          editable={!locked}
          error={hasTried ? (problem ?? undefined) : undefined}
          hint={EXTERNAL_ID_SOURCE_HINTS[source]}
          label={MESSAGES.externalId}
          maxLength={EXTERNAL_ID_MAX_LENGTH}
          onChangeText={setExternalId}
          value={externalId}
        />
        <FormField
          autoCapitalize="none"
          editable={!locked}
          hint={MESSAGES.urlHint}
          keyboardType="url"
          label={MESSAGES.externalUrl}
          maxLength={EXTERNAL_URL_MAX_LENGTH}
          onChangeText={setExternalUrl}
          value={externalUrl}
        />
        <LoadingButton disabled={locked} isLoading={isBusy} loadingText={original ? MESSAGES.saving : MESSAGES.adding} onPress={save}>
          {original ? MESSAGES.save : MESSAGES.addSubmit}
        </LoadingButton>
      </ScrollView>
      <OptionSheet<ListingSource>
        isOpen={isPicking}
        onClose={() => setIsPicking(false)}
        onSelect={(next) => {
          setIsPicking(false);
          setSource(next);
        }}
        options={free.map((value) => ({ value, label: LISTING_SOURCE_LABELS[value] }))}
        title={MESSAGES.chooseSource}
        value={source}
      />
    </KeyboardAvoidingView>
  );
}
