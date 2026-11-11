import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { COMPANY_RESEARCH_MESSAGES as MESSAGES } from "../../constants/companyResearch";
import type { ResearchSourcesProps } from "../../types/ResearchSourcesProps";
import ResearchSourceRow from "./ResearchSourceRow";

/** How many pages the research came from, opening to the list of them, closed at first as on the website. */
export default function ResearchSources({ sources }: ResearchSourcesProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  if (sources.length === 0) return null;
  return (
    <View>
      <Pressable
        accessibilityHint={MESSAGES.toggleSources}
        accessibilityLabel={MESSAGES.sources(sources.length)}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setIsOpen((open) => !open)}
        style={{ minHeight: MIN_TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: spacing.sm }}
      >
        <Text importantForAccessibility="no" style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {isOpen ? "▾" : "▸"}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.sources(sources.length)}</Text>
      </Pressable>
      {isOpen ? sources.map((source) => <ResearchSourceRow key={source.id} source={source} />) : null}
    </View>
  );
}
