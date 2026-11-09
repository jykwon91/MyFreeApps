import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

/** A titled list of field names. Renders nothing when there are none. */
export default function TaxReviewFieldList({ title, fields }: { title: string; fields: readonly string[] }) {
  const { colors, spacing, fontSize } = useTheme();
  if (fields.length === 0) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {`${title} (${fields.length})`}
      </Text>
      {fields.map((field) => (
        <Text key={field} style={{ fontSize: fontSize.sm, color: colors.foreground }}>
          {field}
        </Text>
      ))}
    </View>
  );
}
