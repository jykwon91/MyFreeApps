import { useTheme } from "@platform/mobile";
import { useHeaderHeight } from "expo-router/react-navigation";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import type { ResumeScrollProps } from "../../types/ResumeScrollProps";

/** The screen's scrolling page, lifted clear of the keyboard and the stack's header above it. */
export default function ResumeScroll({ children, testID, ref }: ResumeScrollProps) {
  const { colors, spacing } = useTheme();
  const headerHeight = useHeaderHeight();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ref={ref}
        testID={testID}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
