import { useEffect, useRef } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, type ScrollViewInstance, Text } from "react-native";
import { useTheme } from "../theme/useTheme";
import type { FormSheetProps } from "../types/FormSheetProps";
import Banner from "./Banner";

/** A full-height sheet for filling something in: a title, a failure banner, and fields that stay clear of the keyboard. */
export default function FormSheet({ title, isOpen, onRequestClose, failure = null, children }: FormSheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const scroller = useRef<ScrollViewInstance>(null);

  // The buttons sit below the fields, so a message at the top would be off screen.
  useEffect(() => {
    if (failure) scroller.current?.scrollTo({ y: 0 });
  }, [failure]);

  return (
    <Modal animationType="slide" onRequestClose={onRequestClose} presentationStyle="pageSheet" visible={isOpen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
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
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
