import { Link } from "react-router-dom";
import { EmptyState, StaleDataBanner, cn } from "@platform/ui";
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
import UsageCheckFailedNotice from "@/features/catalog/UsageCheckFailedNotice";
import SessionBlockNotice from "@/features/session/SessionBlockNotice";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";

interface ScenarioPathProps {
  profile: Profile;
}

/** The scenario learning path for the learner's language, with their level. */
export default function ScenarioPath({ profile }: ScenarioPathProps) {
  const { languageName, scenarios, isError, block, isUsageError, refetch } = useScenarioPath(profile);

  if (!scenarios) return isError ? <CatalogError onRetry={() => void refetch()} /> : <CatalogSkeleton />;

  return (
    <div className={CATALOG_PAGE}>
      {isError && (
        <StaleDataBanner
          message={CATALOG_COPY.showingLastLoaded}
          onRetry={() => void refetch()}
          retryLabel={CATALOG_COPY.retry}
        />
      )}
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
      {block && <SessionBlockNotice block={block} />}
      {isUsageError && <UsageCheckFailedNotice onRetry={() => void refetch()} />}
      {scenarios.length === 0 ? (
        <EmptyState heading={CATALOG_COPY.noScenariosHeading} body={CATALOG_COPY.noScenariosBody} />
      ) : (
        <ul className={SCENARIO_LIST}>
          {scenarios.map((scenario) => (
            <ScenarioCard key={scenario.slug} scenario={scenario} />
          ))}
        </ul>
      )}
    </div>
  );
}
