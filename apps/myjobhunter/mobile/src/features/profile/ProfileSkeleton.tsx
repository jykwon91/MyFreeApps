import { MIN_TOUCH_TARGET, OPTION_SHEET_ROW_HEIGHT, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { PROFILE_MESSAGES as MESSAGES } from "../../constants/profile";
import { PREFERENCE_SKELETON_FACTS, PROFILE_SKELETON_SECTIONS, REMOTE_SKELETON_ROWS } from "../../constants/profileSkeleton";
import SectionSkeletonCards from "../applicationDetail/SectionSkeletonCards";

/** The Profile tab's shape while it loads: about you, job preferences, then each list under its Add button. */
export default function ProfileSkeleton() {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={MESSAGES.loading}
      accessibilityRole="progressbar"
      style={{ gap: spacing.xl, padding: spacing.lg }}
      testID="profile-skeleton"
    >
      <View style={{ gap: spacing.sm }} testID="skeleton-profile-about">
        <Skeleton height={22} width="35%" />
        <Skeleton height={20} width="45%" />
        <Skeleton height={40} />
        <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
      </View>
      <View style={{ gap: spacing.md }} testID="skeleton-profile-preferences">
        <Skeleton height={22} width="45%" />
        {PREFERENCE_SKELETON_FACTS.map((fact) => (
          <View key={fact} style={{ gap: spacing.xs }} testID="skeleton-profile-fact">
            <Skeleton height={12} width="25%" />
            <Skeleton height={18} width="50%" />
          </View>
        ))}
        <View style={{ gap: spacing.xs }}>
          <Skeleton height={12} width="20%" />
          <Skeleton borderRadius={radius.md} height={24} width={120} />
        </View>
        <View style={{ gap: spacing.xs }}>
          <Skeleton height={12} width="35%" />
          {/* Laid out as ChoiceGroup lays out its rows: one bordered box, a line between rows. */}
          <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" }}>
            {REMOTE_SKELETON_ROWS.map((row) => (
              <Skeleton
                borderRadius={0}
                height={OPTION_SHEET_ROW_HEIGHT}
                key={row}
                style={{ borderBottomWidth: 1, borderColor: colors.border }}
                testID="skeleton-profile-remote-row"
              />
            ))}
          </View>
        </View>
      </View>
      {PROFILE_SKELETON_SECTIONS.map((section) => (
        <View key={section} style={{ gap: spacing.md }} testID={`skeleton-profile-${section}`}>
          <Skeleton height={22} width="45%" />
          <Skeleton borderRadius={radius.md} height={MIN_TOUCH_TARGET} />
          <SectionSkeletonCards label={MESSAGES.loading} testID={`skeleton-profile-${section}-cards`} />
        </View>
      ))}
    </View>
  );
}
