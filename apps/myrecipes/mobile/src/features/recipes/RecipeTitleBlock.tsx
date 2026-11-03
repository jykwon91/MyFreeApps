import { Skeleton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

export default function RecipeTitleBlock({
  isLoading,
  owner,
  title,
}: {
  isLoading: boolean;
  owner?: string;
  title?: string;
}) {
  const { colors, spacing, fontSize } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      {title ? (
        <Text
          accessibilityRole="header"
          style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "700" }}
        >
          {title}
        </Text>
      ) : isLoading ? (
        <Skeleton height={fontSize.xl} testID="recipe-title-skeleton" width="70%" />
      ) : null}
      {owner ? (
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>by {owner}</Text>
      ) : null}
    </View>
  );
}
