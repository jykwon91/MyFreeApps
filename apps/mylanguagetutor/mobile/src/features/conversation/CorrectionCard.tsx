import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { CorrectionCardProps } from "../../types/CorrectionCardProps";

/** One gentle correction, worded as what it looked like the learner said, as on the website. */
export default function CorrectionCard({ correction, languageName }: CorrectionCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View
      style={{
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderWidth: 1,
        borderRadius: radius.md,
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <Text style={{ color: colors.foreground, fontSize: fontSize.sm }}>
        {PRACTICE_COPY.correctionSaid} <Text style={{ fontWeight: "500" }}>"{correction.error_span}"</Text> {PRACTICE_COPY.correctionNatural}{" "}
        {languageName}: <Text style={{ color: colors.primary, fontWeight: "500" }}>"{correction.corrected_span}"</Text>
      </Text>
      {correction.explanation ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{correction.explanation}</Text> : null}
    </View>
  );
}
