export interface DataPrivacySectionProps {
  /** What the export holds, in this app's words. */
  exportDescription: string;
  onExport: () => Promise<void>;
  onDeleteAccount: () => void;
}
