export interface CookLogSectionProps {
  recipeId: string;
  /** The version a new cook is logged against: the recipe's latest, the one this screen shows. */
  versionId: string;
  versionNumber: number;
  /** With only one version, which version a cook was is not worth saying. */
  versionCount: number;
}
