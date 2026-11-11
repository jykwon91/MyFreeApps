export interface AnalyzeLinkFieldsProps {
  value: string;
  onChange: (url: string) => void;
  onAnalyze: () => Promise<void>;
  onPaste: () => Promise<void>;
}
