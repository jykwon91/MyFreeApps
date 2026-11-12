export interface ResumeComposerProps {
  value: string;
  onChange: (text: string) => void;
  onSend: () => Promise<void>;
  onRegenerate: () => Promise<void>;
  isBusy: boolean;
  /** The assistant asked a question, which the same box answers. */
  isClarify: boolean;
}
