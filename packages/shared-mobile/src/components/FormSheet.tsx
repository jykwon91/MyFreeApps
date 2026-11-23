import { useEffect, useRef } from "react";
import { Text } from "react-native";
import { FORM_SHEET_TEST_ID } from "../constants/formSheet";
import { useMotion } from "../hooks/useMotion";
import { useTheme } from "../theme/useTheme";
import type { FormSheetProps } from "../types/FormSheetProps";
import type { KeyboardAwareScrollRef } from "../types/KeyboardAwareScrollRef";
import { confirmDiscard } from "../utils/confirmDiscard";
import Banner from "./Banner";
import { FormSheetCloseContext } from "./FormSheetCloseContext";
import KeyboardAwareScroll from "./KeyboardAwareScroll";
import SheetModal from "./SheetModal";

/**
 * A full-height sheet for filling something in: a title, a failure banner, and fields that stay clear of the keyboard.
 * Back, the screen reader's escape gesture and its Cancel button ask before throwing away unsaved changes; a sheet isn't a screen, so nothing else would.
 */
export default function FormSheet({ title, isOpen, onRequestClose, hasUnsavedChanges = false, discardCopy, isBusy = false, failure = null, children }: FormSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { isAnimated } = useMotion();
  const scroller = useRef<KeyboardAwareScrollRef>(null);

  // The buttons sit below the fields, so a message at the top would be off screen.
  useEffect(() => {
    if (failure) scroller.current?.scrollTo({ y: 0, animated: isAnimated });
  }, [failure, isAnimated]);

  function requestClose(): void {
    if (isBusy) return;
    if (hasUnsavedChanges) confirmDiscard(onRequestClose, discardCopy);
    else onRequestClose();
  }

  return (
    <SheetModal isOpen={isOpen} onRequestClose={requestClose} testID={FORM_SHEET_TEST_ID}>
      <FormSheetCloseContext.Provider value={{ requestClose, isBusy }}>
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
      </FormSheetCloseContext.Provider>
    </SheetModal>
  );
}
