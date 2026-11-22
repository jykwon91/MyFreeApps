export interface StaleDataBannerProps {
  /** Says a refresh failed and that what's on screen is what loaded before. */
  message: string;
  /** When given, the banner offers a button that runs it. */
  onRetry?: () => void;
  /** The retry button's label. Required with `onRetry`, so the app words it. */
  retryLabel?: string;
  className?: string;
}
