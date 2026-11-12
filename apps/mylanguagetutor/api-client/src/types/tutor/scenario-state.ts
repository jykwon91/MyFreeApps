/** Mirrors backend ``ScenarioState``: 0-based indexes into ``Scenario.goals``. */
export interface ScenarioState {
  goals_met: number[];
  complete: boolean;
}
