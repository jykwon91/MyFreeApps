import { Skeleton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { TAX_RETURNS_MESSAGES as MESSAGES } from "../../constants/taxReturns";
import type { TaxReturnSectionProps } from "../../types/TaxReturnSectionProps";

export default function TaxReturnSection({ title, loading, failed, emptyMessage, children }: TaxReturnSectionProps) {
  const { colors, spacing, fontSize } = useTheme();
  const note = failed ? MESSAGES.couldntLoadSection : emptyMessage;
  const inset = { paddingHorizontal: spacing.lg };

  function body() {
    if (loading) {
      return (
        <View accessible accessibilityLabel={MESSAGES.loadingSection} accessibilityRole="progressbar" style={inset}>
          <Skeleton height={48} width="100%" />
        </View>
      );
    }
    if (note) return <Text style={{ ...inset, fontSize: fontSize.sm, color: colors.mutedForeground }}>{note}</Text>;
    return children;
  }

  return (
    <View>
      <Text accessibilityRole="header" style={{ ...inset, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground, paddingBottom: spacing.xs }}>
        {title}
      </Text>
      {body()}
    </View>
  );
}
