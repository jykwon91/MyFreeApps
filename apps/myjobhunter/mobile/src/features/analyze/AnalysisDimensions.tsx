import { orderedDimensions } from "@myjobhunter/api-client/utils/orderedDimensions";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { ANALYZE_MESSAGES as MESSAGES } from "../../constants/analyze";
import type { AnalysisDimensionsProps } from "../../types/AnalysisDimensionsProps";
import SectionHeading from "../applicationDetail/SectionHeading";
import DimensionCard from "./DimensionCard";

/** Every dimension, in the rubric's order, or a note when the analysis came back without any. */
export default function AnalysisDimensions({ dimensions }: AnalysisDimensionsProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const ordered = orderedDimensions(dimensions);
  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeading title={MESSAGES.dimensionsHeading} />
      {ordered.length === 0 ? (
        <View style={{ padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border }}>
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm, textAlign: "center" }}>{MESSAGES.noDimensions}</Text>
        </View>
      ) : (
        ordered.map((dimension) => <DimensionCard dimension={dimension} key={dimension.key} />)
      )}
    </View>
  );
}
