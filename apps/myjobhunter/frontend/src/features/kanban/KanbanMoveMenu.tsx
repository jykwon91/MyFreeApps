/**
 * The Move control on a phone-width card: a button that opens a menu of
 * stages, with the card's current stage checked. Picking another stage asks
 * the parent to move the card; the button shows a busy state while it does.
 * Radix's menu supplies the keyboard handling, focus return and ARIA roles.
 *
 * A move re-renders the card in another stage's list, which drops focus, so
 * the parent can ask (`shouldFocus`) for the button to take focus back.
 */
import { useEffect, useRef } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import { KANBAN_COLUMN_ORDER } from "@myjobhunter/api-client/constants/kanbanColumnOrder";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import type { KanbanItem } from "@myjobhunter/api-client/types/kanban/kanban-item";
import { isKanbanColumn } from "@myjobhunter/api-client/utils/isKanbanColumn";
import { DASHBOARD_MESSAGES as MESSAGES } from "@/constants/dashboard-messages";

interface KanbanMoveMenuProps {
  item: KanbanItem;
  column: KanbanColumn;
  isMoving: boolean;
  onMove: (target: KanbanColumn) => void;
  shouldFocus: boolean;
  onFocused: () => void;
}

export default function KanbanMoveMenu({ item, column, isMoving, onMove, shouldFocus, onFocused }: KanbanMoveMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!shouldFocus) return;
    triggerRef.current?.focus();
    onFocused();
  }, [shouldFocus, onFocused]);

  function handleValueChange(value: string): void {
    if (isKanbanColumn(value) && value !== column) onMove(value);
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <LoadingButton
          ref={triggerRef}
          variant="secondary"
          size="sm"
          isLoading={isMoving}
          loadingText={MESSAGES.moving}
          aria-busy={isMoving}
          aria-label={`${MESSAGES.move} ${item.role_title}, ${item.company_name}`}
          className="shrink-0 min-w-[44px] sm:min-h-[44px]"
        >
          {MESSAGES.move}
        </LoadingButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[10rem] rounded-md border bg-card p-1 shadow-md"
        >
          <DropdownMenu.Label className="px-3 py-1.5 text-xs text-muted-foreground">
            {MESSAGES.moveTitle}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={column} onValueChange={handleValueChange}>
            {KANBAN_COLUMN_ORDER.map((target) => (
              <DropdownMenu.RadioItem
                key={target}
                value={target}
                className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded px-3 text-sm outline-none data-[highlighted]:bg-muted data-[state=checked]:font-semibold"
              >
                <span className="flex w-4 shrink-0 justify-center">
                  <DropdownMenu.ItemIndicator>
                    <Check className="w-4 h-4" aria-hidden="true" />
                  </DropdownMenu.ItemIndicator>
                </span>
                {KANBAN_COLUMN_LABELS[target]}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
