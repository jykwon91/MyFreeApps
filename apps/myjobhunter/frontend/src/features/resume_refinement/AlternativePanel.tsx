import { LoadingButton } from "@platform/ui";

interface AlternativePanelProps {
  hint: string;
  onChange: (s: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  isPending: boolean;
}

export default function AlternativePanel({
  hint,
  onChange,
  onCancel,
  onSubmit,
  isPending,
}: AlternativePanelProps) {
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <input
        value={hint}
        onChange={(e) => onChange(e.target.value)}
        placeholder='Optional nudge — e.g. "more concise" or "emphasize leadership"'
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <LoadingButton isLoading={isPending} onClick={onSubmit}>
          Try again
        </LoadingButton>
      </div>
    </div>
  );
}
