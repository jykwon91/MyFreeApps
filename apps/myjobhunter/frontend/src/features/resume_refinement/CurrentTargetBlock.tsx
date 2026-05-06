interface CurrentTargetBlockProps {
  text: string;
}

// Small amber-bordered block that quotes the verbatim source text the
// AI is targeting. Mirrors the highlight band the draft preview uses
// so users see "this is what we're refining" in two places at once.
export default function CurrentTargetBlock({ text }: CurrentTargetBlockProps) {
  return (
    <div className="rounded-md border border-amber-300/60 bg-amber-50/60 dark:bg-amber-500/10 p-3">
      <p className="text-[11px] uppercase tracking-wide text-amber-900/70 dark:text-amber-200/70 font-semibold mb-1">
        Currently
      </p>
      <p className="text-sm whitespace-pre-wrap">{text}</p>
    </div>
  );
}
