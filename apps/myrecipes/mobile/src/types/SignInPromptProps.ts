export interface SignInPromptProps {
  heading: string;
  body: string;
  /** Shown while the stored session is still being read. */
  skeletonTestID: string;
}
