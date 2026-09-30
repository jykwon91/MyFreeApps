import { skipToken } from "@reduxjs/toolkit/query";
import { useListLanguagesQuery, useListScenariosQuery } from "@/store/catalogApi";
import CatalogSkeleton from "@/features/catalog/CatalogSkeleton";
import CatalogError from "@/features/catalog/CatalogError";
import ScenarioCard from "@/features/catalog/ScenarioCard";

/**
 * Placeholder home: the supported language and its scenario learning path.
 * The voice conversation screen (start a session, speak, get replies) lands
 * in a follow-up PR.
 */
export default function Home() {
  const languagesQuery = useListLanguagesQuery();
  const language = languagesQuery.data?.[0];
  const scenariosQuery = useListScenariosQuery(language?.code ?? skipToken);

  if (languagesQuery.isError || scenariosQuery.isError) {
    const retry = () => {
      void languagesQuery.refetch();
      if (language) void scenariosQuery.refetch();
    };
    return (
      <div className="p-6 max-w-2xl">
        <CatalogError onRetry={retry} />
      </div>
    );
  }

  if (languagesQuery.isSuccess && !language) {
    return (
      <div className="p-6 max-w-2xl text-sm text-muted-foreground">
        No languages are available yet.
      </div>
    );
  }

  if (!language || !scenariosQuery.data) {
    return (
      <div className="p-6 max-w-2xl">
        <CatalogSkeleton />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">
          Practice {language.display_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {language.dialect_label} {language.display_name}. Voice conversations are
          coming soon. Here is the path you'll work through.
        </p>
      </div>
      <ul className="space-y-3">
        {scenariosQuery.data.map((scenario) => (
          <ScenarioCard key={scenario.slug} scenario={scenario} />
        ))}
      </ul>
    </div>
  );
}
