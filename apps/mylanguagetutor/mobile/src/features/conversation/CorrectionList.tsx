import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { useTheme } from "@platform/mobile";
import { View } from "react-native";
import type { CorrectionListProps } from "../../types/CorrectionListProps";
import CorrectionCard from "./CorrectionCard";

/** The corrections for one turn; nothing when there are none. */
export default function CorrectionList({ corrections, languageName }: CorrectionListProps) {
  const { spacing } = useTheme();
  if (corrections.length === 0) return null;
  return (
    <View accessibilityLabel={PRACTICE_COPY.suggestionsLabel} accessibilityRole="list" style={{ gap: spacing.sm }}>
      {corrections.map((correction, index) => (
        <CorrectionCard correction={correction} key={`${correction.error_span}-${index}`} languageName={languageName} />
      ))}
    </View>
  );
}
