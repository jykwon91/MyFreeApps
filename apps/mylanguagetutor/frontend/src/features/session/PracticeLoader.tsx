import { useNavigate } from "react-router-dom";
import { SearchX } from "lucide-react";
import { EmptyState } from "@platform/ui";
import { useListLanguagesQuery, useListScenariosQuery } from "@/store/catalogApi";
import CatalogError from "@/features/catalog/CatalogError";
import PageSkeleton from "@/features/onboarding/PageSkeleton";
import PracticeSession from "@/features/session/PracticeSession";
import type { Profile } from "@/types/tutor/profile";

interface PracticeLoaderProps {
  profile: Profile;
  scenarioSlug: string | null;
}

/** Resolves the language + scenario for the practice screen, then starts it. */
export default function PracticeLoader({ profile, scenarioSlug }: PracticeLoaderProps) {
  const navigate = useNavigate();
  const languagesQuery = useListLanguagesQuery();
  const scenariosQuery = useListScenariosQuery(profile.language_code);

  if (languagesQuery.isError || scenariosQuery.isError) {
    const retry = () => {
      void languagesQuery.refetch();
      void scenariosQuery.refetch();
    };
    return <CatalogError onRetry={retry} />;
  }
  if (!languagesQuery.data || !scenariosQuery.data) return <PageSkeleton />;

  const language = languagesQuery.data.find((l) => l.code === profile.language_code);
  const scenario = scenariosQuery.data.find((s) => s.slug === scenarioSlug);
  if (!language || !scenario) {
    return (
      <EmptyState
        icon={<SearchX className="h-10 w-10" aria-hidden="true" />}
        heading="Scenario not found"
        body="That scenario isn't available. Pick one from the list to start practicing."
        action={{ label: "See scenarios", onClick: () => navigate("/scenarios") }}
      />
    );
  }

  return (
    <PracticeSession
      key={`${language.code}:${scenario.slug}:${profile.level}`}
      language={language}
      scenario={scenario}
      level={profile.level}
    />
  );
}
