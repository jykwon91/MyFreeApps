import { useEffect, useRef } from "react";
import { Modal, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import type { FormSheetProps } from "../types/FormSheetProps";
import type { KeyboardAwareScrollRef } from "../types/KeyboardAwareScrollRef";
import Banner from "./Banner";
import KeyboardAwareScroll from "./KeyboardAwareScroll";

/** A full-height sheet for filling something in: a title, a failure banner, and fields that stay clear of the keyboard. */
export default function FormSheet({ title, isOpen, onRequestClose, failure = null, children }: FormSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const scroller = useRef<KeyboardAwareScrollRef>(null);

  // The buttons sit below the fields, so a message at the top would be off screen.
  useEffect(() => {
    if (failure) scroller.current?.scrollTo({ y: 0 });
  }, [failure]);

  return (
    <Modal animationType="slide" onRequestClose={onRequestClose} presentationStyle="pageSheet" visible={isOpen}>
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
    </Modal>
  );
}
