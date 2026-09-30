import { RefreshCw } from "lucide-react";
import LoadingButton from "../ui/LoadingButton";

export interface NewVersionPromptProps {
  /**
   * True while an automatic reload is already under way — the button shows a
   * spinner instead of inviting a second click.
   */
  isReloading?: boolean;
}

/**
 * Shown when this tab is running a build that a deploy has since replaced
 * (a lazy chunk it needs no longer exists). Reloading loads the new build.
 */
export default function NewVersionPrompt({ isReloading = false }: NewVersionPromptProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 min-h-[50vh]" role="alert">
      <div className="max-w-md text-center flex flex-col items-center gap-3">
        <RefreshCw size={40} className="text-primary/50" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-foreground">A new version was released</h2>
        <p className="text-sm text-muted-foreground">
          This app was updated after you opened this tab. Reload to get the latest version —
          you won&apos;t lose anything that was already saved.
        </p>
        <LoadingButton
          variant="primary"
          isLoading={isReloading}
          loadingText="Reloading..."
          onClick={() => window.location.reload()}
        >
          Reload
        </LoadingButton>
      </div>
    </div>
  );
}
