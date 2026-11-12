/** Mirrors backend ``ScenarioResponse`` (app/schemas/tutor/catalog_schemas.py). */
export interface Scenario {
  slug: string;
  title: string;
  goal: string;
  goals: string[];
  order: number;
}
