/** Mirrors the loaded PIN-form card while the public gate check is in flight. */
export default function PublicWelcomeManualGateSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted px-4">
      <div
        className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm space-y-4 animate-pulse"
        data-testid="public-welcome-manual-gate-skeleton"
      >
        <div className="h-6 w-2/3 mx-auto bg-muted-foreground/20 rounded" />
        <div className="h-4 w-full bg-muted-foreground/10 rounded" />
        <div className="h-11 w-full bg-muted-foreground/10 rounded-md" />
        <div className="h-11 w-full bg-muted-foreground/20 rounded-md" />
      </div>
    </div>
  );
}
