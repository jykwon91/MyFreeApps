import { ONBOARDING_LANGUAGE_PATH } from "@mylanguagetutor/api-client/constants/onboardingLanguagePath";
import { useGetProfileQuery } from "@mylanguagetutor/api-client/store/profileApi";
import { EmptyState, useRefresh } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { CATALOG_MESSAGES, SCENARIO_SKELETON_ROWS } from "../../constants/catalog";
import { PROFILE_GATE_MESSAGES } from "../../constants/onboarding";
import type { ProfileGateProps } from "../../types/ProfileGateProps";
import CardListSkeleton from "../catalog/CardListSkeleton";
import CatalogLoadError from "../catalog/CatalogLoadError";

/**
 * Shows `children` once the learner's profile has loaded. A learner who hasn't onboarded is sent to
 * the language step, as on the website. It opens over this tab, so going back leaves them here, with
 * Settings in reach and a way to start again, rather than sending them straight back.
 */
export default function ProfileGate({ children }: ProfileGateProps) {
  const { data: profile, error, isError, refetch } = useGetProfileQuery();
  const { refresh, isRefreshing } = useRefresh(refetch, error);
  const hasOpenedOnboarding = useRef(false);

  useEffect(() => {
    if (profile !== null || hasOpenedOnboarding.current) return;
    hasOpenedOnboarding.current = true;
    router.push(ONBOARDING_LANGUAGE_PATH);
  }, [profile]);

  if (profile) return children(profile);
  if (isError) return <CatalogLoadError isRetrying={isRefreshing} onRetry={refresh} />;
  if (profile === undefined) {
    return <CardListSkeleton accessibilityLabel={CATALOG_MESSAGES.loadingScenarios} rows={SCENARIO_SKELETON_ROWS} />;
  }
  return (
    <EmptyState
      action={{ label: PROFILE_GATE_MESSAGES.action, onPress: () => router.push(ONBOARDING_LANGUAGE_PATH) }}
      body={PROFILE_GATE_MESSAGES.body}
      heading={PROFILE_GATE_MESSAGES.heading}
    />
  );
}
