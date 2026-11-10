/** What the application screen asks of expo-router, recorded so tests can check where it went. */
export const mockRouter = {
  /** Going back runs into an active leave guard the way the real router does: the guard's callback runs instead. */
  back: jest.fn(() => {
    const { active, callback } = mockRouter.preventRemove;
    if (active) callback?.({ repeat: () => undefined });
  }),
  push: jest.fn(),
  /** The leave guard usePreventRemove set up, if one is on. */
  preventRemove: { active: false, callback: null as ((event: { repeat: () => void }) => void) | null },
};
