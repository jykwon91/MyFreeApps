export interface AnalyzeTextFieldsProps {
  value: string;
  /** Why it can't be analyzed as it is, shown under the field. */
  error: string | null;
  onChange: (text: string) => void;
  onAnalyze: () => Promise<void>;
}
