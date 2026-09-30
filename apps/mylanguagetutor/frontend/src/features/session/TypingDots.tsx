const DOT_DELAYS_MS = [0, 150, 300];

/** "The tutor is thinking" -- shown between sending a turn and the first words. */
export default function TypingDots() {
  return (
    <div className="flex justify-start">
      <div
        className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-4 py-3"
        role="status"
        aria-label="The tutor is thinking"
      >
        {DOT_DELAYS_MS.map((delay) => (
          <span
            key={delay}
            className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
