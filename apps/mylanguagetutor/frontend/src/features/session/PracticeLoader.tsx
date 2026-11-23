import { useNavigate } from "react-router-dom";
import { SearchX } from "lucide-react";
import { EmptyState } from "@platform/ui";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { usePracticeScenario } from "@mylanguagetutor/api-client/hooks/usePracticeScenario";
import CatalogError from "@/features/catalog/CatalogError";
import { LOADING_COPY } from "@mylanguagetutor/api-client/constants/loadingCopy";
import PracticeSession from "@/features/session/PracticeSession";
import PracticeSkeleton from "@/features/session/PracticeSkeleton";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";

interface PracticeLoaderProps {
  profile: Profile;
  scenarioSlug: string;
}

/** Resolves the language + scenario for the practice screen, then starts it. */
export default function PracticeLoader({ profile, scenarioSlug }: PracticeLoaderProps) {
  const navigate = useNavigate();
  const { target, isError, refetch } = usePracticeScenario(profile, scenarioSlug);

  // A failed background refetch must not unmount a session already on screen, so errors only show with no target yet.
  if (target === undefined) {
    return isError ? <CatalogError onRetry={() => void refetch()} /> : <PracticeSkeleton label={LOADING_COPY.scenarios} />;
  }

  if (!target) {
    return (
      <EmptyState
        icon={<SearchX className="h-10 w-10" aria-hidden="true" />}
        heading={PRACTICE_COPY.scenarioNotFound}
        body={PRACTICE_COPY.scenarioNotFoundBody}
        action={{ label: PRACTICE_COPY.seeScenarios, onClick: () => navigate("/scenarios") }}
      />
    );
  }

  const { language, scenario } = target;
  return (
    <PracticeSession
      key={`${language.code}:${scenario.slug}:${profile.level}`}
      language={language}
      scenario={scenario}
      level={profile.level}
    />
  );
}
