import { MIN_TOUCH_TARGET } from "@platform/mobile";

/** How tall each placeholder in the analysis skeleton is: the line it stands in for. */
export const ANALYSIS_SKELETON_HEIGHTS = {
  /** "Analyzed against your profile", in the xs size. */
  caption: 14,
  /** The role, in the xl heading size. */
  title: 30,
  /** The company and location, and the dimension's why, in the sm size. */
  line: 18,
  /** The posting's link, a full touch target. */
  link: MIN_TOUCH_TARGET,
  /** The verdict card: its heading, the verdict, and two lines of why. */
  verdict: 128,
  /** The "How it fits" section heading. */
  sectionHeading: 22,
  /** The dimension's name, in the md size. */
  dimensionName: 20,
  /** The decision row's buttons. */
  button: MIN_TOUCH_TARGET,
} as const;

/** Placeholder flags under each of the red and green flag chips. */
export const ANALYSIS_SKELETON_FLAGS = ["first", "second"] as const;

/** The two flag lists the result shows: red, then green. */
export const ANALYSIS_SKELETON_FLAG_LISTS = ["red", "green"] as const;

/** The decision row's buttons: Add to applications and Analyze another. */
export const ANALYSIS_SKELETON_BUTTONS = ["add", "another"] as const;
