import { formatWorkAuthStatus } from "@myjobhunter/api-client/utils/formatWorkAuthStatus";
import { formatSalaryRange } from "@platform/core/utils/salaryRange";
import { Chip, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { PROFILE_MESSAGES as MESSAGES } from "../../constants/profile";
import type { ProfileProps } from "../../types/ProfileProps";
import OverviewFact from "../applicationDetail/OverviewFact";
import SectionHeading from "../applicationDetail/SectionHeading";
import RemotePreferenceField from "./RemotePreferenceField";

/** Target salary, work authorization and locations, as the website shows them, and the remote preference to change. */
export default function PreferencesSection({ profile }: ProfileProps) {
  const { colors, spacing, fontSize } = useTheme();
  const salary = formatSalaryRange(profile.desired_salary_min, profile.desired_salary_max, profile.salary_currency, profile.salary_period);
  return (
    <View style={{ gap: spacing.md }} testID="profile-preferences">
      <SectionHeading title={MESSAGES.preferencesTitle} />
      <OverviewFact label={MESSAGES.salaryLabel} value={salary} />
      <OverviewFact label={MESSAGES.workAuthLabel} value={formatWorkAuthStatus(profile.work_auth_status)} />
      <View style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.xs, fontWeight: "500", color: colors.mutedForeground }}>{MESSAGES.locationsLabel.toUpperCase()}</Text>
        {profile.locations.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {profile.locations.map((location) => (
              <Chip key={location} label={location} />
            ))}
          </View>
        ) : (
          <Text style={{ fontSize: fontSize.sm, fontStyle: "italic", color: colors.mutedForeground }}>{MESSAGES.noLocations}</Text>
        )}
      </View>
      <RemotePreferenceField preference={profile.remote_preference} />
    </View>
  );
}
