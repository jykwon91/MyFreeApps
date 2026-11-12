import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { WELCOME_MANUAL_TITLE_MAX_LENGTH } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { WelcomeManualFormValues } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-form-values";
import type { WelcomeManualResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-response";
import { manualEditProblems } from "@mybookkeeper/api-client/utils/welcomeManualProblems";
import { Banner, FormField, LoadingButton, OptionSheet, PickerField, SwitchRow, useDiscardPrompt, useTheme } from "@platform/mobile";
import { useState } from "react";
import { ScrollView } from "react-native";
import { WELCOME_MANUAL_FORM_MESSAGES as MESSAGES, WELCOME_MANUAL_INTRO_MIN_HEIGHT } from "../../constants/welcomeManualForms";
import { useSnapshotForm } from "../../lib/useSnapshotForm";
import { NO_PROPERTY_VALUE, propertyOptions } from "./welcomeManualPropertyOptions";
import { useSaveWelcomeManual } from "./useSaveWelcomeManual";

/** Makes a manual (`original` null) or changes one. The snapshot is taken as the form opens, so a reload can't overwrite what's typed. */
export default function WelcomeManualFormScreen({ original }: { original: WelcomeManualResponse | null }) {
  const { spacing } = useTheme();
  const { currentData: properties } = useGetPropertiesQuery();
  const [seed, setSeed] = useState(true);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const form = useSnapshotForm<WelcomeManualFormValues>(
    () => ({ title: original?.title ?? "", intro_text: original?.intro_text ?? "", property_id: original?.property_id ?? "" }),
    manualEditProblems,
  );
  const { values, edit } = form;
  const { create, update, isBusy, isLeaving, failure } = useSaveWelcomeManual(original?.id ?? null);
  const locked = isBusy || isLeaving;
  const options = propertyOptions(properties);
  const propertyLabel = options.find((option) => option.value === (values.property_id || NO_PROPERTY_VALUE))?.label ?? MESSAGES.noProperty;

  useDiscardPrompt(form.isDirty && !isLeaving, isBusy);

  function save(): void {
    if (!form.validate()) return;
    if (original === null) void create({ title: values.title, property_id: values.property_id, seed_default_sections: seed });
    else void update(values, form.dirty);
  }

  return (
    <>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {failure ? <Banner message={failure} /> : null}
        <FormField
          editable={!locked}
          error={form.errorFor("title")}
          label={MESSAGES.titleLabel}
          maxLength={WELCOME_MANUAL_TITLE_MAX_LENGTH}
          onChangeText={(text) => edit("title", text)}
          required
          returnKeyType="next"
          value={values.title}
        />
        {original ? (
          <FormField
            editable={!locked}
            inputStyle={{ minHeight: WELCOME_MANUAL_INTRO_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
            label={MESSAGES.introLabel}
            multiline
            onChangeText={(text) => edit("intro_text", text)}
            placeholder={MESSAGES.introPlaceholder}
            value={values.intro_text}
          />
        ) : null}
        <PickerField disabled={locked} label={MESSAGES.propertyLabel} onPress={() => setIsPickerOpen(true)} valueLabel={propertyLabel} />
        {original === null ? <SwitchRow disabled={locked} label={MESSAGES.seedLabel} note={MESSAGES.seedNote} onValueChange={setSeed} value={seed} /> : null}
        <LoadingButton disabled={locked} isLoading={isBusy} loadingText={original ? MESSAGES.saving : MESSAGES.creating} onPress={save}>
          {original ? MESSAGES.save : MESSAGES.create}
        </LoadingButton>
      </ScrollView>
      <OptionSheet
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(value) => {
          setIsPickerOpen(false);
          edit("property_id", value === NO_PROPERTY_VALUE ? "" : value);
        }}
        options={options}
        title={MESSAGES.chooseProperty}
        value={values.property_id || NO_PROPERTY_VALUE}
      />
    </>
  );
}
