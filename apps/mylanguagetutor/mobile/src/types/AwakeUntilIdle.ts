export interface AwakeUntilIdle {
  /** Whether to keep the screen awake now. */
  awake: boolean;
  /** The learner did something: keeps the screen awake for another idle period. */
  onActivity: () => void;
}
