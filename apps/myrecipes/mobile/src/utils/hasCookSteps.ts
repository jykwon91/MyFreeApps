import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import { nonBlankSteps } from "./nonBlankSteps";

export function hasCookSteps(version: VersionResponse): boolean {
  return nonBlankSteps(version.steps).length > 0;
}
