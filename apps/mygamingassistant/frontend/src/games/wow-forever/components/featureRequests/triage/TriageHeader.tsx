import clsx from "clsx";
import { Check, LogOut } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_TABS } from "@/games/wow-forever/data/featureRequests/triage/triageEnums";
import { TRIAGE_TAB_LABEL } from "@/games/wow-forever/data/featureRequests/triage/triageLabels";
import { TRIAGE_SECONDARY_BUTTON } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import { badgeCount } from "@/games/wow-forever/lib/featureRequests/triage/triageFormat";
import type { TriageTab } from "@/games/wow-forever/types/featureRequests/triage/triageTab";

interface TriageHeaderProps {
  tab: TriageTab;
  onTab: (tab: TriageTab) => void;
  /** Untriaged submissions; null while the inbox hasn't loaded. */
  inboxCount: number | null;
  onSignOut: () => void;
  signingOut: boolean;
  panelId: string;
}

/** Sticky: "Triage", the Inbox (n) / All requests tabs, and Sign out. */
export default function TriageHeader({ tab, onTab, inboxCount, onSignOut, signingOut, panelId }: TriageHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur" data-testid="triage-header">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <h1 className="mr-auto text-lg font-semibold">{TRIAGE_COPY.pageTitle}</h1>
        <LoadingButton
          type="button"
          variant="secondary"
          onClick={onSignOut}
          isLoading={signingOut}
          loadingText={TRIAGE_COPY.signingOut}
          className={TRIAGE_SECONDARY_BUTTON}
        >
          <LogOut size={16} aria-hidden />
          {TRIAGE_COPY.signOut}
        </LoadingButton>
        <div role="tablist" aria-label={TRIAGE_COPY.pageTitle} className="flex w-full gap-1">
          {TRIAGE_TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`${panelId}-tab-${t}`}
              aria-selected={t === tab}
              aria-controls={panelId}
              onClick={() => onTab(t)}
              className={clsx(
                "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium sm:flex-none",
                t === tab ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {TRIAGE_TAB_LABEL[t]}
              {t === "inbox" && inboxCount !== null ? (
                inboxCount === 0 ? (
                  <Check size={16} aria-label={TRIAGE_COPY.inboxEmpty} />
                ) : (
                  <span className="rounded-full bg-background/20 px-1.5 text-xs" aria-label={`${inboxCount} waiting`}>
                    {badgeCount(inboxCount)}
                  </span>
                )
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
