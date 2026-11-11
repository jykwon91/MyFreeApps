import { formatSeniority } from "@myjobhunter/api-client/utils/formatSeniority";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { PROFILE_MESSAGES as MESSAGES } from "../../constants/profile";
import type { ProfileProps } from "../../types/ProfileProps";
import SectionHeading from "../applicationDetail/SectionHeading";
import AboutSheet from "./AboutSheet";

/** Your level and summary, and Edit for both. */
export default function AboutSection({ profile }: ProfileProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  return (
    <View style={{ gap: spacing.sm }} testID="profile-about">
      <SectionHeading title={MESSAGES.aboutTitle} />
      <Text style={{ fontSize: fontSize.md, fontWeight: "500", color: colors.foreground }}>{formatSeniority(profile.seniority) ?? MESSAGES.levelNotSet}</Text>
      {profile.summary ? (
        <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {profile.summary}
        </Text>
      ) : (
        <Text style={{ fontSize: fontSize.sm, fontStyle: "italic", color: colors.mutedForeground }}>{MESSAGES.noSummary}</Text>
      )}
      <LoadingButton accessibilityLabel={MESSAGES.editAbout} onPress={() => setIsEditing(true)} variant="secondary">
        {MESSAGES.edit}
      </LoadingButton>
      {isEditing ? <AboutSheet onClose={() => setIsEditing(false)} profile={profile} /> : null}
    </View>
  );
}
