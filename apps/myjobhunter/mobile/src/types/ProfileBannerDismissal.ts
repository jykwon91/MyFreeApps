export interface ProfileBannerDismissal {
  /** Null until the phone has said whether it was dismissed before. */
  isDismissed: boolean | null;
  dismiss: () => void;
}
