import { useTheme } from "@platform/mobile";
import { ScrollView } from "react-native";
import type { RecipeFormLayoutProps } from "../../types/RecipeFormLayoutProps";

/** A recipe form's scrolling page, lifted clear of the keyboard. */
export default function RecipeFormLayout({ children, testID }: RecipeFormLayoutProps) {
  const { spacing } = useTheme();

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}
