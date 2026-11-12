import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { DiffSectionProps } from "../../types/DiffSectionProps";
import RecipeSectionHeading from "../recipes/RecipeSectionHeading";
import DiffChangeRow from "./DiffChangeRow";

/** A diff's ingredient or step changes, or a line saying there were none. */
export default function DiffSection({ title, emptyText, lines }: DiffSectionProps) {
  const { colors, spacing, fontSize } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <RecipeSectionHeading>{title}</RecipeSectionHeading>
      {lines.length === 0 ? (
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm, fontStyle: "italic" }}>{emptyText}</Text>
      ) : (
        lines.map((line) => <DiffChangeRow key={line.key} line={line} />)
      )}
    </View>
  );
}
