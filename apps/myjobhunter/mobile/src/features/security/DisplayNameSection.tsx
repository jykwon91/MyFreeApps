import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { SECURITY_MESSAGES as MESSAGES } from "../../constants/security";
import type { DisplayNameSectionProps } from "../../types/DisplayNameSectionProps";
import SectionError from "../applicationDetail/SectionError";
import DisplayNameForm from "./DisplayNameForm";
import DisplayNameSkeleton from "./DisplayNameSkeleton";
import SettingsCard from "./SettingsCard";

/** The name shown in the profile and on exported data. */
export default function DisplayNameSection({ user, hasFailed, onRetry }: DisplayNameSectionProps) {
  const { colors, fontSize } = useTheme();
  return (
    <SettingsCard>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600" }}>
        {MESSAGES.displayNameHeading}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.displayNameBody}</Text>
      {user ? (
        <DisplayNameForm initialName={user.display_name} key={user.id} />
      ) : hasFailed ? (
        <SectionError message={MESSAGES.displayNameLoadFailed} onRetry={onRetry} retryLabel={MESSAGES.tryAgain} />
      ) : (
        <DisplayNameSkeleton />
      )}
    </SettingsCard>
  );
}
