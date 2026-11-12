import { WELCOME_MANUAL_SECTION_TITLE_MAX_LENGTH, SHARED_ROOM_OPTION } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { WelcomeManualResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-response";
import type { WelcomeManualSectionFormValues } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-form-values";
import type { WelcomeManualSectionResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-response";
import { sectionProblems } from "@mybookkeeper/api-client/utils/welcomeManualProblems";
import { Banner, FormField, LoadingButton, OptionSheet, PickerField, useDiscardPrompt, useTheme } from "@platform/mobile";
import { useState } from "react";
import { ScrollView } from "react-native";
import { WELCOME_MANUAL_SECTION_BODY_MIN_HEIGHT, WELCOME_MANUAL_SECTION_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import { useSnapshotForm } from "../../lib/useSnapshotForm";
import { roomNameFor, roomScopeOptions } from "./welcomeManualRoomOptions";
import { useSaveWelcomeManualSection } from "./useSaveWelcomeManualSection";

interface WelcomeManualSectionFormScreenProps {
  manual: WelcomeManualResponse;
  /** null adds a section. */
  original: WelcomeManualSectionResponse | null;
}

/** Adds a section to a manual, or changes one. What's typed is kept here, so a reload can't overwrite it. */
export default function WelcomeManualSectionFormScreen({ manual, original }: WelcomeManualSectionFormScreenProps) {
  const { spacing } = useTheme();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const form = useSnapshotForm<WelcomeManualSectionFormValues>(
    () => ({ title: original?.title ?? "", body: original?.body ?? "", room_id: original?.room_id ?? "" }),
    sectionProblems,
  );
  const { values, edit } = form;
  const { submit, isBusy, isLeaving, failure } = useSaveWelcomeManualSection(manual.id, original?.id ?? null);
  const locked = isBusy || isLeaving;
  useDiscardPrompt(form.isDirty && !isLeaving, isBusy);

  function save(): void {
    if (form.validate()) void submit(values, form.dirty);
  }

  return (
    <>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {failure ? <Banner message={failure} /> : null}
        <FormField
          editable={!locked}
          error={form.errorFor("title")}
          label={MESSAGES.titleLabel}
          maxLength={WELCOME_MANUAL_SECTION_TITLE_MAX_LENGTH}
          onChangeText={(text) => edit("title", text)}
          required
          returnKeyType="next"
          value={values.title}
        />
        <FormField
          editable={!locked}
          inputStyle={{ minHeight: WELCOME_MANUAL_SECTION_BODY_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
          label={MESSAGES.bodyLabel}
          multiline
          onChangeText={(text) => edit("body", text)}
          placeholder={MESSAGES.bodyPlaceholder}
          value={values.body}
        />
        {manual.rooms.length > 0 ? (
          <PickerField disabled={locked} label={MESSAGES.scopeLabel} onPress={() => setIsPickerOpen(true)} valueLabel={roomNameFor(manual.rooms, values.room_id || null) ?? MESSAGES.everyone} />
        ) : null}
        <LoadingButton disabled={locked} isLoading={isBusy} loadingText={original ? MESSAGES.saving : MESSAGES.adding} onPress={save}>
          {original ? MESSAGES.save : MESSAGES.add}
        </LoadingButton>
      </ScrollView>
      <OptionSheet
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(value) => {
          setIsPickerOpen(false);
          edit("room_id", value === SHARED_ROOM_OPTION ? "" : value);
        }}
        options={roomScopeOptions(manual.rooms)}
        title={MESSAGES.chooseScope}
        value={values.room_id || SHARED_ROOM_OPTION}
      />
    </>
  );
}
