import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { RESEARCH_SKELETON_LINES } from "../../constants/companyResearch";

/** A paragraph's worth of lines, where the research will be. */
export default function ResearchSkeleton() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Skeleton height={14} width="30%" />
      {RESEARCH_SKELETON_LINES.map((width) => (
        <Skeleton height={14} key={width} width={width} />
      ))}
    </View>
  );
}
