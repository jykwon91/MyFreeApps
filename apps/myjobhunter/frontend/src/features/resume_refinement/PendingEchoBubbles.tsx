interface PendingEchoBubblesProps {
  text: string;
}

// Optimistic pair: the user's just-sent composer message (same markup
// as a real user turn) plus an assistant thinking indicator until the
// proposal lands. role="status" aria-live="polite" matches the app's
// existing convention (VerdictBanner, DiscoveredJobCard).
export default function PendingEchoBubbles({ text }: PendingEchoBubblesProps) {
  return (
    <>
      <li className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[80%] flex flex-col">
          <div className="rounded-2xl rounded-tr-sm bg-primary/10 border border-primary/20 px-3 py-2 text-sm text-foreground whitespace-pre-wrap break-words">
            <span className="sr-only">You said: </span>
            {text}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 text-right pr-1">
            sending…
          </p>
        </div>
      </li>
      <li className="flex justify-start">
        <div className="max-w-[85%] sm:max-w-[80%]">
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl rounded-tl-sm bg-muted/50 border border-border px-3 py-2 text-sm text-muted-foreground"
          >
            Hmm, let me think. Working on a suggestion…
          </div>
        </div>
      </li>
    </>
  );
}
