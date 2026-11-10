import { CHANNEL_EXTERNAL_ID_MAX_LENGTH, CHANNEL_EXTERNAL_URL_MAX_LENGTH, CHANNEL_ICAL_URL_MAX_LENGTH } from "@mybookkeeper/api-client/constants/channelListingForm";
import type { Channel } from "@mybookkeeper/api-client/types/listing/channel";
import type { ChannelListing } from "@mybookkeeper/api-client/types/listing/channel-listing";
import type { ChannelListingFormValues } from "@mybookkeeper/api-client/types/listing/channel-listing-form-values";
import { channelListingFormProblems, channelListingToFormValues, emptyChannelListingForm, sameChannelListingForm } from "@mybookkeeper/api-client/utils/channelListingForm";
import { Banner, EmptyState, FormField, LoadingButton, OptionSheet, PickerField, useDiscardPrompt, useTheme } from "@platform/mobile";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { copyOutboundLabel, LISTING_CHANNEL_MESSAGES as MESSAGES } from "../../constants/listingChannels";
import { useCopyText } from "../../lib/useCopyText";
import { useSaveChannelListing } from "./useSaveChannelListing";

interface ChannelListingFormScreenProps {
  listingId: string;
  /** Channels this listing isn't on yet, for adding. */
  available: readonly Channel[];
  /** The channel link being changed, or null to add one. */
  original: ChannelListing | null;
}

/** Adds a channel to a listing, or changes `original`. The channel can't change once linked. */
export default function ChannelListingFormScreen({ listingId, available, original }: ChannelListingFormScreenProps) {
  const { colors, spacing, fontSize } = useTheme();
  const copyText = useCopyText();
  const saved: ChannelListingFormValues = original ? channelListingToFormValues(original) : emptyChannelListingForm(available[0]?.id ?? "");
  const [values, setValues] = useState<ChannelListingFormValues>(saved);
  const [hasTried, setHasTried] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const { submit, isBusy, isLeaving, failure } = useSaveChannelListing(listingId, original);

  const channel = original?.channel ?? available.find((candidate) => candidate.id === values.channel_id) ?? null;
  const problems = channelListingFormProblems(values);
  const isDirty = !sameChannelListingForm(values, saved);
  const locked = isBusy || isLeaving;
  const errorFor = (field: keyof ChannelListingFormValues) => (hasTried ? problems[field] : undefined);
  useDiscardPrompt(isDirty && !isLeaving, isBusy);

  if (!original && available.length === 0) return <EmptyState body="" heading={MESSAGES.noMoreChannels} />;

  function edit(field: keyof ChannelListingFormValues, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function save(): void {
    setHasTried(true);
    if (Object.keys(problems).length > 0 || !values.channel_id) return;
    void submit(values);
  }

  const supportsImport = channel?.supports_ical_import ?? true;
  const supportsExport = channel?.supports_ical_export ?? true;
  const channelName = channel?.name ?? values.channel_id;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {failure ? <Banner message={failure} /> : null}
        <PickerField disabled={locked || original !== null} label={MESSAGES.channel} onPress={() => setIsPicking(true)} valueLabel={channelName} />
        <FormField
          autoCapitalize="none"
          editable={!locked}
          error={errorFor("external_url")}
          keyboardType="url"
          label={MESSAGES.externalUrl}
          maxLength={CHANNEL_EXTERNAL_URL_MAX_LENGTH}
          onChangeText={(text) => edit("external_url", text)}
          placeholder={MESSAGES.urlPlaceholder}
          required
          value={values.external_url}
        />
        <FormField editable={!locked} label={MESSAGES.externalId} maxLength={CHANNEL_EXTERNAL_ID_MAX_LENGTH} onChangeText={(text) => edit("external_id", text)} value={values.external_id} />
        {supportsImport ? (
          <FormField
            autoCapitalize="none"
            editable={!locked}
            error={errorFor("ical_import_url")}
            hint={MESSAGES.icalImportHint}
            keyboardType="url"
            label={MESSAGES.icalImportUrl}
            maxLength={CHANNEL_ICAL_URL_MAX_LENGTH}
            onChangeText={(text) => edit("ical_import_url", text)}
            value={values.ical_import_url}
          />
        ) : (
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`${channelName} ${MESSAGES.noCalendarFeed}`}</Text>
        )}
        {original && supportsExport ? (
          <FormField editable={false} hint={MESSAGES.outboundHint} label={MESSAGES.outboundUrl} selectTextOnFocus trailing={
            <LoadingButton accessibilityLabel={copyOutboundLabel()} onPress={() => void copyText(original.ical_export_url, MESSAGES.icalCopied, MESSAGES.copyFailed)} variant="ghost">
              {MESSAGES.copy}
            </LoadingButton>
          } value={original.ical_export_url} />
        ) : null}
        <LoadingButton disabled={locked} isLoading={isBusy} loadingText={original ? MESSAGES.saving : MESSAGES.adding} onPress={save}>
          {original ? MESSAGES.save : MESSAGES.addSubmit}
        </LoadingButton>
      </ScrollView>
      <OptionSheet<string>
        isOpen={isPicking}
        onClose={() => setIsPicking(false)}
        onSelect={(next) => {
          setIsPicking(false);
          edit("channel_id", next);
        }}
        options={available.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
        title={MESSAGES.chooseChannel}
        value={values.channel_id}
      />
    </KeyboardAvoidingView>
  );
}
