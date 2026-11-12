import { useGetCurrentUserQuery } from "@platform/core/store/userApi";
import { ScrollView } from "react-native";
import { confirmSecurityChange } from "../auth/confirmSecurityChange";
import { useDataExport } from "../hooks/useDataExport";
import { useDismissal } from "../hooks/useDismissal";
import { useRefresh } from "../hooks/useRefresh";
import { useTwoStepStatus } from "../hooks/useTwoStepStatus";
import { useTheme } from "../theme/useTheme";
import type { SecurityScreenProps } from "../types/SecurityScreenProps";
import DataPrivacySection from "./DataPrivacySection";
import DisplayNameSection from "./DisplayNameSection";
import SecurityIntro from "./SecurityIntro";
import SettingsCard from "./SettingsCard";
import TwoStepSection from "./TwoStepSection";

/** The website's Security page: the two-step intro, display name, two-step sign-in, and data & privacy. */
export default function SecurityScreen({ reloadSignal, content, introDismissedKey, dataExport, onTurnOn, onDeleteAccount }: SecurityScreenProps) {
  const { colors, spacing } = useTheme();
  const user = useGetCurrentUserQuery();
  const twoStep = useTwoStepStatus(reloadSignal);
  const intro = useDismissal(introDismissedKey);
  const exportData = useDataExport(dataExport, () => user.refetch().unwrap());

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
      {intro.isDismissed === false ? <SecurityIntro message={content.intro} onDismiss={intro.dismiss} /> : null}
      <DisplayNameSection description={content.displayNameDescription} hasFailed={user.isError} onRetry={reloadUser} user={user.data} />
      <SettingsCard>
        <TwoStepSection confirmOwner={confirmSecurityChange} onTurnOn={onTurnOn} status={twoStep} whatItProtects={content.whatTwoStepProtects} />
      </SettingsCard>
      <DataPrivacySection exportDescription={content.exportDescription} onDeleteAccount={onDeleteAccount} onExport={exportData} />
    </ScrollView>
  );
}
