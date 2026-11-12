import { KeyboardAwareScroll, useTheme } from "@platform/mobile";
import type { ResumeScrollProps } from "../../types/ResumeScrollProps";

/** The screen's scrolling page, lifted clear of the keyboard and the stack's header above it. */
export default function ResumeScroll({ children, testID, ref }: ResumeScrollProps) {
  const { spacing } = useTheme();
  return (
    <KeyboardAwareScroll
      contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      ref={ref}
      testID={testID}
    >
      {children}
    </KeyboardAwareScroll>
  );
}
