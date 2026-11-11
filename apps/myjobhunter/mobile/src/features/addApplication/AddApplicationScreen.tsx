import { Banner, useDiscardPrompt, useTheme } from "@platform/mobile";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import CompanyPickerSheet from "./CompanyPickerSheet";
import ReviewStep from "./ReviewStep";
import SourceStep from "./SourceStep";
import { useAddApplicationFlow } from "./useAddApplicationFlow";

/** Adds an application from a link, pasted text or by hand, then goes back to the list, as the website's dialog does. */
export default function AddApplicationScreen() {
  const { colors, spacing } = useTheme();
  const flow = useAddApplicationFlow();
  // The stack's header sits over the screen, so the keyboard's lift has to clear it too.
  const headerHeight = useHeaderHeight();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // Each opening is a fresh picker, starting on the company named so far.
  const [pickerOpenings, setPickerOpenings] = useState(0);
  useDiscardPrompt(flow.isDirty && !flow.isLeaving, flow.isSaving);

  function openPicker(): void {
    setPickerOpenings((count) => count + 1);
    setIsPickerOpen(true);
  }

  async function addCompany(name: string): Promise<void> {
    await flow.addTypedCompany(name);
    setIsPickerOpen(false);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
      style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        testID="add-application"
      >
        {flow.failure ? <Banner message={flow.failure} /> : null}
        {flow.review ? (
          <ReviewStep
            errors={flow.errors}
            isLocked={flow.isLeaving}
            isSaving={flow.isSaving}
            onChangeCompany={openPicker}
            onEdit={flow.edit}
            onSave={flow.save}
            review={flow.review}
            values={flow.values}
          />
        ) : (
          <>
            {flow.blockedNotice && flow.source === "text" ? <Banner message={flow.blockedNotice} /> : null}
            <SourceStep
              isLongRunning={flow.isLongRunning}
              onChooseCompany={openPicker}
              onPasteLink={flow.pasteLink}
              onReadLink={flow.readLink}
              onReadText={flow.readText}
              onSourceChange={flow.setSource}
              onTextChange={flow.setTextValue}
              textError={flow.textError}
              onUrlChange={flow.setUrlValue}
              reading={flow.reading}
              source={flow.source}
              textValue={flow.textValue}
              urlValue={flow.urlValue}
            />
          </>
        )}
      </ScrollView>
      <CompanyPickerSheet
        key={pickerOpenings}
        initialQuery={flow.review?.company.name ?? ""}
        isOpen={isPickerOpen}
        onAdd={addCompany}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(company) => {
          flow.chooseCompany(company);
          setIsPickerOpen(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}
