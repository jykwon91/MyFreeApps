/**
 * The input step of /analyze: the page's heading and intro, then the URL or
 * pasted-text form.
 */
import AnalyzeJdInput, { type AnalyzeInputMode } from "@/features/analyze/AnalyzeJdInput";

interface AnalyzeInputViewProps {
  mode: AnalyzeInputMode;
  urlValue: string;
  textValue: string;
  notice: string | null;
  onChangeMode: (mode: AnalyzeInputMode) => void;
  onChangeUrl: (next: string) => void;
  onChangeText: (next: string) => void;
  onSubmitUrl: () => void;
  onSubmitText: () => void;
  onPasteUrl: (pasted: string) => void;
}

export default function AnalyzeInputView(props: AnalyzeInputViewProps) {
  return (
    <>
      <header className="space-y-1 max-w-2xl">
        <h1 className="text-2xl font-semibold">Analyze a job</h1>
        <p className="text-sm text-muted-foreground">
          Paste a job description to see how it stacks up against your
          profile. We'll rank fit across skills, seniority, salary,
          location, and work authorization — then you can decide whether
          to add it to your applications.
        </p>
      </header>
      <div className="max-w-2xl rounded-lg border bg-card p-4 sm:p-6">
        {/* Submitting swaps this view for the processing one, so it's never shown mid-submit. */}
        <AnalyzeJdInput {...props} isSubmitting={false} />
      </div>
    </>
  );
}
