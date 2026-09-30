import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import CatalogError from "@/features/catalog/CatalogError";
import PageSkeleton from "@/features/onboarding/PageSkeleton";
import { useGetProfileQuery } from "@/store/profileApi";
import type { Profile } from "@/types/tutor/profile";

interface ProfileGateProps {
  children: (profile: Profile) => ReactNode;
}

/**
 * Renders ``children`` once the learner's profile is loaded; sends a learner
 * who hasn't onboarded yet to the language picker.
 */
export default function ProfileGate({ children }: ProfileGateProps) {
  const { data: profile, isLoading, isError, refetch } = useGetProfileQuery();
  if (isError) return <CatalogError onRetry={() => void refetch()} />;
  if (isLoading || profile === undefined) return <PageSkeleton />;
  if (profile === null) return <Navigate to="/onboarding/language" replace />;
  return <>{children(profile)}</>;
}
