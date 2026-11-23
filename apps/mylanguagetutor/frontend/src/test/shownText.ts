/**
 * Query options for text the learner sees, leaving out the screen-reader-only copy that the practice
 * announcer also holds (a message is in both places on purpose).
 */
export const SHOWN = { ignore: '[data-testid="practice-announcer"], [data-testid="practice-announcer"] *' };
