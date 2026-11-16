import { useEffect, useRef } from "react";
import { Modal, Text, View } from "react-native";
import { FORM_SHEET_TEST_ID } from "../constants/formSheet";
import { useTheme } from "../theme/useTheme";
import type { FormSheetProps } from "../types/FormSheetProps";
import type { KeyboardAwareScrollRef } from "../types/KeyboardAwareScrollRef";
import { confirmDiscard } from "../utils/confirmDiscard";
import Banner from "./Banner";
import { FormSheetCloseContext } from "./FormSheetCloseContext";
import KeyboardAwareScroll from "./KeyboardAwareScroll";

/**
 * A full-height sheet for filling something in: a title, a failure banner, and fields that stay clear of the keyboard.
 * Back and its Cancel button ask before throwing away unsaved changes; a sheet isn't a screen, so nothing else would.
 */
export default function FormSheet({ title, isOpen, onRequestClose, hasUnsavedChanges = false, discardCopy, isBusy = false, failure = null, children }: FormSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const scroller = useRef<KeyboardAwareScrollRef>(null);

  // The buttons sit below the fields, so a message at the top would be off screen.
  useEffect(() => {
    if (failure) scroller.current?.scrollTo({ y: 0 });
  }, [failure]);

  function requestClose(): void {
    if (isBusy) return;
    if (hasUnsavedChanges) confirmDiscard(onRequestClose, discardCopy);
    else onRequestClose();
  }

  return (
    <Modal animationType="slide" onRequestClose={requestClose} presentationStyle="pageSheet" testID={FORM_SHEET_TEST_ID} visible={isOpen}>
      <FormSheetCloseContext.Provider value={{ requestClose, isBusy }}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <KeyboardAwareScroll
            contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ref={scroller}
          >
            <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
              {title}
            </Text>
            {failure ? <Banner message={failure} /> : null}
            {children}
          </KeyboardAwareScroll>
        </View>
      </FormSheetCloseContext.Provider>
    </Modal>
  );
}
