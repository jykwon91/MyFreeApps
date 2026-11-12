/** How a screen hears how a refinement action went: a confirmation to show, or the error to describe. */
export interface RefinementActionCallbacks {
  onSuccess: (message: string) => void;
  onError: (error: unknown) => void;
}
