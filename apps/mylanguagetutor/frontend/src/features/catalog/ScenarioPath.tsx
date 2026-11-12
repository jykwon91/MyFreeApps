import { Link } from "react-router-dom";
import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";
import { useScenarioPath } from "@mylanguagetutor/api-client/hooks/useScenarioPath";
import { levelLabel } from "@mylanguagetutor/api-client/utils/levelLabel";
import { onboardingLevelPath } from "@mylanguagetutor/api-client/utils/onboardingLevelPath";
import CatalogSkeleton from "@/features/catalog/CatalogSkeleton";
import CatalogError from "@/features/catalog/CatalogError";
import ScenarioCard from "@/features/catalog/ScenarioCard";
import SessionBlockNotice from "@/features/session/SessionBlockNotice";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";

interface ScenarioPathProps {
  profile: Profile;
}

/** The scenario learning path for the learner's language, with their level. */
export default function ScenarioPath({ profile }: ScenarioPathProps) {
  const { languageName, scenarios, isError, isCapReached, refetch } = useScenarioPath(profile);

  if (isError) return <CatalogError onRetry={() => void refetch()} />;
  if (!scenarios) return <CatalogSkeleton />;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{`${CATALOG_COPY.practicePrefix} ${languageName}`}</h1>
        <p className="text-sm text-muted-foreground">
          {`${CATALOG_COPY.levelPrefix} ${levelLabel(profile.level)}`} ·{" "}
          <Link
            to={onboardingLevelPath(profile.language_code)}
            className="inline-flex min-h-[44px] items-center underline"
          >
            {CATALOG_COPY.changeLevel}
          </Link>
        </p>
        <p className="text-sm text-muted-foreground">{CATALOG_COPY.pickScenario}</p>
      </div>
      {isCapReached && <SessionBlockNotice block="daily_limit" />}
      <ul className="space-y-3">
        {scenarios.map((scenario) => (
          <ScenarioCard key={scenario.slug} scenario={scenario} />
        ))}
      </ul>
    </div>
  );
}
