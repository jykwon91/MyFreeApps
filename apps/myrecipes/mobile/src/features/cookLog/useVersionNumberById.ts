import { useListVersionsQuery } from "@myrecipes/api-client/store/recipesApi";
import { useMemo } from "react";

/**
 * Each version's number by its id, so a cook can say which version it was, as the website's "v3" does.
 * A recipe with one version never says, so its versions aren't asked for.
 */
export function useVersionNumberById(recipeId: string, versionCount: number): Record<string, number> {
  const { data: versions } = useListVersionsQuery(recipeId, { skip: versionCount < 2 });

  return useMemo(() => {
    const numbers: Record<string, number> = {};
    for (const version of versions ?? []) numbers[version.id] = version.version_number;
    return numbers;
  }, [versions]);
}
