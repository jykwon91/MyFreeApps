import { Link } from "react-router-dom";
import { useListLanguagesQuery, useListScenariosQuery } from "@/store/catalogApi";
import { useGetUsageTodayQuery } from "@/store/usageApi";
import { levelLabel } from "@/features/onboarding/levelOptions";
import CatalogSkeleton from "@/features/catalog/CatalogSkeleton";
import CatalogError from "@/features/catalog/CatalogError";
import ScenarioCard from "@/features/catalog/ScenarioCard";
import SessionBlockNotice from "@/features/session/SessionBlockNotice";
import type { Profile } from "@/types/tutor/profile";

interface ScenarioPathProps {
  profile: Profile;
}

/** The scenario learning path for the learner's language, with their level. */
export default function ScenarioPath({ profile }: ScenarioPathProps) {
  const languagesQuery = useListLanguagesQuery();
  const scenariosQuery = useListScenariosQuery(profile.language_code);
  const usage = useGetUsageTodayQuery();
  const language = languagesQuery.data?.find((l) => l.code === profile.language_code);

  if (languagesQuery.isError || scenariosQuery.isError) {
    const retry = () => {
      void languagesQuery.refetch();
      void scenariosQuery.refetch();
    };
    return <CatalogError onRetry={retry} />;
  }
  if (!languagesQuery.data || !scenariosQuery.data) return <CatalogSkeleton />;

  const languageName = language?.display_name ?? profile.language_code;
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Practice {languageName}</h1>
        <p className="text-sm text-muted-foreground">
          Level: {levelLabel(profile.level)} ·{" "}
          <Link
            to={`/onboarding/level?language=${encodeURIComponent(profile.language_code)}`}
            className="inline-flex min-h-[44px] items-center underline"
          >
            Change level
          </Link>
        </p>
        <p className="text-sm text-muted-foreground">
          Pick a scenario. Each one is a short conversation with a few goals to cover.
        </p>
      </div>
      {usage.data?.cap_reached && <SessionBlockNotice block="daily_limit" />}
      <ul className="space-y-3">
        {scenariosQuery.data.map((scenario) => (
          <ScenarioCard key={scenario.slug} scenario={scenario} />
        ))}
      </ul>
    </div>
  );
}
