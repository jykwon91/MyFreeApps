export interface ScenarioGoalsProps {
  goals: string[];
  /** 0-based indexes of the goals already met (worked out by the server). */
  met: number[];
}
