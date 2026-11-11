import type { JobAnalysisSource } from "@myjobhunter/api-client/types/job-analysis/job-analysis-source";

export interface AnalyzeInputStepProps {
  source: JobAnalysisSource;
  onSourceChange: (source: JobAnalysisSource) => void;
  urlValue: string;
  onUrlChange: (url: string) => void;
  onAnalyzeLink: () => Promise<void>;
  onPasteLink: () => Promise<void>;
  textValue: string;
  onTextChange: (text: string) => void;
  /** Why the pasted text can't be analyzed as it is. */
  textError: string | null;
  onAnalyzeText: () => Promise<void>;
}
