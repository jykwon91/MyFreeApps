export interface EmailSentNoticeProps {
  appName: string;
  /** What was sent and where, such as "We sent a verification link to ...". */
  message: string;
  /** A second line, such as where the link opens. */
  note?: string;
  onSignIn: () => void;
}
