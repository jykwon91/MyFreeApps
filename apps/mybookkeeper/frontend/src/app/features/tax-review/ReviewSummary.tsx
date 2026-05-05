import { Sparkles } from "lucide-react";

export interface ReviewSummaryProps {
  summary: string;
}

export default function ReviewSummary({ summary }: ReviewSummaryProps) {
  return (
    <div className="bg-card border rounded-lg p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">AI Summary</p>
          <p className="text-sm leading-relaxed">{summary}</p>
        </div>
      </div>
    </div>
  );
}
