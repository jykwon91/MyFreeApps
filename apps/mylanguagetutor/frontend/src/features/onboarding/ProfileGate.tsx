import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import CatalogError from "@/features/catalog/CatalogError";
import PageSkeleton from "@/features/onboarding/PageSkeleton";
import { ONBOARDING_LANGUAGE_PATH } from "@mylanguagetutor/api-client/constants/onboardingLanguagePath";
import { useGetProfileQuery } from "@mylanguagetutor/api-client/store/profileApi";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";

interface ProfileGateProps {
  children: (profile: Profile) => ReactNode;
}

/**
 * Renders ``children`` once the learner's profile is loaded; sends a learner
 * who hasn't onboarded yet to the language picker.
 */
export default function ProfileGate({ children }: ProfileGateProps) {
  const { data: profile, isError, refetch } = useGetProfileQuery();
  if (isError) return <CatalogError onRetry={() => void refetch()} />;
  if (profile === undefined) return <PageSkeleton />;
  if (profile === null) return <Navigate to={ONBOARDING_LANGUAGE_PATH} replace />;
  return <>{children(profile)}</>;
}
