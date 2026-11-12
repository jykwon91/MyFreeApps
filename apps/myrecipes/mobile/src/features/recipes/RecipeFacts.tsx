import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { recipeFacts } from "../../utils/recipeFacts";

export default function RecipeFacts({
  version,
}: {
  version: Pick<VersionResponse, "servings" | "prep_minutes" | "cook_minutes">;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const facts = recipeFacts(version);
  if (facts.length === 0) return null;

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: spacing.xl, rowGap: spacing.sm }}>
      {facts.map(({ label, value }) => (
        <View accessibilityLabel={`${label}: ${value}`} accessible key={label}>
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{label}</Text>
          <Text style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>{value}</Text>
        </View>
      ))}
    </View>
  );
}
