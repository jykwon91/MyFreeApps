import { useGetScreeningProvidersQuery, useLazyGetScreeningRedirectQuery } from "@mybookkeeper/api-client/store/screeningApi";
import type { ScreeningProviderInfo } from "@mybookkeeper/api-client/types/applicant/screening-provider-info";
import { Banner, LoadingButton, Skeleton, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { couldntOpenProviderMessage, learnMoreLabel, openedProviderMessage, SCREENING_MESSAGES } from "../../constants/applicantScreening";
import { useOpenLink } from "../inquiries/useOpenLink";

export default function ScreeningProviders({ applicantId }: { applicantId: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const { data, error, isLoading, refetch } = useGetScreeningProvidersQuery(applicantId);
  const openLink = useOpenLink();
  const [fetchRedirect] = useLazyGetScreeningRedirectQuery();
  const [openingName, setOpeningName] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);

  // The phone's browser, not an in-app one: that's where the host's provider login is saved.
  async function open(provider: ScreeningProviderInfo): Promise<void> {
    setOpeningName(provider.name);
    setOpened(null);
    try {
      const { redirect_url: url } = await fetchRedirect({ applicantId, provider: provider.name }).unwrap();
      await Linking.openURL(url);
      setOpened(provider.label);
    } catch {
      showToast(couldntOpenProviderMessage(provider.label), "error");
    } finally {
      setOpeningName(null);
    }
  }

  if (isLoading) return <Skeleton height={96} />;
  if (error || !data) {
    return (
      <Banner
        actions={[{ label: SCREENING_MESSAGES.tryAgain, onPress: () => void refetch() }]}
        message={SCREENING_MESSAGES.couldntLoadProviders}
      />
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {opened ? <Banner message={openedProviderMessage(opened)} /> : null}
      {data.providers.map((provider) => (
        <View key={provider.name} style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{provider.label}</Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{provider.description}</Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`${provider.cost_label} · ${provider.turnaround_label}`}</Text>
          <LoadingButton
            accessibilityHint="Opens in your browser"
            disabled={openingName !== null}
            isLoading={openingName === provider.name}
            loadingText={SCREENING_MESSAGES.opening}
            onPress={() => void open(provider)}
            variant="secondary"
          >
            {`Open ${provider.label}`}
          </LoadingButton>
          <LoadingButton accessibilityHint="Opens in your browser" accessibilityLabel={learnMoreLabel(provider.label)} onPress={() => void openLink(provider.external_url)} variant="ghost">
            {SCREENING_MESSAGES.learnMore}
          </LoadingButton>
        </View>
      ))}
    </View>
  );
}
