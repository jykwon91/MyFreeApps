import Skeleton from "@/shared/components/ui/Skeleton";
import type { ListLoadMode } from "@/shared/types/list-load-mode";
import { LEASE_DOCUMENTS_LOCKED_NOTE } from "@mybookkeeper/api-client/constants/leaseDocumentsLocked";
import type { LeaseTemplateSummary } from "@mybookkeeper/api-client/types/lease/lease-template-summary";

export interface LeaseAddTemplatePickBodyProps {
  mode: ListLoadMode;
  available: LeaseTemplateSummary[];
  linkedSet: Set<string>;
  selectedIds: string[];
  onToggle: (template: LeaseTemplateSummary) => void;
  /** The lease is sent or signed: its templates cannot be made again. */
  isDocumentsLocked: boolean;
}

export default function LeaseAddTemplatePickBody({
  mode,
  available,
  linkedSet,
  selectedIds,
  onToggle,
  isDocumentsLocked,
}: LeaseAddTemplatePickBodyProps) {
  switch (mode) {
    case "error":
      // The step's LoadErrorAlert says the templates couldn't load.
      return null;
    case "loading":
      return (
        <div className="space-y-2" data-testid="lease-add-template-skeleton">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      );
    case "empty":
      return (
        <p
          className="text-sm text-muted-foreground py-4 text-center"
          data-testid="lease-add-template-empty"
        >
          You don't have any templates yet — upload one from the Lease
          Templates page first.
        </p>
      );
    case "list":
      return (
        <ul
          className="space-y-2 max-h-72 overflow-y-auto"
          data-testid="lease-add-template-list"
        >
          {available.map((t) => {
            const checked = selectedIds.includes(t.id);
            const alreadyLinked = linkedSet.has(t.id);
            const isBlocked = alreadyLinked && isDocumentsLocked;
            return (
              <li key={t.id}>
                <label
                  className={[
                    "w-full flex items-start gap-3 border rounded-lg px-4 py-3 transition-colors min-h-[44px]",
                    isBlocked
                      ? "opacity-60 cursor-not-allowed"
                      : checked
                        ? "border-primary bg-primary/5 cursor-pointer"
                        : "hover:bg-muted/50 cursor-pointer",
                  ].join(" ")}
                  data-testid={`add-template-option-${t.id}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(t)}
                    disabled={isBlocked}
                    aria-describedby={isBlocked ? `add-template-locked-${t.id}` : undefined}
                    className="mt-1 h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
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
                      {isBlocked ? (
                        <span
                          id={`add-template-locked-${t.id}`}
                          className="text-xs"
                          data-testid={`add-template-locked-${t.id}`}
                        >
                          {LEASE_DOCUMENTS_LOCKED_NOTE}
                        </span>
                      ) : alreadyLinked ? (
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
      );
  }
}
