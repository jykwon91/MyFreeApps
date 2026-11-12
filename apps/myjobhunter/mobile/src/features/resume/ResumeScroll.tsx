import { useTheme } from "@platform/mobile";
import { ScrollView } from "react-native";
import type { ResumeScrollProps } from "../../types/ResumeScrollProps";

/** The screen's scrolling page, lifted clear of the keyboard and the stack's header above it. */
export default function ResumeScroll({ children, testID, ref }: ResumeScrollProps) {
  const { spacing } = useTheme();
  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      ref={ref}
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}
