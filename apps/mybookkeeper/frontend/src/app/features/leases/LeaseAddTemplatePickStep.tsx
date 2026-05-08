import AlertBox from "@/shared/components/ui/AlertBox";
import Button from "@/shared/components/ui/Button";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Skeleton from "@/shared/components/ui/Skeleton";
import type { LeaseTemplateSummary } from "@/shared/types/lease/lease-template-summary";

export interface LeaseAddTemplatePickStepProps {
  available: LeaseTemplateSummary[];
  linkedSet: Set<string>;
  selectedIds: string[];
  onToggle: (template: LeaseTemplateSummary) => void;
  isError: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isPrefilling: boolean;
  onRetry: () => void;
  onContinue: () => void;
  onClose: () => void;
}

/**
 * Step 1 of the Add Document modal: pick one or more templates from the
 * host's library. Already-linked templates are listed with a small
 * "picking will regenerate" badge so the host can knowingly trigger a
 * regenerate via the same flow.
 */
export default function LeaseAddTemplatePickStep({
  available,
  linkedSet,
  selectedIds,
  onToggle,
  isError,
  isLoading,
  isFetching,
  isPrefilling,
  onRetry,
  onContinue,
  onClose,
}: LeaseAddTemplatePickStepProps) {
  return (
    <>
      {isError ? (
        <AlertBox
          variant="error"
          className="flex items-center justify-between gap-3"
        >
          <span>I couldn't load your templates. Want me to try again?</span>
          <LoadingButton
            variant="secondary"
            size="sm"
            isLoading={isFetching}
            loadingText="Retrying..."
            onClick={onRetry}
          >
            Retry
          </LoadingButton>
        </AlertBox>
      ) : isLoading ? (
        <div className="space-y-2" data-testid="lease-add-template-skeleton">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : available.length === 0 ? (
        <p
          className="text-sm text-muted-foreground py-4 text-center"
          data-testid="lease-add-template-empty"
        >
          You don't have any templates yet — upload one from the Lease
          Templates page first.
        </p>
      ) : (
        <ul
          className="space-y-2 max-h-72 overflow-y-auto"
          data-testid="lease-add-template-list"
        >
          {available.map((t) => {
            const checked = selectedIds.includes(t.id);
            const alreadyLinked = linkedSet.has(t.id);
            return (
              <li key={t.id}>
                <label
                  className={[
                    "w-full flex items-start gap-3 border rounded-lg px-4 py-3 transition-colors min-h-[44px] cursor-pointer",
                    checked
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50",
                  ].join(" ")}
                  data-testid={`add-template-option-${t.id}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(t)}
                    className="mt-1 h-4 w-4 cursor-pointer"
                    aria-label={`Select template ${t.name}`}
                    data-testid={`add-template-checkbox-${t.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        v{t.version}
                      </span>
                    </div>
                    {t.description ? (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {t.description}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <span>
                        {t.placeholder_count}{" "}
                        {t.placeholder_count === 1
                          ? "placeholder"
                          : "placeholders"}
                      </span>
                      {alreadyLinked ? (
                        <span className="text-[10px] uppercase tracking-wide bg-muted rounded px-1.5 py-0.5 font-medium">
                          on this lease — picking will regenerate
                        </span>
                      ) : null}
                    </p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <LoadingButton
          isLoading={isPrefilling}
          loadingText="Loading fields..."
          disabled={selectedIds.length === 0 || isPrefilling}
          onClick={onContinue}
          data-testid="lease-add-template-continue"
        >
          Continue
        </LoadingButton>
      </div>
    </>
  );
}
