import { LoadingButton } from "@platform/ui";

interface CustomRewritePanelProps {
  customText: string;
  onChange: (s: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  isPending: boolean;
}

export default function CustomRewritePanel({
  customText,
  onChange,
  onCancel,
  onSubmit,
  isPending,
}: CustomRewritePanelProps) {
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <textarea
        value={customText}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="Type the version you want…"
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
        <LoadingButton
          isLoading={isPending}
          onClick={onSubmit}
          disabled={!customText.trim()}
        >
          Use my version
        </LoadingButton>
      </div>
    </div>
  );
}
