import { KeyboardAwareScroll, useTheme } from "@platform/mobile";
import type { RecipeFormLayoutProps } from "../../types/RecipeFormLayoutProps";

/** A recipe form's scrolling page, lifted clear of the keyboard. */
export default function RecipeFormLayout({ children, testID }: RecipeFormLayoutProps) {
  const { spacing } = useTheme();

  return (
    <KeyboardAwareScroll
      contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      {children}
    </KeyboardAwareScroll>
  );
}
