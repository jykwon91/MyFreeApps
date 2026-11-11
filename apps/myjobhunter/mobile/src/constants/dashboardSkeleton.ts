/** One per card under each stage in the skeleton. */
export const DASHBOARD_SKELETON_CARDS = ["a", "b", "c"] as const;

/** One per stage section in the skeleton, which shows the first stages a phone screen fits. */
export const DASHBOARD_SKELETON_STAGES = ["applied", "interviewing"] as const;

/**
 * Heights of the skeleton's bars, each the line height of the text it stands in for,
 * so the board doesn't shift when it arrives.
 */
export const DASHBOARD_SKELETON_HEIGHTS = {
  /** "Pipeline" */
  summaryTitle: 24,
  /** "N applications on your board" */
  summaryCount: 16,
  /** A stage tile: its label, count and padding. */
  stageTile: 76,
  /** A stage's heading. */
  stageTitle: 22,
  /** A lane's heading. */
  laneTitle: 14,
  /** A card's role. */
  cardRole: 20,
  /** A card's company. */
  cardCompany: 16,
} as const;
