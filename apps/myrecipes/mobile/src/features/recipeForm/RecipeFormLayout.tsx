import { useTheme } from "@platform/mobile";
import { useHeaderHeight } from "expo-router/react-navigation";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import type { RecipeFormLayoutProps } from "../../types/RecipeFormLayoutProps";

/** A recipe form's scrolling page, lifted clear of the keyboard. */
export default function RecipeFormLayout({ children, testID }: RecipeFormLayoutProps) {
  const { colors, spacing } = useTheme();
  // The stack's header sits over the screen, so the keyboard's lift has to clear it too.
  const headerHeight = useHeaderHeight();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        testID={testID}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
