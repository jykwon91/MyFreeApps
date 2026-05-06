import { LoadingButton } from "@platform/ui";

interface ClarifyingPanelProps {
  question: string;
  customText: string;
  onCustomTextChange: (s: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export default function ClarifyingPanel({
  question,
  customText,
  onCustomTextChange,
  onSubmit,
  isPending,
}: ClarifyingPanelProps) {
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
        {question}
      </div>
      <textarea
        value={customText}
        onChange={(e) => onCustomTextChange(e.target.value)}
        rows={3}
        placeholder="Your answer or your own rewrite…"
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
      />
      <div className="flex justify-end">
        <LoadingButton
          isLoading={isPending}
          onClick={onSubmit}
          disabled={!customText.trim()}
        >
          Use this
        </LoadingButton>
      </div>
    </div>
  );
}
