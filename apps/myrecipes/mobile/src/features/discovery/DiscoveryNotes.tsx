import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import RecipeSectionHeading from "../recipes/RecipeSectionHeading";

/** Reading context with no home on a recipe, such as the source's tips. Nothing when there's none. */
export default function DiscoveryNotes({ heading, notes }: { heading: string; notes: string[] }) {
  const { colors, spacing, fontSize } = useTheme();
  if (notes.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <RecipeSectionHeading>{heading}</RecipeSectionHeading>
      {notes.map((note, index) => (
        <Text key={index} style={{ color: colors.mutedForeground, fontSize: fontSize.md }}>
          {note}
        </Text>
      ))}
    </View>
  );
}
