import { useGetCurrentUserQuery } from "@platform/core/store/userApi";
import { confirmSecurityChange, TwoStepSection, useRefresh, useTheme, useTwoStepStatus } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView } from "react-native";
import { DELETE_ACCOUNT_ROUTE, SECURITY_INTRO_DISMISSED_KEY, WHAT_TWO_STEP_PROTECTS } from "../../constants/security";
import { useDismissal } from "../../hooks/useDismissal";
import type { SecurityScreenProps } from "../../types/SecurityScreenProps";
import DataPrivacySection from "./DataPrivacySection";
import DisplayNameSection from "./DisplayNameSection";
import SecurityIntro from "./SecurityIntro";
import SettingsCard from "./SettingsCard";
import { useDataExport } from "./useDataExport";

/** The website's Security page: the two-step intro, display name, two-step sign-in, and data & privacy. */
export default function SecurityScreen({ reloadSignal }: SecurityScreenProps) {
  const { colors, spacing } = useTheme();
  const user = useGetCurrentUserQuery();
  const twoStep = useTwoStepStatus(reloadSignal);
  const intro = useDismissal(SECURITY_INTRO_DISMISSED_KEY);
  const exportData = useDataExport(() => user.refetch().unwrap());

  async function reloadUser(): Promise<void> {
    await user.refetch();
  }

  async function reloadAll(): Promise<void> {
    await Promise.all([twoStep.reload(), reloadUser()]);
  }
  const { refreshControl } = useRefresh(reloadAll, user.error ?? twoStep.failure);

  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={refreshControl}
      style={{ backgroundColor: colors.background }}
    >
      {intro.isDismissed === false ? <SecurityIntro onDismiss={intro.dismiss} /> : null}
      <DisplayNameSection hasFailed={user.isError} onRetry={reloadUser} user={user.data} />
      <SettingsCard>
        <TwoStepSection
          confirmOwner={confirmSecurityChange}
          onTurnOn={() => router.push("/security/turn-on")}
          status={twoStep}
          whatItProtects={WHAT_TWO_STEP_PROTECTS}
        />
      </SettingsCard>
      <DataPrivacySection onDeleteAccount={() => router.push(DELETE_ACCOUNT_ROUTE)} onExport={exportData} />
    </ScrollView>
  );
}
