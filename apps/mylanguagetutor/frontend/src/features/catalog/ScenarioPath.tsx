import { Link } from "react-router-dom";
import { cn } from "@platform/ui";
import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";
import { useScenarioPath } from "@mylanguagetutor/api-client/hooks/useScenarioPath";
import { levelLabel } from "@mylanguagetutor/api-client/utils/levelLabel";
import { onboardingLevelPath } from "@mylanguagetutor/api-client/utils/onboardingLevelPath";
import {
  CATALOG_HEADER,
  CATALOG_HEADER_LINE,
  CATALOG_PAGE,
  CATALOG_TOUCH_ROW,
  SCENARIO_LIST,
  TWO_TEXT_LINES,
} from "@/constants/catalogLayout";
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
    <div className={CATALOG_PAGE}>
      <div className={CATALOG_HEADER}>
        <h1 className="text-2xl font-semibold">{`${CATALOG_COPY.practicePrefix} ${languageName}`}</h1>
        <p className={cn(CATALOG_HEADER_LINE, "text-muted-foreground")}>
          {`${CATALOG_COPY.levelPrefix} ${levelLabel(profile.level)}`} ·{" "}
          <Link
            to={onboardingLevelPath(profile.language_code)}
            className={cn(CATALOG_TOUCH_ROW, "underline")}
          >
            {CATALOG_COPY.changeLevel}
          </Link>
        </p>
        <p className={cn(CATALOG_HEADER_LINE, "text-muted-foreground", TWO_TEXT_LINES)}>{CATALOG_COPY.pickScenario}</p>
      </div>
      {isCapReached && <SessionBlockNotice block="daily_limit" />}
      <ul className={SCENARIO_LIST}>
        {scenarios.map((scenario) => (
          <ScenarioCard key={scenario.slug} scenario={scenario} />
        ))}
      </ul>
    </div>
  );
}
