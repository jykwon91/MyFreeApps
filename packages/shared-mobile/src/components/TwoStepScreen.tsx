import { ScrollView, Text, View } from "react-native";
import { TWO_STEP_MESSAGES as MESSAGES } from "../constants/twoStep";
import { useRefresh } from "../hooks/useRefresh";
import { useTwoStepStatus } from "../hooks/useTwoStepStatus";
import { useTheme } from "../theme/useTheme";
import type { TwoStepScreenProps } from "../types/TwoStepScreenProps";
import TwoStepSection from "./TwoStepSection";
import WebLink from "./WebLink";

/** A Security screen that is only two-step sign-in, sending the rest of the page to the website. */
export default function TwoStepScreen({ whatItProtects, webBaseUrl, webPath, confirmOwner, onTurnOn, reloadSignal }: TwoStepScreenProps) {
  const { colors, spacing, fontSize } = useTheme();
  const status = useTwoStepStatus(reloadSignal);
  const { refreshControl } = useRefresh(status.reload, status.failure);

  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={status.enabled === null ? undefined : refreshControl}
    >
      <TwoStepSection confirmOwner={confirmOwner} onTurnOn={onTurnOn} status={status} whatItProtects={whatItProtects} />
      {status.enabled === null ? null : (
        <View>
          <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.websiteNote}</Text>
          <WebLink label={MESSAGES.openWebsite} webPath={webPath} webBaseUrl={webBaseUrl} />
        </View>
      )}
    </ScrollView>
  );
}
