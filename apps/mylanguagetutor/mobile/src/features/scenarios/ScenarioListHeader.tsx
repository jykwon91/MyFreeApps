import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";
import { SESSION_BLOCK_COPY } from "@mylanguagetutor/api-client/constants/sessionBlockCopy";
import { levelLabel } from "@mylanguagetutor/api-client/utils/levelLabel";
import { onboardingLevelPath } from "@mylanguagetutor/api-client/utils/onboardingLevelPath";
import { Banner, MIN_TOUCH_TARGET, SHOWING_LAST_LOADED_MESSAGE, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { ScenarioListHeaderProps } from "../../types/ScenarioListHeaderProps";

/** The language and level above the scenarios, with Change level and today's limit, as on the website. */
export default function ScenarioListHeader({ profile, languageName, isCapReached, isStale }: ScenarioListHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.xs, paddingBottom: spacing.md }}>
      {isStale ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} style={{ marginBottom: spacing.sm }} /> : null}
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "600" }}>
        {`${CATALOG_COPY.practicePrefix} ${languageName}`}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: spacing.sm }}>
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
          {`${CATALOG_COPY.levelPrefix} ${levelLabel(profile.level)}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(onboardingLevelPath(profile.language_code))}
          style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: "center" }}
        >
          <Text style={{ color: colors.primary, fontSize: fontSize.sm, textDecorationLine: "underline" }}>{CATALOG_COPY.changeLevel}</Text>
        </Pressable>
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{CATALOG_COPY.pickScenario}</Text>
      {/* Information, not an error to retry, as on the website. */}
      {isCapReached ? <Banner message={SESSION_BLOCK_COPY.daily_limit} style={{ marginTop: spacing.sm }} tone="info" /> : null}
    </View>
  );
}
