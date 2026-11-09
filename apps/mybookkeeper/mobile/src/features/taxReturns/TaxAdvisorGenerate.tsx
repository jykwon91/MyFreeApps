import { TAX_ADVISOR_CTA_MESSAGES } from "@mybookkeeper/api-client/constants/taxAdvisor";
import type { AdvisorCtaState } from "@mybookkeeper/api-client/types/tax/AdvisorCtaState";
import { Banner, LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { TAX_ADVISOR_MESSAGES as MESSAGES } from "../../constants/taxAdvisor";

interface TaxAdvisorGenerateProps {
  state: AdvisorCtaState;
  label: string;
  isGenerating: boolean;
  isAdmin: boolean;
  onGenerate: () => Promise<void>;
  /** True on the first ask, which says what the advisor does. A regenerate has nothing to explain until it fails. */
  isFirstAsk: boolean;
}

/** Asks the advisor for advice. Only owners and admins can, as the server decides. Nothing to press once today's limit is hit or in the demo workspace. */
export default function TaxAdvisorGenerate({ state, label, isGenerating, isAdmin, onGenerate, isFirstAsk }: TaxAdvisorGenerateProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      {state !== "idle" ? <Banner message={TAX_ADVISOR_CTA_MESSAGES[state]} /> : null}
      {state === "idle" && isFirstAsk ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{TAX_ADVISOR_CTA_MESSAGES.idle}</Text> : null}
      {!isAdmin ? (isFirstAsk ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.adminsOnly}</Text>
      ) : null) : state !== "rate-limited" && state !== "demo" ? (
        <LoadingButton isLoading={isGenerating} loadingText={MESSAGES.reviewingButton} onPress={onGenerate} variant={isFirstAsk ? "primary" : "secondary"}>
          {label}
        </LoadingButton>
      ) : null}
    </View>
  );
}
