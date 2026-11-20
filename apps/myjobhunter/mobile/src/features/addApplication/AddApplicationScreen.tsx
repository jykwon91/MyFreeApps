import { Banner, confirmDiscard, KeyboardAwareScroll, useConfirmLeave, useTheme } from "@platform/mobile";
import { useState } from "react";

import CompanyPickerSheet from "./CompanyPickerSheet";
import ReviewStep from "./ReviewStep";
import SourceStep from "./SourceStep";
import { useAddApplicationFlow } from "./useAddApplicationFlow";

/** Adds an application from a link, pasted text or by hand, then goes back to the list, as the website's dialog does. */
export default function AddApplicationScreen() {
  const { spacing } = useTheme();
  const flow = useAddApplicationFlow();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // Each opening is a fresh picker, starting on the company named so far.
  const [pickerOpenings, setPickerOpenings] = useState(0);
  const hasReview = flow.review !== null;
  // Back (header, swipe or Android's button) steps from the review to the source step first, and
  // only leaves from there, asking before throwing away what was entered.
  useConfirmLeave(flow.isDirty && !flow.isLeaving, (leave) => {
    if (flow.isSaving) return;
    if (hasReview) flow.backToSource();
    else confirmDiscard(leave);
  });

  function openPicker(): void {
    setPickerOpenings((count) => count + 1);
    setIsPickerOpen(true);
  }

  function addCompany(name: string): void {
    flow.addTypedCompany(name);
    setIsPickerOpen(false);
  }

  return (
    <>
      <KeyboardAwareScroll
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
      </KeyboardAwareScroll>
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
    </>
  );
}
